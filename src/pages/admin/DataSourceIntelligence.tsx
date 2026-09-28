import { useEffect, useMemo, useState } from "react";
import { Database, Download, FileText, Gauge, RefreshCw, Search, ShieldCheck, X } from "lucide-react";
import { listReports, type ApiReport, type ApiVerificationStatus } from "../../services/reportService";
import "./DataSourceIntelligence.css";

const PAGE_SIZE = 500;
const MAX_REPORTS = 5000;

interface SourceMetrics {
  key: string;
  name: string;
  type: string;
  reports: ApiReport[];
  verified: number;
  suspicious: number;
  unsupported: number;
  pending: number;
  verificationRate: number | null;
  lastData: string | null;
  states: Set<string>;
  districts: Set<string>;
  cities: Set<string>;
  events: Map<string, number>;
}

function sourceTypeLabel(value: string) {
  const type = value.toLowerCase();
  if (type.includes("official") || type.includes("meteorological") || type.includes("imd")) return "Official / Meteorological";
  if (type.includes("weather") || type.includes("api")) return "Weather API";
  if (type.includes("citizen")) return "Citizen";
  if (type.includes("social")) return "Social Media";
  if (type.includes("website") || type.includes("web") || type.includes("news")) return "Website / News";
  if (type.includes("public")) return "Public Dataset";
  return "Other";
}

function sourceNameFor(report: ApiReport) {
  return sourceTypeLabel(report.source_type) === "Citizen"
    ? "Citizen reports"
    : report.source_name.trim() || "Unspecified source";
}

function sourceKeyFor(report: ApiReport) {
  return `${report.source_type}:${sourceNameFor(report)}`;
}

