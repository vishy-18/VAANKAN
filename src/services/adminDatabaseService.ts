export interface DatabaseColumn {
  name: string;
  type: string;
  nullable: boolean;
  primary_key: boolean;
}

export interface DatabaseTable {
  name: string;
  row_count: number;
  columns: DatabaseColumn[];
  primary_key: string[];
  deletable: boolean;
}

export interface DatabaseRows {
  table: string;
  columns: string[];
  primary_key: string[];
  rows: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8001";

async function databaseRequest<T>(path: string, key: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Database-Key": key,
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => ({})) as { detail?: string };
  if (!response.ok) {
    throw new Error(payload.detail ?? `Database request failed (${response.status})`);
  }
  return payload as T;
}

export function listDatabaseTables(key: string): Promise<{ tables: DatabaseTable[]; storage: string }> {
  return databaseRequest("/api/admin/database/tables", key);
}

export function listDatabaseRows(key: string, table: string, offset: number, limit = 50): Promise<DatabaseRows> {
  const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  return databaseRequest(`/api/admin/database/tables/${encodeURIComponent(table)}/rows?${params}`, key);
}

export function deleteDatabaseRow(
  key: string,
  table: string,
  primaryKey: Record<string, unknown>,
): Promise<{ deleted: boolean; table: string; primary_key: Record<string, unknown> }> {
  return databaseRequest(`/api/admin/database/tables/${encodeURIComponent(table)}/rows`, key, {
    method: "DELETE",
    body: JSON.stringify(primaryKey),
  });
}