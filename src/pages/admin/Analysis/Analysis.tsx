/**
 * Analysis Page — VAYU National Weather Intelligence & Analytics Platform
 *
 * Admin Portal → Analysis (sidebar label MUST stay "Analysis")
 * Internally powered by: VAYU Weather Intelligence & Analytics Engine v0.1
 *
 * Sub-tabs:
 *  0. Overview
 *  1. Weather Events
 *  2. Precipitation & Storms
 *  3. Temperature & Wind
 *  4. Flood & Drought
 *  5. Anomalies & Climate
 *  6. Citizen & AI Intelligence
 *  7. Data Quality
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart2,
  Brain,
  CloudRain,
  Database,
  Download,
  Droplets,
  Filter,
  Flame,
  RefreshCw,
  ShieldCheck,
  Thermometer,
  Users,
  Wind,
  X,
} from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./Analysis.css";
import type {
  AnalysisFilters,
  AnalyticsSummary,
  CitizenAnalysisReport,
  WeatherAnomaly,
  WeatherEvent,
  WeatherObservation,
} from "./types";
import vayuService from "./services/vayuService";

// ─────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────

const DEFAULT_FILTERS: AnalysisFilters = {
  dateRange: "Last 7 days",
  eventType: "All",
  state: "All",
  district: "All",
  severity: "All",
  dataSource: "All",
  verificationStatus: "All",
};

const STATES = [
  "All", "Andhra Pradesh", "Assam", "Karnataka", "Kerala",
  "Maharashtra", "Odisha", "Punjab", "Rajasthan", "Tamil Nadu",
];

const EVENT_TYPES = [
  "All", "Heavy Rainfall", "Thunderstorm", "Flood", "Heatwave",
  "Fog", "Dust Storm", "Strong Wind", "Lightning", "Hailstorm", "Cyclone",
];

const SEVERITIES = ["All", "Low", "Moderate", "High", "Critical"];
const DATE_RANGES = ["Today", "Last 24 hours", "Last 7 days", "Last 30 days"];
const DATA_SOURCES = ["All", "Weather API", "IMD", "Public Dataset", "Citizen", "Social Media", "Satellite", "Radar"];
const VSTATUS_OPTIONS = ["All", "VERIFIED", "PENDING", "SUSPICIOUS", "UNSUPPORTED"];

// ─────────────────────────────────────────────────────────────────
// Severity colour mapping helpers
// ─────────────────────────────────────────────────────────────────

function severityClass(s: string): string {
  switch (s.toLowerCase()) {
    case "critical": return "critical";
    case "high": return "high";
    case "moderate": return "moderate";
    default: return "low";
  }
}

function verificationClass(s: string): string {
  switch (s.toUpperCase()) {
    case "VERIFIED": return "verified";
    case "PENDING": return "pending";
    case "SUSPICIOUS": return "suspicious";
    default: return "unsupported";
  }
}

function eventIconColour(type: string): string {
  switch (type) {
    case "Heavy Rainfall":
    case "Flood": return "cyan";
    case "Heatwave":
    case "Dust Storm": return "coral";
    case "Thunderstorm":
    case "Lightning":
    case "Hailstorm": return "amber";
    default: return "navy";
  }
}

function formatIST(isoString: string): string {
  return new Date(isoString).toLocaleString("en-IN", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }) + " IST";
}

// ─────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────

/** Inline SVG Donut Chart (no external library needed) */
function DonutChart({
  data,
  colours,
}: {
  data: { label: string; value: number }[];
  colours: string[];
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0) || 1;

  const paths = data.reduce<{ segments: ReactNode[]; currentAngle: number }>(
    (acc, item, i) => {
      const pct = item.value / total;
      const angle = pct * 360;
      const start = acc.currentAngle;
      const end = acc.currentAngle + angle;
      const toRad = (deg: number) => (deg * Math.PI) / 180;
      const cx = 60, cy = 60, r = 48, inner = 28;
      const x1 = cx + r * Math.cos(toRad(start));
      const y1 = cy + r * Math.sin(toRad(start));
      const x2 = cx + r * Math.cos(toRad(end));
      const y2 = cy + r * Math.sin(toRad(end));
      const ix1 = cx + inner * Math.cos(toRad(start));
      const iy1 = cy + inner * Math.sin(toRad(start));
      const ix2 = cx + inner * Math.cos(toRad(end));
      const iy2 = cy + inner * Math.sin(toRad(end));
      const large = angle > 180 ? 1 : 0;

      return {
        currentAngle: end,
        segments: [
          ...acc.segments,
          <path
            key={item.label}
            d={`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${inner} ${inner} 0 ${large} 0 ${ix1} ${iy1} Z`}
            fill={colours[i % colours.length]}
            stroke="#fff"
            strokeWidth={1.5}
          />,
        ],
      };
    },
    { segments: [], currentAngle: -90 },
  ).segments;

  return (
    <div className="vayu-donut-wrap">
      <svg viewBox="0 0 120 120" width={110} height={110}>
        {paths}
        <text x="60" y="65" textAnchor="middle" fontSize={13} fontFamily="DM Mono, monospace" fill="#334" fontWeight={500}>
          {total}
        </text>
      </svg>
      <div className="vayu-donut-legend">
        {data.map((item, i) => (
          <div key={item.label} className="vayu-donut-legend-item">
            <span className="vayu-donut-legend-dot" style={{ background: colours[i % colours.length] }} />
            <span style={{ fontSize: 11, color: "#5a6e70" }}>{item.label}</span>
            <span style={{ marginLeft: "auto", fontFamily: "DM Mono, monospace", fontSize: 10, color: "#8a9a9c" }}>{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Bar Chart List */
function BarList({
  data,
  colour = "cyan",
}: {
  data: { label: string; value: number; suffix?: string }[];
  colour?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <ul className="vayu-bar-list">
      {data.map((item) => (
        <li key={item.label} className="vayu-bar-item">
          <div className="vayu-bar-row">
            <strong>{item.label}</strong>
            <span>{item.value}{item.suffix ?? ""}</span>
          </div>
          <div className="vayu-bar-track">
            <div
              className={`vayu-bar-fill ${colour}`}
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Leaflet map for Analysis — shows weather events */
function AnalysisMap({ events }: { events: WeatherEvent[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [20.5937, 78.9629],
      zoom: 5,
      zoomControl: true,
      attributionControl: false,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 13,
    }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // Clear existing markers
    map.eachLayer((layer) => {
      if (layer instanceof L.CircleMarker || layer instanceof L.Marker) {
        layer.remove();
      }
    });

    events.forEach((evt) => {
      const colour =
        evt.severity === "Critical" ? "#c62828" :
        evt.severity === "High" ? "#e26b5d" :
        evt.severity === "Moderate" ? "#c78c27" : "#32b7c8";

      L.circleMarker([evt.latitude, evt.longitude], {
        radius: evt.severity === "Critical" ? 14 : evt.severity === "High" ? 11 : 8,
        fillColor: colour,
        color: "#fff",
        weight: 1.5,
        opacity: 1,
        fillOpacity: 0.75,
      })
        .addTo(map)
        .bindPopup(
          `<strong>${evt.title}</strong><br/>` +
          `${evt.city}, ${evt.state}<br/>` +
          `<span style="font-size:11px;color:#666">${evt.eventType} · ${evt.severity} · Conf: ${evt.confidence}%</span>`,
          { maxWidth: 260 },
        );
    });
  }, [events]);

  return <div ref={containerRef} style={{ height: "100%", width: "100%" }} />;
}

/** Event Drawer */
function EventDrawer({
  event,
  onClose,
}: {
  event: WeatherEvent;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"overview" | "evidence" | "ai" | "timeline">("overview");

  return (
    <div className="vayu-drawer-overlay" onClick={onClose}>
      <div className="vayu-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="vayu-drawer-header">
          <div>
            <p className="vayu-eyebrow" style={{ margin: "0 0 4px" }}>
              {event.eventId} · {event.source}
            </p>
            <h2>{event.title}</h2>
            <span className={`vayu-severity ${severityClass(event.severity)}`}>
              {event.severity}
            </span>{" "}
            <span className={`vayu-vstatus ${verificationClass(event.verificationStatus)}`}>
              {event.verificationStatus}
            </span>
          </div>
          <button className="vayu-drawer-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="vayu-drawer-tabs">
          {(["overview", "evidence", "ai", "timeline"] as const).map((t) => (
            <button
              key={t}
              className={`vayu-drawer-tab ${tab === t ? "active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t === "ai" ? "AI Analysis" : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="vayu-drawer-body">
          {tab === "overview" && (
            <>
              <div className="vayu-drawer-section">
                <h3>Event Metrics</h3>
                <div className="vayu-meta-grid">
                  <div className="vayu-meta-item">
                    <label>Location</label>
                    <span>{event.city}, {event.district}, {event.state}</span>
                  </div>
                  <div className="vayu-meta-item">
                    <label>Timestamp (IST)</label>
                    <span>{formatIST(event.timestamp)}</span>
                  </div>
                  <div className="vayu-meta-item">
                    <label>Rainfall</label>
                    <span style={{ fontFamily: "DM Mono, monospace" }}>{event.rainfallMm} mm</span>
                  </div>
                  <div className="vayu-meta-item">
                    <label>Temperature</label>
                    <span style={{ fontFamily: "DM Mono, monospace" }}>{event.temperatureC}°C</span>
                  </div>
                  <div className="vayu-meta-item">
                    <label>Wind Speed</label>
                    <span style={{ fontFamily: "DM Mono, monospace" }}>{event.windSpeedKmh} km/h</span>
                  </div>
                  {event.visibilityKm !== undefined && (
                    <div className="vayu-meta-item">
                      <label>Visibility</label>
                      <span style={{ fontFamily: "DM Mono, monospace" }}>{event.visibilityKm} km</span>
                    </div>
                  )}
                  <div className="vayu-meta-item">
                    <label>Affected Radius</label>
                    <span style={{ fontFamily: "DM Mono, monospace" }}>{event.affectedRadiusKm} km</span>
                  </div>
                  <div className="vayu-meta-item">
                    <label>Total Reports</label>
                    <span style={{ fontFamily: "DM Mono, monospace" }}>{event.reportCount}</span>
                  </div>
                </div>
              </div>
              <div className="vayu-drawer-section">
                <h3>VAYU Confidence Score</h3>
                <div className="vayu-confidence-bar">
                  <span style={{ fontFamily: "DM Mono, monospace", fontSize: 11 }}>{event.confidence}%</span>
                  <div className="vayu-conf-track">
                    <div className="vayu-conf-fill" style={{ width: `${event.confidence}%` }} />
                  </div>
                </div>
              </div>
              <div className="vayu-drawer-section">
                <h3>Anomaly Score</h3>
                <div className="vayu-confidence-bar">
                  <span style={{ fontFamily: "DM Mono, monospace", fontSize: 11 }}>{(event.anomalyScore * 100).toFixed(0)}%</span>
                  <div className="vayu-conf-track">
                    <div className="vayu-score-fill" style={{ width: `${event.anomalyScore * 100}%` }} />
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === "evidence" && (
            <div className="vayu-drawer-section">
              <h3>Evidence Files</h3>
              {event.evidence?.length ? (
                event.evidence.map((ev, i) => (
                  <div key={i} className="vayu-evidence-item">
                    <span className="vayu-evidence-type">{ev.type}</span>
                    <strong>{ev.name}</strong>
                    <small>{ev.detail}</small>
                  </div>
                ))
              ) : (
                <p style={{ color: "#8a9a9c", fontSize: 12 }}>No evidence files attached to this event (demo data).</p>
              )}
            </div>
          )}

          {tab === "ai" && (
            <div className="vayu-drawer-section">
              <div
                style={{
                  background: "#fff8e6",
                  border: "1px solid #e8c96a",
                  padding: "12px 14px",
                  marginBottom: 14,
                  fontSize: 11,
                  color: "#8a6020",
                  fontFamily: "DM Mono, monospace",
                }}
              >
                ⚠ DEMO DATA — VAYU & VISTA models are NOT TRAINED. Analysis shown is illustrative only.
              </div>
              <h3>VAYU Spatial Analysis (Mock)</h3>
              <div className="vayu-meta-grid" style={{ marginBottom: 16 }}>
                <div className="vayu-meta-item">
                  <label>VAYU Score</label>
                  <span style={{ fontFamily: "DM Mono, monospace" }}>{event.anomalyScore.toFixed(2)}</span>
                </div>
                <div className="vayu-meta-item">
                  <label>VISTA Corroboration</label>
                  <span style={{ fontFamily: "DM Mono, monospace", color: "#8a9a9c" }}>NOT TRAINED</span>
                </div>
                <div className="vayu-meta-item">
                  <label>Spatial Cluster</label>
                  <span style={{ fontFamily: "DM Mono, monospace" }}>{event.affectedRadiusKm.toFixed(1)} km</span>
                </div>
                <div className="vayu-meta-item">
                  <label>Source Trust</label>
                  <span style={{ fontFamily: "DM Mono, monospace" }}>{event.source}</span>
                </div>
              </div>
              <h3>Verified / Suspicious Report Breakdown</h3>
              <BarList
                data={[
                  { label: "Verified", value: event.verifiedReportCount },
                  { label: "Suspicious", value: event.suspiciousReportCount },
                  { label: "Unreviewed", value: event.reportCount - event.verifiedReportCount - event.suspiciousReportCount },
                ]}
                colour="cyan"
              />
            </div>
          )}

          {tab === "timeline" && (
            <div className="vayu-drawer-section">
              <h3>Event Timeline</h3>
              {event.timeline?.length ? (
                <ul className="vayu-timeline">
                  {event.timeline.map((step, i) => (
                    <li key={i}>
                      <div className="vayu-tl-dot" />
                      <div>
                        <div className="vayu-tl-time">{step.time}</div>
                        <div className="vayu-tl-event">{step.event}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ color: "#8a9a9c", fontSize: 12 }}>No timeline data for this event (demo data).</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Main Analysis Page
// ─────────────────────────────────────────────────────────────────

interface AnalysisPageProps {
  /** Injected from AdminApp — forwarded into filters for sync */
  filters?: { period: string; event: string; region: string; status: string };
  /** Suppress unused warning */
  setFilters?: (f: { period: string; event: string; region: string; status: string }) => void;
  visibleReports?: unknown[];
  onAction?: (msg: string) => void;
}

export default function AnalysisPage({ onAction }: AnalysisPageProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [filters, setFilters] = useState<AnalysisFilters>(DEFAULT_FILTERS);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [events, setEvents] = useState<WeatherEvent[]>([]);
  const [anomalies, setAnomalies] = useState<WeatherAnomaly[]>([]);
  const [citizenReports, setCitizenReports] = useState<CitizenAnalysisReport[]>([]);
  const [observations, setObservations] = useState<WeatherObservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<WeatherEvent | null>(null);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [evts, obs, anoms, cits, summ] = await Promise.all([
        vayuService.getEvents(filters),
        vayuService.getObservations(filters),
        vayuService.getAnomalies(filters),
        vayuService.getCitizenReports(filters),
        vayuService.getAnalyticsSummary(filters),
      ]);
      setEvents(evts);
      setObservations(obs);
      setAnomalies(anoms);
      setCitizenReports(cits);
      setSummary(summ);
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    let ignore = false;
    const frame = window.requestAnimationFrame(() => {
      void (async () => {
        setLoading(true);
        try {
          const [evts, obs, anoms, cits, summ] = await Promise.all([
            vayuService.getEvents(filters),
            vayuService.getObservations(filters),
            vayuService.getAnomalies(filters),
            vayuService.getCitizenReports(filters),
            vayuService.getAnalyticsSummary(filters),
          ]);

          if (ignore) {
            return;
          }

          setEvents(evts);
          setObservations(obs);
          setAnomalies(anoms);
          setCitizenReports(cits);
          setSummary(summ);
          setLastUpdated(new Date());
        } finally {
          if (!ignore) {
            setLoading(false);
          }
        }
      })();
    });

    return () => {
      ignore = true;
      window.cancelAnimationFrame(frame);
    };
  }, [filters]);

  const handleExport = () => {
    onAction?.("Exported VAYU weather analytics report (CSV / PDF) — feature coming with backend integration.");
  };

  const handleFilterChange = <K extends keyof AnalysisFilters>(key: K, value: AnalysisFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => setFilters(DEFAULT_FILTERS);

  // ── Event Distribution for donut
  const eventDistData = summary
    ? Object.entries(summary.eventDistribution).map(([label, value]) => ({ label, value }))
    : [];

  const donutColours = ["#32b7c8", "#e26b5d", "#c78c27", "#2c8c67", "#17354a", "#9b59b6", "#e67e22", "#1abc9c"];

  // ── Source distribution bars
  const sourceBarData = summary
    ? Object.entries(summary.sourceDistribution).map(([label, value]) => ({ label, value }))
    : [];

  // ── Precipitation events
  const precipEvents = events.filter((e) =>
    ["Heavy Rainfall", "Flood", "Thunderstorm", "Hailstorm"].includes(e.eventType),
  );
  const tempWindEvents = events.filter((e) =>
    ["Heatwave", "Dust Storm", "Strong Wind", "Fog"].includes(e.eventType),
  );
  const floodEvents = events.filter((e) => e.eventType === "Flood");
  const heatwaveEvents = events.filter((e) => e.eventType === "Heatwave");

  const tabs = [
    { label: "Overview", icon: Activity, count: null },
    { label: "Weather Events", icon: CloudRain, count: events.length },
    { label: "Precipitation & Storms", icon: Droplets, count: precipEvents.length },
    { label: "Temperature & Wind", icon: Thermometer, count: tempWindEvents.length },
    { label: "Flood & Drought", icon: Droplets, count: floodEvents.length },
    { label: "Anomalies & Climate", icon: AlertTriangle, count: anomalies.length },
    { label: "Citizen & AI Intelligence", icon: Brain, count: citizenReports.length },
    { label: "Data Quality", icon: Database, count: null },
  ];

  return (
    <div className="vayu-page">
      {/* ── Header */}
      <div className="vayu-header">
        <div className="vayu-header-left">
          <p className="vayu-eyebrow">NATIONAL WEATHER INTELLIGENCE · ADMIN PORTAL</p>
          <div className="vayu-badges">
            <span className="vayu-badge demo">⬡ Demo Data</span>
            <span className="vayu-badge not-trained">⚠ Models Not Trained</span>
            <span className="vayu-badge live">● Mock Mode</span>
          </div>
          <h1>Analysis</h1>
          <p>
            VAYU Weather Intelligence & Analytics Engine v0.1 · Mock Mode ·{" "}
            <span style={{ fontFamily: "DM Mono, monospace", fontSize: 10 }}>
              Last updated: {lastUpdated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} IST
            </span>
          </p>
        </div>
        <div className="vayu-header-actions">
          <button className="vayu-btn icon-only" onClick={() => void loadData()} title="Refresh">
            <RefreshCw size={15} />
          </button>
          <button className="vayu-btn" onClick={handleExport}>
            <Download size={14} /> Export Report
          </button>
          <button
            className="vayu-btn primary"
            onClick={() => onAction?.("Full-screen analysis coming with the advanced dashboard build.")}
          >
            <BarChart2 size={14} /> Full Analytics
          </button>
        </div>
      </div>

      {/* ── Data Status Bar */}
      <div className="vayu-status-bar">
        <span className="status-item">
          <span className="vayu-status-dot demo" /> IMD Feed · DEMO
        </span>
        <span className="status-item">
          <span className="vayu-status-dot demo" /> Weather API · DEMO
        </span>
        <span className="status-item">
          <span className="vayu-status-dot amber" /> Citizen Reports · Mock
        </span>
        <span className="status-item">
          <span className="vayu-status-dot amber" /> Satellite · Mock
        </span>
        <span className="status-item error">
          <span className="vayu-status-dot red" /> VAYU Model · NOT TRAINED
        </span>
        <span className="status-item error">
          <span className="vayu-status-dot red" /> VISTA Model · NOT TRAINED
        </span>
        <span style={{ marginLeft: "auto", color: "#789096" }}>
          Engine: {summary?.engine ?? "Loading…"}
        </span>
      </div>

      {/* ── Global Filters */}
      <div className="vayu-filters">
        <span className="vayu-filters-title">
          <Filter size={13} /> Filters
        </span>
        <div className="vayu-filter-group">
          <label>Date Range</label>
          <select value={filters.dateRange} onChange={(e) => handleFilterChange("dateRange", e.target.value as AnalysisFilters["dateRange"])}>
            {DATE_RANGES.map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>
        <div className="vayu-filter-group">
          <label>Event Type</label>
          <select value={filters.eventType} onChange={(e) => handleFilterChange("eventType", e.target.value)}>
            {EVENT_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="vayu-filter-group">
          <label>State</label>
          <select value={filters.state} onChange={(e) => handleFilterChange("state", e.target.value)}>
            {STATES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="vayu-filter-group">
          <label>Severity</label>
          <select value={filters.severity} onChange={(e) => handleFilterChange("severity", e.target.value)}>
            {SEVERITIES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="vayu-filter-group">
          <label>Data Source</label>
          <select value={filters.dataSource} onChange={(e) => handleFilterChange("dataSource", e.target.value)}>
            {DATA_SOURCES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="vayu-filter-group">
          <label>Verification</label>
          <select value={filters.verificationStatus} onChange={(e) => handleFilterChange("verificationStatus", e.target.value)}>
            {VSTATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <button className="vayu-filter-reset" onClick={resetFilters}>
          <X size={12} /> Reset
        </button>
      </div>

      {/* ── KPI Cards */}
      <div className="vayu-kpi-grid">
        <div className="vayu-kpi">
          <CloudRain className="vayu-kpi-icon" size={18} />
          <span className="vayu-kpi-label">Active Events</span>
          <strong className="vayu-kpi-value">{loading ? "—" : summary?.activeEventsCount ?? 0}</strong>
          <small className="vayu-kpi-sub">Filtered active weather events</small>
        </div>
        <div className="vayu-kpi coral">
          <AlertTriangle className="vayu-kpi-icon" size={18} />
          <span className="vayu-kpi-label">High / Critical</span>
          <strong className="vayu-kpi-value">{loading ? "—" : summary?.highSeverityCount ?? 0}</strong>
          <small className="vayu-kpi-sub warn">Requires immediate action</small>
        </div>
        <div className="vayu-kpi amber">
          <Activity className="vayu-kpi-icon" size={18} />
          <span className="vayu-kpi-label">Affected Districts</span>
          <strong className="vayu-kpi-value">{loading ? "—" : summary?.affectedDistrictsCount ?? 0}</strong>
          <small className="vayu-kpi-sub">Unique districts impacted</small>
        </div>
        <div className="vayu-kpi">
          <Wind className="vayu-kpi-icon" size={18} />
          <span className="vayu-kpi-label">Anomalies Detected</span>
          <strong className="vayu-kpi-value">{loading ? "—" : summary?.weatherAnomaliesCount ?? 0}</strong>
          <small className="vayu-kpi-sub">Statistical weather anomalies</small>
        </div>
        <div className="vayu-kpi green">
          <ShieldCheck className="vayu-kpi-icon" size={18} />
          <span className="vayu-kpi-label">Verified Reports</span>
          <strong className="vayu-kpi-value">{loading ? "—" : summary?.verifiedReports ?? 0}</strong>
          <small className="vayu-kpi-sub up">Citizen corroborated</small>
        </div>
        <div className="vayu-kpi coral">
          <Users className="vayu-kpi-icon" size={18} />
          <span className="vayu-kpi-label">Suspicious Reports</span>
          <strong className="vayu-kpi-value">{loading ? "—" : summary?.suspiciousReports ?? 0}</strong>
          <small className="vayu-kpi-sub warn">Low-confidence signals</small>
        </div>
        <div className="vayu-kpi amber">
          <Flame className="vayu-kpi-icon" size={18} />
          <span className="vayu-kpi-label">Heatwave Areas</span>
          <strong className="vayu-kpi-value">{loading ? "—" : summary?.heatwaveAreasCount ?? 0}</strong>
          <small className="vayu-kpi-sub">Extreme heat zones</small>
        </div>
        <div className="vayu-kpi navy">
          <Droplets className="vayu-kpi-icon" size={18} />
          <span className="vayu-kpi-label">Flood Risk Areas</span>
          <strong className="vayu-kpi-value">{loading ? "—" : summary?.floodRiskAreasCount ?? 0}</strong>
          <small className="vayu-kpi-sub">Active flood events</small>
        </div>
      </div>

      {/* ── Sub-Tab Navigation */}
      <div className="vayu-tabs">
        {tabs.map((tab, i) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.label}
              className={`vayu-tab-btn ${activeTab === i ? "active" : ""}`}
              onClick={() => setActiveTab(i)}
            >
              <Icon size={13} />
              {tab.label}
              {tab.count !== null && (
                <span className="vayu-tab-count">{tab.count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Loading overlay */}
      {loading && (
        <div className="vayu-loading">
          <div className="vayu-spinner" />
          Loading VAYU analytics data…
        </div>
      )}

      {/* ── Tab Content */}
      {!loading && (
        <>
          {activeTab === 0 && (
            <OverviewTab
              events={events}
              summary={summary}
              eventDistData={eventDistData}
              donutColours={donutColours}
              sourceBarData={sourceBarData}
              onSelectEvent={setSelectedEvent}
            />
          )}
          {activeTab === 1 && (
            <WeatherEventsTab
              events={events}
              onSelectEvent={setSelectedEvent}
            />
          )}
          {activeTab === 2 && (
            <PrecipitationTab events={precipEvents} observations={observations} />
          )}
          {activeTab === 3 && (
            <TempWindTab events={tempWindEvents} observations={observations} />
          )}
          {activeTab === 4 && (
            <FloodDroughtTab floodEvents={floodEvents} heatwaveEvents={heatwaveEvents} />
          )}
          {activeTab === 5 && (
            <AnomaliesTab anomalies={anomalies} />
          )}
          {activeTab === 6 && (
            <CitizenAITab
              citizenReports={citizenReports}
              events={events}
            />
          )}
          {activeTab === 7 && (
            <DataQualityTab observations={observations} />
          )}
        </>
      )}

      {/* ── Event Drawer */}
      {selectedEvent && (
        <EventDrawer event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Tab 0: Overview
// ─────────────────────────────────────────────────────────────────

function OverviewTab({
  events,
  summary,
  eventDistData,
  donutColours,
  sourceBarData,
  onSelectEvent,
}: {
  events: WeatherEvent[];
  summary: AnalyticsSummary | null;
  eventDistData: { label: string; value: number }[];
  donutColours: string[];
  sourceBarData: { label: string; value: number }[];
  onSelectEvent: (evt: WeatherEvent) => void;
}) {
  return (
    <>
      {/* Map + Event Distribution */}
      <div className="vayu-grid-main">
        <div className="vayu-panel">
          <div className="vayu-panel-header">
            <div>
              <p className="vayu-panel-kicker">Spatial Hotspot Map</p>
              <h3 className="vayu-panel-title">Verified Weather Event Hotspots</h3>
            </div>
            <span style={{ font: "9px 'DM Mono', monospace", color: "#789196" }}>
              {events.length} events · DEMO
            </span>
          </div>
          <div className="vayu-map-wrap">
            <AnalysisMap events={events} />
          </div>
          <div className="vayu-map-legend">
            <span><span className="vayu-legend-dot critical" /> Critical</span>
            <span><span className="vayu-legend-dot high" /> High</span>
            <span><span className="vayu-legend-dot moderate" /> Moderate</span>
            <span><span className="vayu-legend-dot low" /> Low</span>
            <span style={{ marginLeft: "auto" }}>Leaflet · OSM · DEMO data only</span>
          </div>
        </div>

        <div>
          <div className="vayu-panel" style={{ marginBottom: 14 }}>
            <div className="vayu-panel-header">
              <div>
                <p className="vayu-panel-kicker">Event Distribution</p>
                <h3 className="vayu-panel-title">By Category</h3>
              </div>
            </div>
            <div className="vayu-panel-body">
              {eventDistData.length > 0 ? (
                <DonutChart data={eventDistData} colours={donutColours} />
              ) : (
                <div className="vayu-empty">No events match current filters.</div>
              )}
            </div>
          </div>

          <div className="vayu-panel">
            <div className="vayu-panel-header">
              <div>
                <p className="vayu-panel-kicker">Signal Sources</p>
                <h3 className="vayu-panel-title">By Data Source</h3>
              </div>
            </div>
            <div className="vayu-panel-body">
              {sourceBarData.length > 0 ? (
                <BarList data={sourceBarData} colour="cyan" />
              ) : (
                <div className="vayu-empty">No data.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Events */}
      <div className="vayu-panel">
        <div className="vayu-panel-header">
          <div>
            <p className="vayu-panel-kicker">Most Recent Events</p>
            <h3 className="vayu-panel-title">Active Weather Events — Click to Inspect</h3>
          </div>
          <span style={{ font: "9px 'DM Mono', monospace", color: "#789196" }}>
            {events.length} total
          </span>
        </div>
        <ul className="vayu-event-list">
          {events.slice(0, 6).map((evt) => (
            <li
              key={evt.eventId}
              className="vayu-event-item"
              onClick={() => onSelectEvent(evt)}
            >
              <div className={`vayu-event-icon ${eventIconColour(evt.eventType)}`}>
                <CloudRain size={16} />
              </div>
              <div className="vayu-event-info">
                <strong>{evt.title}</strong>
                <small>
                  <span>{evt.city}, {evt.state}</span>
                  ·
                  <span>{formatIST(evt.timestamp)}</span>
                </small>
              </div>
              <div className="vayu-event-meta">
                <span className={`vayu-severity ${severityClass(evt.severity)}`}>{evt.severity}</span>
                <span className="vayu-event-time">Conf: {evt.confidence}%</span>
              </div>
              <ArrowUpRight size={14} color="#b8cbc9" />
            </li>
          ))}
        </ul>
        {events.length === 0 && <div className="vayu-empty">No events match current filters.</div>}
      </div>

      {/* Summary stats */}
      {summary && (
        <div className="vayu-grid-3">
          <div className="vayu-panel">
            <div className="vayu-panel-header">
              <div>
                <p className="vayu-panel-kicker">Pipeline Summary</p>
                <h3 className="vayu-panel-title">Verification Stats</h3>
              </div>
            </div>
            <div className="vayu-panel-body">
              <BarList
                data={[
                  { label: "Verified", value: summary.verifiedReports },
                  { label: "Pending", value: summary.pendingReports },
                  { label: "Suspicious", value: summary.suspiciousReports },
                ]}
                colour="green"
              />
            </div>
          </div>
          <div className="vayu-panel">
            <div className="vayu-panel-header">
              <div>
                <p className="vayu-panel-kicker">Risk Summary</p>
                <h3 className="vayu-panel-title">Event Severity Breakdown</h3>
              </div>
            </div>
            <div className="vayu-panel-body">
              <BarList
                data={[
                  { label: "Critical", value: events.filter((e) => e.severity === "Critical").length },
                  { label: "High", value: events.filter((e) => e.severity === "High").length },
                  { label: "Moderate", value: events.filter((e) => e.severity === "Moderate").length },
                  { label: "Low", value: events.filter((e) => e.severity === "Low").length },
                ]}
                colour="coral"
              />
            </div>
          </div>
          <div className="vayu-panel">
            <div className="vayu-panel-header">
              <div>
                <p className="vayu-panel-kicker">Geographic Spread</p>
                <h3 className="vayu-panel-title">Events by State</h3>
              </div>
            </div>
            <div className="vayu-panel-body">
              <BarList
                data={(() => {
                  const counts: Record<string, number> = {};
                  events.forEach((e) => { counts[e.state] = (counts[e.state] || 0) + 1; });
                  return Object.entries(counts).map(([label, value]) => ({ label, value }));
                })()}
                colour="amber"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// Tab 1: Weather Events
// ─────────────────────────────────────────────────────────────────

function WeatherEventsTab({
  events,
  onSelectEvent,
}: {
  events: WeatherEvent[];
  onSelectEvent: (evt: WeatherEvent) => void;
}) {
  return (
    <div className="vayu-panel">
      <div className="vayu-panel-header">
        <div>
          <p className="vayu-panel-kicker">Full Event Log</p>
          <h3 className="vayu-panel-title">All Weather Events — Click Row to Inspect</h3>
        </div>
        <span style={{ font: "9px 'DM Mono', monospace", color: "#789196" }}>
          {events.length} events · DEMO DATA
        </span>
      </div>
      <div className="vayu-panel-body no-pad">
        {events.length === 0 ? (
          <div className="vayu-empty">No events match current filters.</div>
        ) : (
          <div className="vayu-table-wrap">
            <table className="vayu-table">
              <thead>
                <tr>
                  <th>Event ID</th>
                  <th>Type</th>
                  <th>Location</th>
                  <th>Severity</th>
                  <th>Confidence</th>
                  <th>Rainfall</th>
                  <th>Temp</th>
                  <th>Wind</th>
                  <th>Reports</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th>Time (IST)</th>
                </tr>
              </thead>
              <tbody>
                {events.map((evt) => (
                  <tr
                    key={evt.eventId}
                    style={{ cursor: "pointer" }}
                    onClick={() => onSelectEvent(evt)}
                  >
                    <td className="mono">{evt.eventId}</td>
                    <td>{evt.eventType}</td>
                    <td>
                      <strong style={{ fontSize: 11 }}>{evt.city}</strong>
                      <div className="dim">{evt.state}</div>
                    </td>
                    <td><span className={`vayu-severity ${severityClass(evt.severity)}`}>{evt.severity}</span></td>
                    <td className="mono">{evt.confidence}%</td>
                    <td className="mono">{evt.rainfallMm} mm</td>
                    <td className="mono">{evt.temperatureC}°C</td>
                    <td className="mono">{evt.windSpeedKmh} km/h</td>
                    <td className="mono">{evt.reportCount}</td>
                    <td><span className={`vayu-vstatus ${verificationClass(evt.verificationStatus)}`}>{evt.verificationStatus}</span></td>
                    <td className="dim">{evt.source}</td>
                    <td className="mono dim">{formatIST(evt.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Tab 2: Precipitation & Storms
// ─────────────────────────────────────────────────────────────────

function PrecipitationTab({
  events,
  observations,
}: {
  events: WeatherEvent[];
  observations: WeatherObservation[];
}) {
  const rainObs = observations.filter((o) => o.rainfall24hMm > 0);
  const maxRain = Math.max(...rainObs.map((o) => o.rainfall24hMm), 1);

  return (
    <>
      <div className="vayu-grid-2">
        <div className="vayu-panel">
          <div className="vayu-panel-header">
            <div>
              <p className="vayu-panel-kicker">Rainfall Analysis</p>
              <h3 className="vayu-panel-title">24-Hour Rainfall by Station</h3>
            </div>
          </div>
          <div className="vayu-panel-body">
            {rainObs.length > 0 ? (
              <BarList
                data={rainObs.slice(0, 8).map((o) => ({
                  label: `${o.city} (${o.state.slice(0, 2)})`,
                  value: o.rainfall24hMm,
                  suffix: " mm",
                }))}
                colour="cyan"
              />
            ) : (
              <div className="vayu-empty">No rainfall data for current filters.</div>
            )}
          </div>
        </div>

        <div className="vayu-panel">
          <div className="vayu-panel-header">
            <div>
              <p className="vayu-panel-kicker">Storm Events</p>
              <h3 className="vayu-panel-title">Thunderstorm & Heavy Rainfall</h3>
            </div>
          </div>
          <div className="vayu-panel-body">
            <div className="vayu-metric-row">
              <span className="vayu-metric-label">Peak 24h Rainfall</span>
              <span className="vayu-metric-value high">{maxRain} mm</span>
            </div>
            <div className="vayu-metric-row">
              <span className="vayu-metric-label">Active Flood Events</span>
              <span className="vayu-metric-value high">
                {events.filter((e) => e.eventType === "Flood").length}
              </span>
            </div>
            <div className="vayu-metric-row">
              <span className="vayu-metric-label">Thunderstorm Events</span>
              <span className="vayu-metric-value moderate">
                {events.filter((e) => e.eventType === "Thunderstorm").length}
              </span>
            </div>
            <div className="vayu-metric-row">
              <span className="vayu-metric-label">Hailstorm Events</span>
              <span className="vayu-metric-value low">
                {events.filter((e) => e.eventType === "Hailstorm").length}
              </span>
            </div>
            <div className="vayu-metric-row">
              <span className="vayu-metric-label">Cyclone Watches</span>
              <span className="vayu-metric-value high">
                {events.filter((e) => e.eventType === "Cyclone").length}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="vayu-panel">
        <div className="vayu-panel-header">
          <div>
            <p className="vayu-panel-kicker">Precipitation Events Table</p>
            <h3 className="vayu-panel-title">Heavy Rainfall, Flood, Thunderstorm, Hailstorm Events</h3>
          </div>
        </div>
        <div className="vayu-panel-body no-pad">
          <div className="vayu-table-wrap">
            <table className="vayu-table">
              <thead>
                <tr>
                  <th>Event Type</th>
                  <th>Location</th>
                  <th>24h Rainfall</th>
                  <th>Wind</th>
                  <th>Severity</th>
                  <th>Reports</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {events.map((evt) => (
                  <tr key={evt.eventId}>
                    <td>{evt.eventType}</td>
                    <td>{evt.city}, {evt.state}</td>
                    <td className="mono">{evt.rainfallMm} mm</td>
                    <td className="mono">{evt.windSpeedKmh} km/h</td>
                    <td><span className={`vayu-severity ${severityClass(evt.severity)}`}>{evt.severity}</span></td>
                    <td className="mono">{evt.reportCount}</td>
                    <td className="mono">{evt.confidence}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {events.length === 0 && <div className="vayu-empty">No precipitation events match current filters.</div>}
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// Tab 3: Temperature & Wind
// ─────────────────────────────────────────────────────────────────

function TempWindTab({
  events,
  observations,
}: {
  events: WeatherEvent[];
  observations: WeatherObservation[];
}) {
  const allObs = observations;
  const maxTemp = Math.max(...allObs.map((o) => o.temperatureC), 0);
  const maxWind = Math.max(...allObs.map((o) => o.windSpeedKmh), 0);
  const minVis = Math.min(...allObs.map((o) => o.visibilityKm).filter((v) => v > 0), 10);

  return (
    <>
      <div className="vayu-grid-2">
        <div className="vayu-panel">
          <div className="vayu-panel-header">
            <div>
              <p className="vayu-panel-kicker">Temperature Analysis</p>
              <h3 className="vayu-panel-title">Temperature by Location</h3>
            </div>
          </div>
          <div className="vayu-panel-body">
            <BarList
              data={allObs.slice(0, 8).map((o) => ({
                label: `${o.city} (${o.state.slice(0, 2)})`,
                value: o.temperatureC,
                suffix: "°C",
              }))}
              colour="coral"
            />
          </div>
        </div>
        <div className="vayu-panel">
          <div className="vayu-panel-header">
            <div>
              <p className="vayu-panel-kicker">Wind & Visibility</p>
              <h3 className="vayu-panel-title">Wind Speed by Location</h3>
            </div>
          </div>
          <div className="vayu-panel-body">
            <BarList
              data={allObs.slice(0, 8).map((o) => ({
                label: `${o.city} (${o.state.slice(0, 2)})`,
                value: o.windSpeedKmh,
                suffix: " km/h",
              }))}
              colour="amber"
            />
          </div>
        </div>
      </div>

      <div className="vayu-grid-3">
        <div className="vayu-panel">
          <div className="vayu-panel-header">
            <div>
              <p className="vayu-panel-kicker">Summary</p>
              <h3 className="vayu-panel-title">Temperature Extremes</h3>
            </div>
          </div>
          <div className="vayu-panel-body">
            <div className="vayu-metric-row">
              <span className="vayu-metric-label">Max Recorded Temp</span>
              <span className="vayu-metric-value high">{maxTemp}°C</span>
            </div>
            <div className="vayu-metric-row">
              <span className="vayu-metric-label">Heatwave Events</span>
              <span className="vayu-metric-value high">{events.filter((e) => e.eventType === "Heatwave").length}</span>
            </div>
            <div className="vayu-metric-row">
              <span className="vayu-metric-label">Dust Storm Events</span>
              <span className="vayu-metric-value moderate">{events.filter((e) => e.eventType === "Dust Storm").length}</span>
            </div>
          </div>
        </div>
        <div className="vayu-panel">
          <div className="vayu-panel-header">
            <div>
              <p className="vayu-panel-kicker">Summary</p>
              <h3 className="vayu-panel-title">Wind Extremes</h3>
            </div>
          </div>
          <div className="vayu-panel-body">
            <div className="vayu-metric-row">
              <span className="vayu-metric-label">Max Wind Speed</span>
              <span className="vayu-metric-value high">{maxWind} km/h</span>
            </div>
            <div className="vayu-metric-row">
              <span className="vayu-metric-label">Strong Wind Events</span>
              <span className="vayu-metric-value moderate">{events.filter((e) => e.eventType === "Strong Wind").length}</span>
            </div>
            <div className="vayu-metric-row">
              <span className="vayu-metric-label">Cyclone Watch</span>
              <span className="vayu-metric-value high">{events.filter((e) => e.eventType === "Cyclone").length}</span>
            </div>
          </div>
        </div>
        <div className="vayu-panel">
          <div className="vayu-panel-header">
            <div>
              <p className="vayu-panel-kicker">Summary</p>
              <h3 className="vayu-panel-title">Visibility & Fog</h3>
            </div>
          </div>
          <div className="vayu-panel-body">
            <div className="vayu-metric-row">
              <span className="vayu-metric-label">Min Visibility</span>
              <span className="vayu-metric-value high">{minVis} km</span>
            </div>
            <div className="vayu-metric-row">
              <span className="vayu-metric-label">Fog Events</span>
              <span className="vayu-metric-value moderate">{events.filter((e) => e.eventType === "Fog").length}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// Tab 4: Flood & Drought
// ─────────────────────────────────────────────────────────────────

function FloodDroughtTab({
  floodEvents,
  heatwaveEvents,
}: {
  floodEvents: WeatherEvent[];
  heatwaveEvents: WeatherEvent[];
}) {
  return (
    <>
      <div
        style={{
          background: "#fff8e6",
          border: "1px solid #e8c96a",
          padding: "12px 16px",
          marginBottom: 14,
          fontSize: 11,
          color: "#8a6020",
          fontFamily: "DM Mono, monospace",
        }}
      >
        ⚠ DEMO DATA — VAANKAN Analytical Flood Risk & SPI Drought Index values are illustrative mock data only.
        ML-based prediction models are NOT TRAINED.
      </div>

      <div className="vayu-grid-2">
        <div className="vayu-panel">
          <div className="vayu-panel-header">
            <div>
              <p className="vayu-panel-kicker">Flood Risk Index</p>
              <h3 className="vayu-panel-title">VAANKAN Analytical Flood Risk (VAFR) — Mock</h3>
            </div>
          </div>
          <div className="vayu-panel-body">
            {floodEvents.length > 0 ? (
              floodEvents.map((evt) => (
                <div key={evt.eventId} className="vayu-risk-gauge">
                  <div
                    className={`vayu-risk-number ${severityClass(evt.severity)}`}
                    style={{ minWidth: 60 }}
                  >
                    {Math.round(evt.anomalyScore * 10) / 10}
                  </div>
                  <div>
                    <div className="vayu-risk-label">{evt.city}, {evt.state}</div>
                    <div className="vayu-risk-sub">
                      24h Rainfall: {evt.rainfallMm} mm · Radius: {evt.affectedRadiusKm} km
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <span className={`vayu-severity ${severityClass(evt.severity)}`}>{evt.severity}</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="vayu-empty">No active flood events match current filters.</div>
            )}
          </div>
        </div>

        <div className="vayu-panel">
          <div className="vayu-panel-header">
            <div>
              <p className="vayu-panel-kicker">Drought / Heat Stress</p>
              <h3 className="vayu-panel-title">Standardised Precipitation Index (SPI) — Mock</h3>
            </div>
          </div>
          <div className="vayu-panel-body">
            <div
              style={{
                background: "#fde8e8",
                border: "1px solid #f4b8b0",
                padding: "10px 12px",
                marginBottom: 12,
                fontSize: 11,
                color: "#c62828",
                fontFamily: "DM Mono, monospace",
              }}
            >
              SPI COMPUTATION REQUIRES HISTORICAL RAINFALL DATASET — NOT AVAILABLE IN MOCK MODE
            </div>
            {heatwaveEvents.map((evt) => (
              <div key={evt.eventId} className="vayu-risk-gauge">
                <div className="vayu-risk-number high" style={{ minWidth: 60 }}>
                  {evt.temperatureC}°
                </div>
                <div>
                  <div className="vayu-risk-label">{evt.city}, {evt.state}</div>
                  <div className="vayu-risk-sub">Heatwave · 0 mm rainfall · {evt.affectedRadiusKm} km radius</div>
                  <div style={{ marginTop: 6 }}>
                    <span className={`vayu-severity ${severityClass(evt.severity)}`}>{evt.severity}</span>
                  </div>
                </div>
              </div>
            ))}
            {heatwaveEvents.length === 0 && <div className="vayu-empty">No active heatwave events.</div>}
          </div>
        </div>
      </div>

      <div className="vayu-panel">
        <div className="vayu-panel-header">
          <div>
            <p className="vayu-panel-kicker">Flood & Heat Events</p>
            <h3 className="vayu-panel-title">Combined Flood & Heatwave Event Details</h3>
          </div>
        </div>
        <div className="vayu-panel-body no-pad">
          <div className="vayu-table-wrap">
            <table className="vayu-table">
              <thead>
                <tr>
                  <th>Event Type</th>
                  <th>Location</th>
                  <th>Rainfall (mm)</th>
                  <th>Temp (°C)</th>
                  <th>Radius (km)</th>
                  <th>Severity</th>
                  <th>Anomaly Score</th>
                </tr>
              </thead>
              <tbody>
                {[...floodEvents, ...heatwaveEvents].map((evt) => (
                  <tr key={evt.eventId}>
                    <td>{evt.eventType}</td>
                    <td>{evt.city}, {evt.state}</td>
                    <td className="mono">{evt.rainfallMm}</td>
                    <td className="mono">{evt.temperatureC}</td>
                    <td className="mono">{evt.affectedRadiusKm}</td>
                    <td><span className={`vayu-severity ${severityClass(evt.severity)}`}>{evt.severity}</span></td>
                    <td className="mono">{(evt.anomalyScore * 100).toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {floodEvents.length === 0 && heatwaveEvents.length === 0 && (
            <div className="vayu-empty">No flood or heat events match current filters.</div>
          )}
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// Tab 5: Anomalies & Climate
// ─────────────────────────────────────────────────────────────────

function AnomaliesTab({ anomalies }: { anomalies: WeatherAnomaly[] }) {
  return (
    <>
      <div className="vayu-anomaly-grid" style={{ marginBottom: 14 }}>
        {anomalies.map((anm) => (
          <div key={anm.anomalyId} className="vayu-anomaly-card">
            <div className="param">{anm.parameter} Anomaly</div>
            <div className="location">{anm.location}</div>
            <div className="current-value">
              {anm.currentValue}
              <span style={{ fontSize: 12, color: "#8a9a9c", marginLeft: 4 }}>
                {anm.parameter === "Rainfall" ? "mm" :
                 anm.parameter === "Temperature" ? "°C" :
                 anm.parameter === "Wind" ? "km/h" :
                 anm.parameter === "Pressure" ? "hPa" :
                 anm.parameter === "Visibility" ? "km" : "%"}
              </span>
            </div>
            <div className="normal">Normal: {anm.historicalNormal} · Deviation: {anm.deviation > 0 ? "+" : ""}{anm.deviation}</div>
            <span className={`deviation ${anm.deviation > 0 ? "up" : "down"}`}>
              {anm.deviation > 0 ? "▲" : "▼"} {Math.abs(anm.deviation)} {anm.parameter === "Temperature" ? "°C" : "units"} from normal
            </span>
            <div className="vayu-anomaly-score">
              Score: {(anm.anomalyScore * 100).toFixed(0)}%
            </div>
            <div className="vayu-score-bar" style={{ marginTop: 8 }}>
              <div className="vayu-score-fill" style={{ width: `${anm.anomalyScore * 100}%` }} />
            </div>
            <div style={{ marginTop: 8 }}>
              <span className={`vayu-severity ${severityClass(anm.severity)}`}>{anm.severity}</span>
            </div>
          </div>
        ))}
      </div>
      {anomalies.length === 0 && <div className="vayu-empty">No anomalies detected for current filters.</div>}

      <div className="vayu-panel">
        <div className="vayu-panel-header">
          <div>
            <p className="vayu-panel-kicker">Historical Comparison</p>
            <h3 className="vayu-panel-title">Current vs Historical Normal — All Parameters</h3>
          </div>
        </div>
        <div className="vayu-panel-body">
          <div
            style={{
              background: "#fff8e6",
              border: "1px solid #e8c96a",
              padding: "10px 12px",
              marginBottom: 14,
              fontSize: 11,
              color: "#8a6020",
              fontFamily: "DM Mono, monospace",
            }}
          >
            ⚠ Historical baseline data requires 10+ years IMD station records. Currently showing mock illustrative deviations.
          </div>
          <div className="vayu-table-wrap">
            <table className="vayu-table">
              <thead>
                <tr>
                  <th>Parameter</th>
                  <th>Location</th>
                  <th>Current Value</th>
                  <th>Historical Normal</th>
                  <th>Deviation</th>
                  <th>Anomaly Score</th>
                  <th>Severity</th>
                </tr>
              </thead>
              <tbody>
                {anomalies.map((anm) => (
                  <tr key={anm.anomalyId}>
                    <td>{anm.parameter}</td>
                    <td>{anm.location}</td>
                    <td className="mono">{anm.currentValue}</td>
                    <td className="mono">{anm.historicalNormal}</td>
                    <td
                      className="mono"
                      style={{ color: anm.deviation > 0 ? "#e26b5d" : "#1d7f8a" }}
                    >
                      {anm.deviation > 0 ? "+" : ""}{anm.deviation}
                    </td>
                    <td className="mono">{(anm.anomalyScore * 100).toFixed(0)}%</td>
                    <td><span className={`vayu-severity ${severityClass(anm.severity)}`}>{anm.severity}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// Tab 6: Citizen & AI Intelligence
// ─────────────────────────────────────────────────────────────────

function CitizenAITab({
  citizenReports,
  events,
}: {
  citizenReports: CitizenAnalysisReport[];
  events: WeatherEvent[];
}) {
  const verifiedCount = citizenReports.filter((r) => r.status === "VERIFIED").length;
  const pendingCount = citizenReports.filter((r) => r.status === "PENDING").length;
  const suspiciousCount = citizenReports.filter((r) => r.status === "SUSPICIOUS").length;

  return (
    <>
      {/* AI Model Status Cards */}
      <div className="vayu-grid-2" style={{ marginBottom: 0 }}>
        <div className="vayu-model-panel">
          <span className="vayu-model-label">NOT TRAINED</span>
          <div className="vayu-model-header">
            <div className="vayu-model-icon"><Brain size={20} /></div>
            <div>
              <p className="vayu-model-name">VAYU</p>
              <p className="vayu-model-desc">Weather Intelligence & Analytics Engine — Mock / Demo Mode</p>
            </div>
          </div>
          <div style={{ fontSize: 11, color: "#8a9a9c", marginBottom: 10 }}>
            Planned capabilities (not yet implemented):
          </div>
          <div className="vayu-model-pipeline">
            {["Anomaly Detection", "Spatial Clustering", "Event Classification", "Severity Prediction", "Forecasting", "Data Fusion"].map((s) => (
              <span key={s} className="vayu-pipeline-step">{s}</span>
            ))}
          </div>
        </div>
        <div className="vayu-model-panel">
          <span className="vayu-model-label">NOT TRAINED</span>
          <div className="vayu-model-header">
            <div className="vayu-model-icon"><ShieldCheck size={20} /></div>
            <div>
              <p className="vayu-model-name">VISTA</p>
              <p className="vayu-model-desc">Verification Intelligence for Source Trust Assessment — Mock / Demo Mode</p>
            </div>
          </div>
          <div style={{ fontSize: 11, color: "#8a9a9c", marginBottom: 10 }}>
            Planned verification pipeline (not yet implemented):
          </div>
          <div className="vayu-model-pipeline">
            {["Text Analysis", "Image Verification", "Location Consistency", "Time Consistency", "Weather Consistency", "Spatial Corroboration", "Source Trust"].map((s) => (
              <span key={s} className="vayu-pipeline-step">{s}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="vayu-grid-3" style={{ marginTop: 14 }}>
        <div className="vayu-panel">
          <div className="vayu-panel-header">
            <div>
              <p className="vayu-panel-kicker">Citizen Report Stats</p>
              <h3 className="vayu-panel-title">Report Breakdown</h3>
            </div>
          </div>
          <div className="vayu-panel-body">
            <BarList
              data={[
                { label: "Verified", value: verifiedCount },
                { label: "Pending", value: pendingCount },
                { label: "Suspicious", value: suspiciousCount },
              ]}
              colour="green"
            />
          </div>
        </div>
        <div className="vayu-panel">
          <div className="vayu-panel-header">
            <div>
              <p className="vayu-panel-kicker">VISTA ↔ VAYU Correlation</p>
              <h3 className="vayu-panel-title">Corroboration Scores</h3>
            </div>
          </div>
          <div className="vayu-panel-body">
            <div
              style={{
                background: "#fde8e8",
                border: "1px solid #f4b8b0",
                padding: "10px 12px",
                fontSize: 11,
                color: "#c62828",
                fontFamily: "DM Mono, monospace",
              }}
            >
              NOT TRAINED — Corroboration engine unavailable in demo mode.
            </div>
          </div>
        </div>
        <div className="vayu-panel">
          <div className="vayu-panel-header">
            <div>
              <p className="vayu-panel-kicker">Event Consolidation</p>
              <h3 className="vayu-panel-title">Citizen → Event Matches</h3>
            </div>
          </div>
          <div className="vayu-panel-body">
            <BarList
              data={events.slice(0, 5).map((e) => ({
                label: e.city,
                value: e.verifiedReportCount,
                suffix: " verified",
              }))}
              colour="cyan"
            />
          </div>
        </div>
      </div>

      <div className="vayu-panel">
        <div className="vayu-panel-header">
          <div>
            <p className="vayu-panel-kicker">Citizen Ground Reports</p>
            <h3 className="vayu-panel-title">Recent Citizen Observations</h3>
          </div>
          <span style={{ font: "9px 'DM Mono', monospace", color: "#789196" }}>
            {citizenReports.length} reports · DEMO
          </span>
        </div>
        {citizenReports.length > 0 ? (
          citizenReports.map((report) => (
            <div key={report.reportId} className="vayu-cit-item">
              <div className="vayu-cit-avatar">
                {report.userEmail.slice(0, 2).toUpperCase()}
              </div>
              <div className="vayu-cit-body">
                <strong>{report.userEmail}</strong>
                <p>{report.text}</p>
                <div className="vayu-cit-meta">
                  <span className={`vayu-vstatus ${verificationClass(report.status)}`}>{report.status}</span>
                  <span className="vayu-cit-time">{formatIST(report.timestamp)}</span>
                  <span style={{ font: "9px 'DM Mono', monospace", color: "#789196" }}>
                    Conf: {report.confidence}%
                  </span>
                  <span className={`vayu-severity ${severityClass("low")}`}>{report.category}</span>
                  <span style={{ font: "9px 'DM Mono', monospace", color: "#789196" }}>
                    {report.city}, {report.state}
                  </span>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="vayu-empty">No citizen reports match current filters.</div>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// Tab 7: Data Quality
// ─────────────────────────────────────────────────────────────────

function DataQualityTab({ observations }: { observations: WeatherObservation[] }) {
  const dataSources = [
    { name: "IMD API Feed", status: "DEMO", freshness: "Simulated — 0 min ago", quality: "N/A" },
    { name: "Weather API (Third-party)", status: "DEMO", freshness: "Simulated — 0 min ago", quality: "N/A" },
    { name: "Citizen Reports Portal", status: "MOCK", freshness: "Local mock data", quality: "N/A" },
    { name: "Social Media Crawler", status: "MOCK", freshness: "Not connected", quality: "N/A" },
    { name: "Satellite (INSAT-3DR)", status: "MOCK", freshness: "Not connected", quality: "N/A" },
    { name: "Doppler Radar Network", status: "MOCK", freshness: "Not connected", quality: "N/A" },
    { name: "VISTA Model Output", status: "MOCK", freshness: "NOT TRAINED", quality: "N/A" },
    { name: "VAYU Engine Output", status: "MOCK", freshness: "NOT TRAINED", quality: "N/A" },
  ];

  const good = observations.filter((o) => o.dataQualityFlag === "Good").length;
  const suspect = observations.filter((o) => o.dataQualityFlag === "Suspect").length;
  const estimated = observations.filter((o) => o.dataQualityFlag === "Estimated").length;

  return (
    <>
      <div className="vayu-dq-grid">
        {dataSources.map((src) => (
          <div key={src.name} className="vayu-dq-card">
            <div className="src-name">{src.name}</div>
            <div className={`src-status ${src.status.toLowerCase()}`}>{src.status}</div>
            <div className="vayu-dq-freshness">{src.freshness}</div>
          </div>
        ))}
      </div>

      <div className="vayu-grid-2">
        <div className="vayu-panel">
          <div className="vayu-panel-header">
            <div>
              <p className="vayu-panel-kicker">Observation Quality Flags</p>
              <h3 className="vayu-panel-title">Data Quality Distribution</h3>
            </div>
          </div>
          <div className="vayu-panel-body">
            <BarList
              data={[
                { label: "Good", value: good },
                { label: "Suspect", value: suspect },
                { label: "Estimated", value: estimated },
              ]}
              colour="green"
            />
          </div>
        </div>

        <div className="vayu-panel">
          <div className="vayu-panel-header">
            <div>
              <p className="vayu-panel-kicker">Data Provenance</p>
              <h3 className="vayu-panel-title">Source Coverage Summary</h3>
            </div>
          </div>
          <div className="vayu-panel-body">
            <div className="vayu-metric-row">
              <span className="vayu-metric-label">Total Observations</span>
              <span className="vayu-metric-value">{observations.length}</span>
            </div>
            <div className="vayu-metric-row">
              <span className="vayu-metric-label">Unique States Covered</span>
              <span className="vayu-metric-value">
                {new Set(observations.map((o) => o.state)).size}
              </span>
            </div>
            <div className="vayu-metric-row">
              <span className="vayu-metric-label">Unique Districts</span>
              <span className="vayu-metric-value">
                {new Set(observations.map((o) => o.district)).size}
              </span>
            </div>
            <div className="vayu-metric-row">
              <span className="vayu-metric-label">Data Mode</span>
              <span className="vayu-metric-value" style={{ color: "#c78c27", fontSize: 12 }}>DEMO / MOCK</span>
            </div>
          </div>
        </div>
      </div>

      <div className="vayu-panel">
        <div className="vayu-panel-header">
          <div>
            <p className="vayu-panel-kicker">Observation Log</p>
            <h3 className="vayu-panel-title">Full Observation Data Table</h3>
          </div>
        </div>
        <div className="vayu-panel-body no-pad">
          <div className="vayu-table-wrap">
            <table className="vayu-table">
              <thead>
                <tr>
                  <th>Obs ID</th>
                  <th>Station</th>
                  <th>Location</th>
                  <th>Temp</th>
                  <th>Humidity</th>
                  <th>Rainfall 24h</th>
                  <th>Wind</th>
                  <th>Visibility</th>
                  <th>Quality</th>
                  <th>Source</th>
                  <th>Time (IST)</th>
                </tr>
              </thead>
              <tbody>
                {observations.map((obs) => (
                  <tr key={obs.observationId}>
                    <td className="mono">{obs.observationId}</td>
                    <td className="mono dim">{obs.stationId}</td>
                    <td>{obs.city}, <span className="dim">{obs.state}</span></td>
                    <td className="mono">{obs.temperatureC}°C</td>
                    <td className="mono">{obs.humidityPercent}%</td>
                    <td className="mono">{obs.rainfall24hMm} mm</td>
                    <td className="mono">{obs.windSpeedKmh} km/h</td>
                    <td className="mono">{obs.visibilityKm} km</td>
                    <td>
                      <span
                        style={{
                          font: "9px 'DM Mono', monospace",
                          padding: "2px 6px",
                          background: obs.dataQualityFlag === "Good" ? "#e3f3ec" : obs.dataQualityFlag === "Suspect" ? "#fce9e6" : "#fdf1d8",
                          color: obs.dataQualityFlag === "Good" ? "#2c8c67" : obs.dataQualityFlag === "Suspect" ? "#e26b5d" : "#c78c27",
                        }}
                      >
                        {obs.dataQualityFlag}
                      </span>
                    </td>
                    <td className="dim">{obs.dataSource}</td>
                    <td className="mono dim">{formatIST(obs.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {observations.length === 0 && <div className="vayu-empty">No observations match current filters.</div>}
        </div>
      </div>
    </>
  );
}