function eventLabel(value: string) {
  const labels: Record<string, string> = {
    rainfall: "Rainfall",
    flooding: "Flooding",
    thunderstorm: "Thunderstorm",
    heatwave: "Heatwave",
    fog: "Fog",
    dust_storm: "Dust Storm",
    strong_winds: "Strong Winds",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

function makeSourceMetrics(reports: ApiReport[]): SourceMetrics[] {
  const groups = new Map<string, ApiReport[]>();
  reports.forEach((report) => {
    const key = sourceKeyFor(report);
    groups.set(key, [...(groups.get(key) ?? []), report]);
  });
  return Array.from(groups, ([key, sourceReports]) => {
    const statuses = sourceReports.reduce<Record<ApiVerificationStatus, number>>((counts, report) => {
      counts[report.verification_status] += 1;
      return counts;
    }, { PENDING: 0, VERIFIED: 0, SUSPICIOUS: 0, UNSUPPORTED: 0, VERIFIED_AND_SUBMITTED_TO_VAYU: 0 });
    const timestamps = sourceReports.map((report) => report.timestamp).filter((value) => Number.isFinite(Date.parse(value))).sort();
    return {
      key,
      name: sourceNameFor(sourceReports[0]),
      type: sourceTypeLabel(sourceReports[0].source_type),
      reports: sourceReports,
      verified: statuses.VERIFIED,
      suspicious: statuses.SUSPICIOUS,
      unsupported: statuses.UNSUPPORTED,
      pending: statuses.PENDING,
      verificationRate: sourceReports.length ? Math.round(statuses.VERIFIED * 100 / sourceReports.length) : null,
      lastData: timestamps.at(-1) ?? null,
      states: new Set(sourceReports.map((report) => report.state).filter(Boolean)),
      districts: new Set(sourceReports.map((report) => report.district).filter(Boolean)),
      cities: new Set(sourceReports.map((report) => report.city).filter(Boolean)),
      events: sourceReports.reduce<Map<string, number>>((counts, report) => {
        const event = eventLabel(report.event_type_claimed);
        counts.set(event, (counts.get(event) ?? 0) + 1);
        return counts;
      }, new Map()),
    };
  }).sort((left, right) => right.reports.length - left.reports.length);
}

function formatTimestamp(value: string | null) {
  if (!value) return "No Recent Data";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "N/A" : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function formatRate(value: number | null) {
  return value === null ? "Insufficient Data" : `${value}%`;
}

export default function DataSourceIntelligence() {
  const [reports, setReports] = useState<ApiReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sourceType, setSourceType] = useState("All Types");
  const [sourceName, setSourceName] = useState("All Sources");
  const [sourceStatus, setSourceStatus] = useState("All Statuses");
  const [eventType, setEventType] = useState("All Events");
  const [state, setState] = useState("All States");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [confidenceMin, setConfidenceMin] = useState("");
  const [confidenceMax, setConfidenceMax] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SourceMetrics | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const allReports: ApiReport[] = [];
      let reachedLimit = false;
      for (let offset = 0; offset < MAX_REPORTS; offset += PAGE_SIZE) {
        const result = await listReports({ offset, limit: PAGE_SIZE });
        if (!result.ok) throw new Error(result.error);
        allReports.push(...result.data);
        if (result.data.length < PAGE_SIZE) break;
        if (offset + PAGE_SIZE >= MAX_REPORTS) reachedLimit = true;
      }
      return { reports: allReports, truncated: reachedLimit };
    })().then((data) => {
      if (active) {
        setReports(data.reports);
        setTruncated(data.truncated);
      }
    }).catch((loadError: unknown) => {
      if (!active) return;
      setReports([]);
      setError(loadError instanceof Error ? loadError.message : "Report API is unavailable.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [refreshKey]);

  const filteredReports = useMemo(() => {
    const query = search.trim().toLowerCase();
    const minimum = confidenceMin === "" ? null : Number(confidenceMin);
    const maximum = confidenceMax === "" ? null : Number(confidenceMax);
    return reports.filter((report) => {
      const normalizedType = sourceTypeLabel(report.source_type);
      const normalizedEvent = eventLabel(report.event_type_claimed);
      const timestamp = new Date(report.timestamp).getTime();
      if (sourceType !== "All Types" && normalizedType !== sourceType) return false;
      if (sourceName !== "All Sources" && sourceKeyFor(report) !== sourceName) return false;
      if (sourceStatus !== "All Statuses" && sourceStatus !== "Unassessed") return false;
      if (eventType !== "All Events" && normalizedEvent !== eventType) return false;
      if (state !== "All States" && report.state !== state) return false;
      if (startDate && timestamp < new Date(`${startDate}T00:00:00`).getTime()) return false;
      if (endDate && timestamp > new Date(`${endDate}T23:59:59.999`).getTime()) return false;
      if (minimum !== null || maximum !== null) return false;
      if (query && ![sourceNameFor(report), normalizedType, report.state, normalizedEvent, report.verification_status].some((value) => value.toLowerCase().includes(query))) return false;
      return true;
    });
  }, [reports, sourceType, sourceName, sourceStatus, eventType, state, startDate, endDate, confidenceMin, confidenceMax, search]);

  const sources = useMemo(() => makeSourceMetrics(filteredReports), [filteredReports]);
  const allSources = useMemo(() => makeSourceMetrics(reports), [reports]);
  const verified = filteredReports.filter((report) => report.verification_status === "VERIFIED").length;
  const verificationRate = filteredReports.length ? Math.round(verified * 100 / filteredReports.length) : null;
  const sourceTypes = Array.from(new Set(allSources.map((sourceItem) => sourceItem.type))).sort();
  const sourceOptions = allSources.map((sourceItem) => ({ key: sourceItem.key, name: sourceItem.name })).sort((left, right) => left.name.localeCompare(right.name));
  const states = Array.from(new Set(reports.map((report) => report.state).filter(Boolean))).sort();
  const eventTypes = Array.from(new Set(reports.map((report) => eventLabel(report.event_type_claimed)))).sort();
  const contributionMax = Math.max(1, ...sources.map((sourceItem) => sourceItem.reports.length));
  const coverageTypes = Array.from(new Set(sources.map((sourceItem) => sourceItem.type))).sort();
  const coverageEvents = Array.from(new Set(filteredReports.map((report) => eventLabel(report.event_type_claimed)))).sort();
  const contributionTimeline = useMemo(() => {
    const byDate = new Map<string, Map<string, number>>();
    filteredReports.forEach((report) => {
      const timestamp = new Date(report.timestamp);
      if (!Number.isFinite(timestamp.getTime())) return;
      const date = timestamp.toISOString().slice(0, 10);
      const sourceKey = sourceKeyFor(report);
      const counts = byDate.get(date) ?? new Map<string, number>();
      counts.set(sourceKey, (counts.get(sourceKey) ?? 0) + 1);
      byDate.set(date, counts);
    });
    return Array.from(byDate, ([date, counts]) => ({ date, counts, total: Array.from(counts.values()).reduce((sum, count) => sum + count, 0) }))
      .sort((left, right) => left.date.localeCompare(right.date))
      .slice(-14);
  }, [filteredReports]);

  const exportCsv = () => {
    const columns = ["source", "type", "status", "confidence", "reports", "verification_rate", "duplicate_rate", "last_data", "health"];
    const rows = sources.map((sourceItem) => [
      sourceItem.name,
      sourceItem.type,
      "Unassessed",
      "N/A",
      String(sourceItem.reports.length),
      sourceItem.verificationRate === null ? "N/A" : `${sourceItem.verificationRate}%`,
      "N/A",
      sourceItem.lastData ?? "N/A",
      "N/A",
    ]);
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const csv = [columns, ...rows].map((row) => row.map(escape).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "vaankan-source-analysis.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="page-wrap source-intelligence" aria-busy={loading}>
      <div className="page-heading">
        <div><p className="eyebrow">ADMIN · INFORMATION QUALITY</p><h1>Data Source Intelligence</h1><p className="subheading">Monitor, analyse and assess the quality of weather information sources across VAANKAN.</p></div>
        <div className="source-page-actions"><span className="source-data-note">Report API · source telemetry is not connected</span><button className="outline-button" type="button" onClick={() => { setLoading(true); setError(""); setTruncated(false); setRefreshKey((key) => key + 1); }} disabled={loading}><RefreshCw size={15} />Refresh</button><button className="outline-button" type="button" onClick={exportCsv} disabled={!sources.length}><Download size={15} />Export Source Analysis</button></div>
      </div>

      {error && <div className="source-error" role="status">{error} No mock source metrics are substituted.</div>}
      {truncated && !error && <div className="source-error" role="status">Showing the first {MAX_REPORTS.toLocaleString("en-IN")} reports. Totals and source rates are partial.</div>}

      <div className="stat-grid source-kpis">
        <SourceKpi icon={Database} label="Sources with Reports" value={loading ? "—" : error ? "N/A" : sources.length} note={error ? "Report API unavailable" : "Unique sources in the filtered report set"} />
        <SourceKpi icon={FileText} label="Total Reports" value={loading ? "—" : error ? "N/A" : filteredReports.length} note={error ? "Report API unavailable" : "Report API records matching filters"} />
        <SourceKpi icon={Gauge} label="Average Source Confidence" value="N/A" note="No measured source-confidence field" />
        <SourceKpi icon={ShieldCheck} label="Verification Rate" value={error ? "N/A" : formatRate(verificationRate)} note={error ? "Report API unavailable" : `${verified} verified of ${filteredReports.length} reports`} />
      </div>

      <section className="source-filter-panel">
        <div className="source-section-heading"><div><p className="section-kicker">FILTERS</p><h2>Source records</h2></div><button className="filter-reset" type="button" onClick={() => { setSourceType("All Types"); setSourceName("All Sources"); setSourceStatus("All Statuses"); setEventType("All Events"); setState("All States"); setStartDate(""); setEndDate(""); setConfidenceMin(""); setConfidenceMax(""); setSearch(""); }}>Reset</button></div>
        <div className="source-filter-grid">
          <label>Source Type<select value={sourceType} onChange={(event) => setSourceType(event.target.value)}><option>All Types</option>{sourceTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
          <label>Source<select value={sourceName} onChange={(event) => setSourceName(event.target.value)}><option value="All Sources">All Sources</option>{sourceOptions.map((sourceItem) => <option key={sourceItem.key} value={sourceItem.key}>{sourceItem.name}</option>)}</select></label>
          <label>Status<select value={sourceStatus} onChange={(event) => setSourceStatus(event.target.value)}><option>All Statuses</option><option>Unassessed</option></select></label>
          <label>Event Type<select value={eventType} onChange={(event) => setEventType(event.target.value)}><option>All Events</option>{eventTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
          <label>State<select value={state} onChange={(event) => setState(event.target.value)}><option>All States</option>{states.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Start Date<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
          <label>End Date<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
          <label>Confidence Min<input type="number" min="0" max="100" value={confidenceMin} onChange={(event) => setConfidenceMin(event.target.value)} placeholder="N/A" /></label>
          <label>Confidence Max<input type="number" min="0" max="100" value={confidenceMax} onChange={(event) => setConfidenceMax(event.target.value)} placeholder="N/A" /></label>
          <label className="source-search">Search<Search size={14} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Source, type, state, event, status" /></label>
        </div>
        {(confidenceMin || confidenceMax) && <p className="source-filter-note">Confidence filters cannot match reports because source-confidence scores are not available.</p>}
      </section>

      <section className="panel source-table-panel">
        <div className="panel-heading"><div><p className="section-kicker">SOURCE REGISTRY</p><h2>Observed report sources</h2></div><span className="source-count">{error ? "N/A" : sources.length} sources</span></div>
        <div className="source-table-scroll"><table className="source-table"><thead><tr><th>Source</th><th>Type</th><th>Status</th><th>Confidence</th><th>Reports</th><th>Verification Rate</th><th>Duplicate Rate</th><th>Last Data</th><th>Health</th></tr></thead><tbody>
          {sources.map((sourceItem) => <tr key={sourceItem.key} onClick={() => setSelected(sourceItem)}><td><button type="button" className="source-name-button" onClick={(event) => { event.stopPropagation(); setSelected(sourceItem); }}>{sourceItem.name}</button></td><td>{sourceItem.type}</td><td><span className="source-unassessed">Unassessed</span></td><td>N/A</td><td>{sourceItem.reports.length}</td><td>{formatRate(sourceItem.verificationRate)}</td><td>N/A</td><td>{formatTimestamp(sourceItem.lastData)}</td><td>N/A</td></tr>)}
        </tbody></table>{!loading && sources.length === 0 && <div className="source-empty">{error ? "Source metrics are unavailable until the Report API responds." : "No source report records match the selected filters."}</div>}</div>
      </section>

      <div className="source-intelligence-grid">
        <section className="panel source-module"><div className="panel-heading"><div><p className="section-kicker">CONTRIBUTION</p><h2>Source Contribution</h2></div></div>
          <div className="source-bars">{sources.length ? sources.map((sourceItem) => <div className="source-bar-row" key={sourceItem.key}><div><span>{sourceItem.name}</span><strong>{sourceItem.reports.length} · {Math.round(sourceItem.reports.length * 100 / Math.max(filteredReports.length, 1))}%</strong></div><i><b style={{ width: `${sourceItem.reports.length * 100 / contributionMax}%` }} /></i></div>) : <SourceEmpty />}</div>
          <div className="source-trend-wrap"><h3>Contribution over time</h3><div className="source-table-scroll"><table className="source-trend-table"><thead><tr><th>Date</th>{sources.map((sourceItem) => <th key={sourceItem.key}>{sourceItem.name}</th>)}<th>Total</th></tr></thead><tbody>{contributionTimeline.map(({ date, counts, total }) => <tr key={date}><th>{date}</th>{sources.map((sourceItem) => <td key={sourceItem.key}>{counts.get(sourceItem.key) ?? 0}</td>)}<td>{total}</td></tr>)}</tbody></table>{!contributionTimeline.length && <SourceEmpty />}</div><p className="source-module-note">Most recent 14 dates represented in the filtered report records.</p></div>
        </section>
        <section className="panel source-module"><div className="panel-heading"><div><p className="section-kicker">VERIFICATION PERFORMANCE</p><h2>By Source</h2></div></div>
          <div className="source-table-scroll"><table className="source-compact-table"><thead><tr><th>Source</th><th>Total</th><th>Verified</th><th>Suspicious</th><th>Unsupported</th><th>Pending</th><th>Rate</th></tr></thead><tbody>{sources.map((sourceItem) => <tr key={sourceItem.key}><td>{sourceItem.name}</td><td>{sourceItem.reports.length}</td><td>{sourceItem.verified}</td><td>{sourceItem.suspicious}</td><td>{sourceItem.unsupported}</td><td>{sourceItem.pending}</td><td>{formatRate(sourceItem.verificationRate)}</td></tr>)}</tbody></table>{!sources.length && <SourceEmpty />}</div>
        </section>
        <section className="panel source-module"><div className="panel-heading"><div><p className="section-kicker">CONFIDENCE & RELIABILITY</p><h2>Reliability Trend</h2></div></div><div className="source-unavailable"><strong>Insufficient historical data</strong><span>Source confidence history is not provided by the Report API.</span></div><div className="source-confidence-breakdown">{["Historical verification", "Location consistency", "Temporal consistency", "Corroboration", "Data completeness", "Duplicate rate", "Contradiction rate"].map((label) => <div key={label}><span>{label}</span><strong>N/A</strong></div>)}</div></section>
        <section className="panel source-module"><div className="panel-heading"><div><p className="section-kicker">DUPLICATE ANALYSIS</p><h2>Duplicate / Reused Reports</h2></div></div><div className="source-metric-grid">{["Duplicate rate", "Cross-source duplicates", "Repeated reports", "Reused media", "Near-duplicate text", "Same-event duplicates"].map((label) => <div key={label}><span>{label}</span><strong>N/A</strong></div>)}</div><p className="source-module-note">The report contract does not expose duplicate or media-reuse assessments.</p></section>
        <section className="panel source-module"><div className="panel-heading"><div><p className="section-kicker">FRESHNESS & HEALTH</p><h2>Data Freshness and Source Health</h2></div></div><div className="source-metric-grid">{["Last received", "Average ingestion delay", "Current latency", "Reports per hour", "Availability", "Ingestion success", "Error rate", "Last successful ingestion"].map((label) => <div key={label}><span>{label}</span><strong>{label === "Last received" && sources.some((sourceItem) => sourceItem.lastData) ? "See registry" : "N/A"}</strong></div>)}</div><p className="source-module-note">Only report timestamps are available. Connection health, latency and ingestion telemetry are not configured.</p></section>
        <section className="panel source-module"><div className="panel-heading"><div><p className="section-kicker">GEOGRAPHIC COVERAGE</p><h2>Source Coverage</h2></div></div><p className="source-module-note">Counts describe locations in observed reports, not the provider's full geographic footprint.</p><div className="source-coverage-list">{sources.map((sourceItem) => <div key={sourceItem.key}><strong>{sourceItem.name}</strong><span>{sourceItem.states.size} states · {sourceItem.districts.size} districts · {sourceItem.cities.size} cities</span></div>)}</div>{!sources.length && <SourceEmpty />}</section>
        <section className="panel source-module source-matrix-module"><div className="panel-heading"><div><p className="section-kicker">EVENT TYPE COVERAGE</p><h2>Source Event Coverage</h2></div><span>Counts from filtered report records</span></div>
          <div className="source-table-scroll"><table className="source-matrix"><thead><tr><th>Source Type</th>{coverageEvents.map((eventName) => <th key={eventName}>{eventName}</th>)}</tr></thead><tbody>{coverageTypes.map((type) => <tr key={type}><th>{type}</th>{coverageEvents.map((eventName) => <td key={eventName}>{sources.filter((sourceItem) => sourceItem.type === type).reduce((sum, sourceItem) => sum + (sourceItem.events.get(eventName) ?? 0), 0)}</td>)}</tr>)}</tbody></table>{!coverageTypes.length && <SourceEmpty />}</div>
        </section>
        <section className="panel source-module source-matrix-module"><div className="panel-heading"><div><p className="section-kicker">QUALITY MATRIX</p><h2>Source Quality Matrix</h2></div></div>
          <div className="source-table-scroll"><table className="source-matrix"><thead><tr><th>Source</th><th>Confidence</th><th>Verification</th><th>Freshness</th><th>Coverage</th><th>Duplicate Rate</th><th>Contradiction</th></tr></thead><tbody>{sources.map((sourceItem) => <tr key={sourceItem.key}><th>{sourceItem.name}</th><td>N/A</td><td>{formatRate(sourceItem.verificationRate)}</td><td>{formatTimestamp(sourceItem.lastData)}</td><td>{sourceItem.states.size} states</td><td>N/A</td><td>N/A</td></tr>)}</tbody></table>{!sources.length && <SourceEmpty />}</div>
        </section>
      </div>

      {selected && <SourceDetail source={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}

function SourceKpi({ icon: Icon, label, value, note }: { icon: typeof Database; label: string; value: string | number; note: string }) {
  return <article className="stat-card"><Icon className="stat-icon" size={19} /><span className="stat-label">{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

function SourceEmpty() {
  return <div className="source-empty">No source records available for this view.</div>;
}

function SourceDetail({ source, onClose }: { source: SourceMetrics; onClose: () => void }) {
  return <div className="source-drawer-backdrop" role="presentation" onClick={onClose}><aside className="source-drawer" role="dialog" aria-modal="true" aria-label={`${source.name} source details`} onClick={(event) => event.stopPropagation()}>
    <div className="source-drawer-heading"><div><p className="section-kicker">SOURCE DETAIL</p><h2>{source.name}</h2><span>{source.type}</span></div><button type="button" aria-label="Close source details" onClick={onClose}><X size={18} /></button></div>
    <div className="source-detail-grid">{[
      ["Status", "Unassessed"], ["Confidence", "N/A"], ["Reports Received", String(source.reports.length)],
      ["Reports Today", String(source.reports.filter((report) => new Date(report.timestamp).toDateString() === new Date().toDateString()).length)],
      ["Verification Rate", formatRate(source.verificationRate)], ["Suspicious Rate", formatRate(source.reports.length ? Math.round(source.suspicious * 100 / source.reports.length) : null)],
      ["Unsupported Rate", formatRate(source.reports.length ? Math.round(source.unsupported * 100 / source.reports.length) : null)],
      ["Duplicate Rate", "N/A"], ["Average Latency", "N/A"], ["Last Data", formatTimestamp(source.lastData)],
      ["Geographic Coverage", `${source.states.size} states · ${source.districts.size} districts · ${source.cities.size} cities`],
      ["Event-Type Coverage", Array.from(source.events.keys()).join(", ") || "N/A"],
    ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <section className="source-detail-section"><h3>Reliability Trend</h3><p>Insufficient historical confidence data. No reliability score is inferred from report volume or verification outcomes.</p></section>
    <section className="source-detail-section"><h3>Confidence Breakdown</h3><div className="source-confidence-breakdown">{["Historical verification", "Location consistency", "Temporal consistency", "Corroboration", "Data completeness", "Duplicate rate", "Contradiction rate"].map((label) => <div key={label}><span>{label}</span><strong>N/A</strong></div>)}</div></section>
  </aside></div>;
}