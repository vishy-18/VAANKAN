import { useEffect, useMemo, useRef, useState } from "react";
import { Download, RefreshCw, X } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { DEFAULT_ANALYST_FILTERS, getAnalystDataset, type AnalystDataset, type AnalystEvent } from "../../services/analystService";
import type { AnalysisFilters } from "../admin/Analysis/types";

const EVENT_TYPES = ["All Types", "Rainfall", "Thunderstorm", "Flooding", "Heatwave", "Fog", "Dust Storm", "Strong Winds", "Cyclone", "Other"];
const SEVERITIES = ["All Severities", "Low", "Moderate", "High", "Critical"];
interface AnalystRow {
  id: string;
  title: string;
  description: string;
  type: string;
  severity: string;
  city: string;
  state: string;
  source: string;
  status: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  confidence: number | null;
  event?: AnalystEvent;
}

function normalizedType(type: string) {
  const normalized = type.toLowerCase();
  if (normalized.includes("rain")) return "Rainfall";
  if (normalized.includes("flood")) return "Flooding";
  if (normalized.includes("thunder") || normalized.includes("lightning") || normalized.includes("hail")) return "Thunderstorm";
  if (normalized.includes("heat")) return "Heatwave";
  if (normalized.includes("fog")) return "Fog";
  if (normalized.includes("dust")) return "Dust Storm";
  if (normalized.includes("wind") || normalized.includes("cyclone")) return normalized.includes("cyclone") ? "Cyclone" : "Strong Winds";
  return "Other";
}

function apiTypeForFilter(type: string): AnalysisFilters["eventType"] {
  const mapping: Record<string, string> = {
    "All Types": "All",
    Rainfall: "Heavy Rainfall",
    Thunderstorm: "Thunderstorm",
    Flooding: "Flood",
    Heatwave: "Heatwave",
    Fog: "Fog",
    "Dust Storm": "Dust Storm",
    "Strong Winds": "Strong Wind",
    Cyclone: "Cyclone",
    Other: "All",
  };
  return mapping[type] ?? "All";
}

function toRow(event: AnalystEvent): AnalystRow {
  return {
    id: event.eventId,
    title: event.title,
    description: event.evidence?.map((item) => item.detail).filter(Boolean).join(" ") || "No additional event description is available.",
    type: normalizedType(event.eventType),
    severity: event.severity,
    city: event.city,
    state: event.state,
    source: event.source,
    status: event.verificationStatus,
    timestamp: event.timestamp,
    latitude: event.latitude,
    longitude: event.longitude,
    confidence: event.isDemo ? null : event.confidence,
    event,
  };
}

