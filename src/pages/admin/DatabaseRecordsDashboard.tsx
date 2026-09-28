import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ChevronLeft, ChevronRight, Database, KeyRound, LoaderCircle, RefreshCw, Search, ShieldCheck, Trash2 } from "lucide-react";
import {
  deleteDatabaseRow,
  listDatabaseRows,
  listDatabaseTables,
  type DatabaseRows,
  type DatabaseTable,
} from "../../services/adminDatabaseService";
import "./DatabaseRecordsDashboard.css";

const PAGE_SIZE = 50;

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function DatabaseRecordsDashboard() {
  const [databaseKey, setDatabaseKey] = useState("");
  const [connectedKey, setConnectedKey] = useState("");
  const [tables, setTables] = useState<DatabaseTable[]>([]);
  const [activeTable, setActiveTable] = useState("");
  const [records, setRecords] = useState<DatabaseRows | null>(null);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadTables = async (key: string, preferredTable = "") => {
    setLoading(true);
    setError("");
    try {
      const result = await listDatabaseTables(key);
      setTables(result.tables);
      const nextTable = result.tables.some((table) => table.name === preferredTable)
        ? preferredTable
        : result.tables[0]?.name ?? "";
      setActiveTable(nextTable);
      setConnectedKey(key);
      setOffset(0);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load database tables");
      setTables([]);
      setRecords(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!connectedKey || !activeTable) {
      setRecords(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    void listDatabaseRows(connectedKey, activeTable, offset, PAGE_SIZE)
      .then((result) => {
        if (!cancelled) setRecords(result);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Could not load records");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connectedKey, activeTable, offset]);

  const filteredRows = useMemo(() => {
    if (!records) return [];
    const query = search.trim().toLocaleLowerCase();
    if (!query) return records.rows;
    return records.rows.filter((row) =>
      Object.values(row).some((value) => formatValue(value).toLocaleLowerCase().includes(query)),
    );
  }, [records, search]);

  const handleDelete = async (row: Record<string, unknown>) => {
    if (!records || !connectedKey || !window.confirm(`Permanently delete this row from ${records.table}?`)) return;
    const keyValues = Object.fromEntries(records.primary_key.map((key) => [key, row[key]]));
    setLoading(true);
    setError("");
    setNotice("");
    try {
      await deleteDatabaseRow(connectedKey, records.table, keyValues);
      setNotice("Record deleted and the action was written to the audit log.");
      await loadTables(connectedKey, records.table);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete record");
      setLoading(false);
    }
  };

  const selectedTable = tables.find((table) => table.name === activeTable);

  return (
    <section className="database-records-page">
      <div className="database-records-heading">
        <div>
          <p className="section-kicker">ADMINISTRATION / PERSISTENCE</p>
          <h1>Database records</h1>
          <p>Inspect the live records stored by VAANKAN.</p>
        </div>
        <div className="database-storage-state"><span /> PostgreSQL</div>
      </div>

      {!connectedKey ? (
        <form className="database-connect" onSubmit={(event) => { event.preventDefault(); void loadTables(databaseKey); }}>
          <div className="database-connect-icon"><KeyRound size={18} /></div>
          <div className="database-connect-copy">
            <strong>Connect to the configured database</strong>
            <span>The server must have persistent PostgreSQL storage and a VAANKAN_ADMIN_DATABASE_KEY configured.</span>
          </div>
          <label className="database-key-field">
            <span>Admin database key</span>
            <input value={databaseKey} onChange={(event) => setDatabaseKey(event.target.value)} type="password" autoComplete="off" required />
          </label>
          <button className="database-connect-button" type="submit" disabled={loading || !databaseKey}>
            {loading ? <LoaderCircle size={15} className="database-spin" /> : <ShieldCheck size={15} />}
            Connect
          </button>
        </form>
      ) : (
        <div className="database-workspace">
          <aside className="database-table-list">
            <div className="database-list-heading">
              <span>TABLES <b>{tables.length}</b></span>
              <button type="button" title="Refresh tables" aria-label="Refresh tables" onClick={() => void loadTables(connectedKey, activeTable)}><RefreshCw size={15} /></button>
            </div>
            <div className="database-table-scroll">
              {tables.map((table) => (
                <button className={`database-table-option ${table.name === activeTable ? "active" : ""}`} key={table.name} type="button" onClick={() => { setActiveTable(table.name); setOffset(0); setSearch(""); }}>
                  <Database size={15} />
                  <span>{table.name}</span>
                  <small>{table.row_count.toLocaleString()}</small>
                </button>
              ))}
            </div>
          </aside>

          <div className="database-record-view">
            <div className="database-record-toolbar">
              <div>
                <span className="database-table-name">{activeTable || "Select a table"}</span>
                {selectedTable && <span className="database-schema-count">{selectedTable.columns.length} columns · {selectedTable.row_count.toLocaleString()} records</span>}
              </div>
              <label className="database-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this page" /></label>
            </div>

            {selectedTable && (
              <div className="database-schema-strip">
                {selectedTable.columns.map((column) => (
                  <span key={column.name} title={`${column.type}${column.nullable ? " · nullable" : " · required"}`}>
                    {column.primary_key && <b>PK</b>}{column.name}<small>{column.type}</small>
                  </span>
                ))}
              </div>
            )}

            {error && <div className="database-message error"><AlertCircle size={16} />{error}{!connectedKey && <span> Confirm backend storage and admin-key configuration.</span>}</div>}
            {notice && <div className="database-message success"><ShieldCheck size={16} />{notice}</div>}

            <div className="database-table-wrap">
              {loading && <div className="database-loading"><LoaderCircle className="database-spin" size={20} />Loading records</div>}
              {!loading && records && (
                <table className="database-record-table">
                  <thead><tr>{records.columns.map((column) => <th key={column}>{column}</th>)}<th className="database-action-heading">Actions</th></tr></thead>
                  <tbody>
                    {filteredRows.map((row, index) => (
                      <tr key={records.primary_key.map((key) => formatValue(row[key])).join("/") || index}>
                        {records.columns.map((column) => <td key={column} title={formatValue(row[column])}>{formatValue(row[column])}</td>)}
                        <td className="database-row-action">
                          {selectedTable?.deletable ? <button type="button" title="Delete row" aria-label="Delete row" onClick={() => void handleDelete(row)}><Trash2 size={15} /></button> : <span title="This table is read-only">Read only</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {!loading && records && filteredRows.length === 0 && <div className="database-empty">No records match this page search.</div>}
              {!connectedKey && !error && <div className="database-empty">Connect to the configured database to inspect its tables.</div>}
            </div>

            {records && <div className="database-pagination">
              <span>Showing {records.total === 0 ? 0 : offset + 1}–{Math.min(offset + records.rows.length, records.total)} of {records.total.toLocaleString()}</span>
              <div>
                <button type="button" disabled={offset === 0 || loading} aria-label="Previous page" onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}><ChevronLeft size={16} /></button>
                <button type="button" disabled={offset + PAGE_SIZE >= records.total || loading} aria-label="Next page" onClick={() => setOffset(offset + PAGE_SIZE)}><ChevronRight size={16} /></button>
              </div>
            </div>}
          </div>
        </div>
      )}
    </section>
  );
}