function isWithinDates(timestamp: string, start: string, end: string, reference: Date) {
  const date = new Date(timestamp).getTime();
  if (!Number.isFinite(date)) return false;
  const startTime = start ? new Date(`${start}T00:00:00`).getTime() : reference.getTime() - 30 * 24 * 60 * 60 * 1000;
  const endTime = end ? new Date(`${end}T23:59:59.999`).getTime() : reference.getTime();
  return date >= startTime && date <= endTime;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function AnalystAnalysis() {
  const [datasetEvents, setDatasetEvents] = useState<AnalystEvent[]>([]);
  const [dataMode, setDataMode] = useState<AnalystDataset["mode"]>("NOT_CONNECTED");
  const [referenceTime, setReferenceTime] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [eventType, setEventType] = useState("All Types");
  const [severity, setSeverity] = useState("All Severities");
  const [state, setState] = useState("All States");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AnalystRow | null>(null);

  useEffect(() => {
    let active = true;
    const serviceFilters: AnalysisFilters = {
      ...DEFAULT_ANALYST_FILTERS,
      eventType: apiTypeForFilter(eventType),
      state: state === "All States" ? "All" : state,
      severity: severity === "All Severities" ? "All" : severity,
    };
    void getAnalystDataset(serviceFilters).then((data) => {
      if (!active) return;
      setDatasetEvents(data.events);
      setDataMode(data.mode);
      setReferenceTime(new Date(data.updatedAt));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [refreshVersion, eventType, severity, state]);

  const rows = useMemo(() => {
    const allRows = datasetEvents.map(toRow);
    const query = search.trim().toLowerCase();
    return allRows.filter((row) => {
      if (!isWithinDates(row.timestamp, startDate, endDate, referenceTime)) return false;
      if (eventType !== "All Types" && row.type !== eventType) return false;
      if (severity !== "All Severities" && row.severity !== severity) return false;
      if (state !== "All States" && row.state !== state) return false;
      if (query && ![row.title, row.description, row.city, row.state, row.type, row.severity].some((value) => value.toLowerCase().includes(query))) return false;
      return true;
    }).sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());
  }, [datasetEvents, eventType, severity, state, startDate, endDate, search, referenceTime]);

  const eventRows = rows.filter((row) => row.event);
  const activeEvents = eventRows.filter((row) => !["RESOLVED", "CLOSED", "ENDED"].includes((row.event?.eventStatus ?? "").toUpperCase()));
  const priorityEvents = eventRows.filter((row) => row.severity === "Critical" || row.severity === "High");
  const hasSeverityData = eventRows.some((row) => ["Low", "Moderate", "High", "Critical"].includes(row.severity));
  const affectedDistricts = new Set(eventRows.map((row) => row.event?.district).filter((district): district is string => Boolean(district))).size;
  const typeCounts = countBy(eventRows, (row) => row.type);
  const stateCounts = countBy(eventRows, (row) => row.state);
  const severityCounts = ["Low", "Moderate", "High", "Critical"].map((label) => ({ label, count: eventRows.filter((row) => row.severity === label).length }));
  const cityCounts = countBy(eventRows, (row) => row.city).slice(0, 7);
  const dailyCounts = countBy(eventRows, (row) => new Date(row.timestamp).toISOString().slice(0, 10)).sort(([a], [b]) => a.localeCompare(b));
  const states = ["All States", ...Array.from(new Set(datasetEvents.map((row) => row.state))).sort()];

  const refresh = () => { setLoading(true); setRefreshVersion((version) => version + 1); };
  const exportCsv = () => {
    const columns = ["event", "type", "severity", "city", "state", "source", "status", "reported"];
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const content = [columns.join(","), ...rows.map((row) => [row.title, row.type, row.severity, row.city, row.state, row.source, row.status, row.timestamp].map(escape).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "vaankan-filtered-events.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="analyst-analysis" aria-busy={loading}>
      <div className="analyst-page-heading">
        <div><h1>Analysis</h1><p>Deep insights into weather event patterns across India</p></div>
        <div className="analyst-analysis-actions"><button type="button" onClick={refresh} disabled={loading}><RefreshCw size={15} />Refresh</button><button type="button" onClick={exportCsv}><Download size={15} />Export CSV</button></div>
      </div>
      <p className="analyst-data-note">Data source: {dataMode} · Reports come from PostgreSQL; weather feeds depend on configured providers.</p>

      <section className="analyst-filter-panel">
        <div className="analyst-analysis-section-heading"><div><p className="analyst-eyebrow">FILTERS</p><h2>Weather events</h2></div><button className="analyst-reset-filter" onClick={() => { setEventType("All Types"); setSeverity("All Severities"); setState("All States"); setStartDate(""); setEndDate(""); setSearch(""); }}>Reset</button></div>
        <div className="analyst-filter-grid">
          <label>Event Type<select value={eventType} onChange={(event) => setEventType(event.target.value)}>{EVENT_TYPES.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Severity<select value={severity} onChange={(event) => setSeverity(event.target.value)}>{SEVERITIES.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>State<select value={state} onChange={(event) => setState(event.target.value)}>{states.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Start Date<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
          <label>End Date<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
          <label className="analyst-search-label">Search<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search events..." /></label>
        </div>
      </section>

      <section className="analyst-analysis-insights">
        <div className="analyst-analysis-section-heading"><div><p className="analyst-eyebrow">WEATHER OVERVIEW</p><h2>Event summary</h2></div></div>
        <div className="analyst-insight-grid">
          <AnalysisInsight label="Active Events" value={activeEvents.length} note="Not marked resolved, closed, or ended" />
          <AnalysisInsight label="High / Critical Events" value={eventRows.length && !hasSeverityData ? "N/A" : priorityEvents.length} note={hasSeverityData ? "Based on available event severity" : "Severity assessment is not available"} />
          <AnalysisInsight label="Affected Districts" value={affectedDistricts} note="Unique districts represented in filtered events" />
          <AnalysisInsight label="Anomalies Detected" value="N/A" note="No calibrated anomaly threshold is connected" />
        </div>
      </section>

      <section className="analyst-analysis-grid">
        <div className="analyst-panel"><PanelHeading title="Events by Type" /><HorizontalChart rows={typeCounts} /></div>
        <div className="analyst-panel"><PanelHeading title="Events Over Time" label="DAILY" /><DailyChart rows={dailyCounts} /></div>
        <div className="analyst-panel"><PanelHeading title="Geographic Distribution" label="CURRENT EVENT COORDINATES" /><AnalysisMap rows={eventRows} onSelect={setSelected} /></div>
        <div className="analyst-panel"><PanelHeading title="Top States" /><DonutChart rows={stateCounts.slice(0, 6)} /></div>
        <div className="analyst-panel"><PanelHeading title="Severity Distribution" />{eventRows.length && !hasSeverityData ? <EmptyState message="Severity assessment is unavailable for these events." /> : <HorizontalChart rows={severityCounts.map(({ label, count }) => [label, count] as [string, number])} />}</div>
        <div className="analyst-panel"><PanelHeading title="Top Cities by Event Count" /><RankedList rows={cityCounts} /></div>
        <div className="analyst-panel analyst-comparison-panel"><PanelHeading title="Event Type Comparison" /><HorizontalChart rows={typeCounts} /></div>
      </section>

      <section className="analyst-panel analyst-table-panel">
        <PanelHeading title="Weather Events" label={`${rows.length} MATCHING RECORDS`} />
        <div className="analyst-table-scroll"><table className="analyst-event-table"><thead><tr><th>Event</th><th>Type</th><th>Severity</th><th>City</th><th>State</th><th>Source</th><th>Status</th><th>Reported</th></tr></thead><tbody>
          {rows.map((row) => <tr key={row.id} onClick={() => setSelected(row)}><td><strong>{row.title}</strong><small>{row.description}</small></td><td>{row.type}</td><td><span className={`analyst-severity severity-${row.severity.toLowerCase()}`}>{row.severity}</span></td><td>{row.city}</td><td>{row.state}</td><td>{row.source}</td><td><span className={`analyst-status status-${row.status.toLowerCase()}`}>{row.status}</span></td><td>{formatDate(row.timestamp)}</td></tr>)}
        </tbody></table>{!rows.length && <div className="analyst-empty">No records match the selected filters.</div>}</div>
      </section>

      {selected && <ReadOnlyEventDetail row={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}

function countBy<T>(rows: T[], getKey: (row: T) => string): [string, number][] {
  const counts = rows.reduce<Record<string, number>>((result, row) => {
    const key = getKey(row);
    result[key] = (result[key] ?? 0) + 1;
    return result;
  }, {});
  return Object.entries(counts).sort((left, right) => right[1] - left[1]);
}

function AnalysisInsight({ label, value, note }: { label: string; value: string | number; note: string }) {
  return <article className="analyst-insight"><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

function PanelHeading({ title, label }: { title: string; label?: string }) {
  return <div className="analyst-panel-heading"><h3>{title}</h3>{label && <span>{label}</span>}</div>;
}

function EmptyState({ message }: { message: string }) {
  return <div className="analyst-empty">{message}</div>;
}

function HorizontalChart({ rows }: { rows: [string, number][] }) {
  const max = Math.max(1, ...rows.map((row) => row[1]));
  return <div className="analyst-bars">{rows.length ? rows.map(([label, count]) => <div className="analyst-horizontal-item" key={label}><div><span>{label}</span><strong>{count}</strong></div><i><b style={{ width: `${count * 100 / max}%` }} /></i></div>) : <EmptyState message="No data for the current filters." />}</div>;
}

function DailyChart({ rows }: { rows: [string, number][] }) {
  if (!rows.length) return <EmptyState message="No daily event data in the selected window." />;
  const width = 600;
  const height = 210;
  const max = Math.max(1, ...rows.map((row) => row[1]));
  const points = rows.map(([, count], index) => `${rows.length === 1 ? width / 2 : 22 + index * (width - 44) / (rows.length - 1)},${height - 24 - count * (height - 50) / max}`);
  const line = points.join(" ");
  return <div className="analyst-daily-chart"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Daily event count line chart"><line x1="22" y1={height - 24} x2={width - 15} y2={height - 24} /><polyline points={line} /><g>{points.map((point, index) => { const [cx, cy] = point.split(","); return <circle key={rows[index][0]} cx={cx} cy={cy} r="4"><title>{rows[index][0]} · {rows[index][1]} events</title></circle>; })}</g></svg><div className="analyst-chart-axis"><span>{rows[0][0]}</span><span>{rows[rows.length - 1][0]}</span></div></div>;
}

function DonutChart({ rows }: { rows: [string, number][] }) {
  const total = rows.reduce((sum, row) => sum + row[1], 0);
  if (!total) return <EmptyState message="No data for the current filters." />;
  const colors = ["#45bfd0", "#4e91dc", "#69c69c", "#f0a14a", "#e9655d", "#a28bdd"];
  const segments = rows.reduce<{ stops: string[]; offset: number }>((state, [, value], index) => {
    const nextOffset = state.offset + value * 100 / total;
    return {
      stops: [...state.stops, `${colors[index % colors.length]} ${state.offset}% ${nextOffset}%`],
      offset: nextOffset,
    };
  }, { stops: [], offset: 0 }).stops;
  return <div className="analyst-donut-layout"><div className="analyst-donut" style={{ background: `conic-gradient(${segments.join(",")})` }}><span>{total}</span></div><div className="analyst-donut-legend">{rows.map(([label, count], index) => <span key={label}><i style={{ background: colors[index % colors.length] }} />{label}<b>{count}</b></span>)}</div></div>;
}

function RankedList({ rows }: { rows: [string, number][] }) {
  const max = Math.max(1, ...rows.map((row) => row[1]));
  return <div className="analyst-ranked-list">{rows.length ? rows.map(([label, count], index) => <div key={label}><span className="analyst-rank">{index + 1}</span><span className="analyst-city">{label}<i><b style={{ width: `${count * 100 / max}%` }} /></i></span><strong>{count}</strong></div>) : <EmptyState message="No cities in the current results." />}</div>;
}

function AnalysisMap({ rows, onSelect }: { rows: AnalystRow[]; onSelect: (row: AnalystRow) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { center: [22.8, 80.5], zoom: 4.4, zoomControl: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 13, attribution: "© OpenStreetMap contributors" }).addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.eachLayer((layer) => { if (layer instanceof L.CircleMarker || layer instanceof L.Marker) layer.remove(); });
    rows.forEach((row) => {
      const color = row.severity === "Critical" ? "#ed625b" : row.severity === "High" ? "#f0a14a" : row.severity === "Moderate" ? "#45bfd0" : "#7b9aaa";
      L.circleMarker([row.latitude, row.longitude], { radius: row.status === "VERIFIED" ? 9 : 6, color, fillColor: color, fillOpacity: 0.82, weight: 2 })
        .addTo(map)
        .bindPopup(`<strong>${row.title}</strong><br>${row.type} · ${row.severity}<br>${row.city}, ${row.state}<br>${row.status} · ${row.source}`)
        .on("click", () => onSelect(row));
    });
  }, [rows, onSelect]);
  return <div className="analyst-analysis-map" ref={containerRef} />;
}

function ReadOnlyEventDetail({ row, onClose }: { row: AnalystRow; onClose: () => void }) {
  return (
    <div className="analyst-dialog-backdrop" role="presentation" onClick={onClose}>
      <section className="analyst-event-dialog" role="dialog" aria-modal="true" aria-label="Analyst event details" onClick={(event) => event.stopPropagation()}>
        <button className="analyst-dialog-close" onClick={onClose} aria-label="Close"><X size={17} /></button>
        <p className="analyst-eyebrow">READ-ONLY ANALYST VIEW</p>
        <h2>{row.title}</h2>
        <p>{row.city}, {row.state}</p>
        <p className="analyst-event-description">{row.description}</p>
        <div className="analyst-dialog-facts">
          <span>Type<strong>{row.type}</strong></span><span>Severity<strong>{row.severity}</strong></span>
          <span>Source<strong>{row.source}</strong></span><span>Status<strong>{row.status}</strong></span>
          <span>Reported<strong>{formatDate(row.timestamp)}</strong></span><span>Location<strong>{row.latitude.toFixed(4)}, {row.longitude.toFixed(4)}</strong></span>
        </div>
        <div className="analyst-detail-intelligence">
          <section><h3>VISTA Information</h3><p>{row.event ? `Event status: ${row.event.verificationStatus}. Automated VISTA assessment is not connected.` : "No VISTA information is available."}</p></section>
          <section><h3>VAYU Information</h3><p>Lifecycle: {row.event?.eventStatus ?? "N/A"} · Confidence: {row.event?.confidence === null || row.event?.confidence === undefined ? "N/A" : row.event.confidence} · Anomaly score: {row.event?.anomalyScore === null || row.event?.anomalyScore === undefined ? "N/A" : row.event.anomalyScore} · Affected radius: {row.event?.affectedRadiusKm === null || row.event?.affectedRadiusKm === undefined ? "N/A" : `${row.event.affectedRadiusKm} km`}</p></section>
        </div>
        {row.event?.evidence?.map((item) => <p key={item.name}><strong>{item.type}:</strong> {item.detail}</p>)}
        <small>Administrative verification controls are only available in Admin Portal.</small>
      </section>
    </div>
  );
}
