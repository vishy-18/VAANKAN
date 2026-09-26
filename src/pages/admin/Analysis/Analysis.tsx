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
import VerifiedGroundPipelineTab from "./VerifiedGroundPipelineTab";
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
  verificationStatus: "VERIFIED",
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
/** Leaflet map for Analysis — renders the supplied demo/API records only. */
function AnalysisMap({
  events,
  observations = [],
  showEvents = true,
  showObservations = false,
  onSelectEvent,
}: {
  events: WeatherEvent[];
  observations?: WeatherObservation[];
  showEvents?: boolean;
  showObservations?: boolean;
  onSelectEvent?: (event: WeatherEvent) => void;
}) {
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

    if (showEvents) events.forEach((evt) => {
      const colour =
        evt.severity === "Critical" ? "#c62828" :
        evt.severity === "High" ? "#e26b5d" :
        evt.severity === "Moderate" ? "#c78c27" : "#32b7c8";

      const marker = L.circleMarker([evt.latitude, evt.longitude], {
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
      if (onSelectEvent) marker.on("click", () => onSelectEvent(evt));
    });

    if (showObservations) observations.forEach((observation) => {
      L.circleMarker([observation.latitude, observation.longitude], {
        radius: 5,
        fillColor: "#2c8c67",
        color: "#fff",
        weight: 1,
        fillOpacity: 0.8,
      })
        .addTo(map)
        .bindPopup(
          `<strong>${observation.dataSource} observation</strong><br/>${observation.city}, ${observation.state}<br/>` +
          `${observation.weatherCondition} · ${observation.dataQualityFlag} data quality`,
          { maxWidth: 240 },
        );
    });
  }, [events, observations, showEvents, showObservations, onSelectEvent]);

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
  const [activeTab, setActiveTab] = useState(1);
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
    { label: "Top Events", icon: BarChart2, count: events.length },
    { label: "National Overview", icon: Activity, count: null },
    { label: "Weather Events", icon: CloudRain, count: events.length },
    { label: "Rainfall Intelligence", icon: Droplets, count: precipEvents.length },
    { label: "Temperature & Heatwave", icon: Thermometer, count: tempWindEvents.length },
    { label: "Thunderstorm & Lightning", icon: Wind, count: events.filter((e) => ["Thunderstorm", "Lightning", "Hailstorm"].includes(e.eventType)).length },
    { label: "Flood & Water Risk", icon: Droplets, count: floodEvents.length },
    { label: "Wind & Dust Intelligence", icon: Wind, count: events.filter((e) => ["Strong Wind", "Dust Storm", "Cyclone"].includes(e.eventType)).length },
    { label: "Fog & Visibility", icon: CloudRain, count: events.filter((e) => e.eventType === "Fog").length },
    { label: "Cyclone Intelligence", icon: AlertTriangle, count: events.filter((e) => e.eventType === "Cyclone").length },
    { label: "Weather Anomaly", icon: AlertTriangle, count: anomalies.length },
    { label: "Drought & Climate Stress", icon: Flame, count: heatwaveEvents.length },
    { label: "Historical & Climate Analysis", icon: Database, count: null },
    { label: "Forecast vs Actual", icon: Brain, count: citizenReports.length },
    { label: "Ground Evidence Pipeline", icon: Database, count: citizenReports.filter((report) => report.status === "VERIFIED").length },
    { label: "Citizen Intelligence", icon: Users, count: citizenReports.length },
    { label: "Warning Center", icon: AlertTriangle, count: events.filter((event) => ["High", "Critical"].includes(event.severity)).length },
    { label: "Risk & Impact", icon: Activity, count: events.length },
    { label: "Data Quality", icon: Database, count: observations.length },
  ];

  const tabGroups = [
    { label: "National Situation", icon: Activity, tabs: [1, 0] },
    { label: "Weather Events", icon: CloudRain, tabs: [2] },
    { label: "VAYU Intelligence", icon: Wind, tabs: [3, 4, 5, 6, 7, 8, 9, 10, 11] },
    { label: "VISTA Intelligence", icon: ShieldCheck, tabs: [15, 14] },
    { label: "Forecast", icon: Brain, tabs: [13] },
    { label: "Historical / Climate", icon: Database, tabs: [12] },
    { label: "Warning & Risk", icon: AlertTriangle, tabs: [16, 17] },
    { label: "Data Quality", icon: Database, tabs: [18] },
  ];
  const activeGroup = tabGroups.find((group) => group.tabs.includes(activeTab)) ?? tabGroups[0];

  return (
    <div className="vayu-page">
      {/* ── Header */}
      <div className="vayu-header">
        <div className="vayu-header-left">
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
      <div className="vayu-tabs vayu-primary-tabs" role="tablist" aria-label="Analysis sections">
        {tabGroups.map((group) => {
          const Icon = group.icon;
          const selected = group.tabs.includes(activeTab);
          return (
            <button
              key={group.label}
              role="tab"
              aria-selected={selected}
              className={`vayu-tab-btn ${selected ? "active" : ""}`}
              onClick={() => setActiveTab(group.tabs[0])}
            >
              <Icon size={13} />
              {group.label}
            </button>
          );
        })}
      </div>
      {activeGroup.tabs.length > 1 && (
        <div className="vayu-tabs vayu-secondary-tabs" role="tablist" aria-label={`${activeGroup.label} views`}>
          {activeGroup.tabs.map((tabIndex) => {
            const tab = tabs[tabIndex];
          const Icon = tab.icon;
          return (
            <button
              key={tabIndex}
              role="tab"
              aria-selected={activeTab === tabIndex}
              className={`vayu-tab-btn ${activeTab === tabIndex ? "active" : ""}`}
              onClick={() => setActiveTab(tabIndex)}
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
      )}

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
            <TopEventsTab events={events} onSelectEvent={setSelectedEvent} />
          )}
          {activeTab === 1 && (
            <NationalOverviewTab
              events={events}
              summary={summary}
              eventDistData={eventDistData}
              donutColours={donutColours}
              sourceBarData={sourceBarData}
              observations={observations}
              referenceTime={lastUpdated}
              onSelectEvent={setSelectedEvent}
            />
          )}
          {activeTab === 2 && (
            <WeatherEventsTab
              events={events}
              onSelectEvent={setSelectedEvent}
            />
          )}
          {activeTab === 3 && (
            <PrecipitationTab events={precipEvents} observations={observations} />
          )}
          {activeTab === 4 && (
            <TempWindTab events={tempWindEvents} observations={observations} />
          )}
          {activeTab === 5 && (
            <ThunderstormLightningTab events={events} />
          )}
          {activeTab === 6 && (
            <FloodDroughtTab floodEvents={floodEvents} heatwaveEvents={heatwaveEvents} />
          )}
          {activeTab === 7 && (
            <WindDustTab events={events} />
          )}
          {activeTab === 8 && (
            <FogVisibilityTab events={events} />
          )}
          {activeTab === 9 && (
            <CycloneTab events={events} />
          )}
          {activeTab === 10 && (
            <AnomaliesTab anomalies={anomalies} />
          )}
          {activeTab === 11 && (
            <DroughtStressTab events={events} />
          )}
          {activeTab === 12 && (
            <HistoricalClimateTab observations={observations} events={events} />
          )}
          {activeTab === 13 && <ForecastActualTab />}
          {activeTab === 14 && <VerifiedGroundPipelineTab />}
          {activeTab === 15 && <CitizenIntelligenceTab reports={citizenReports} />}
          {activeTab === 16 && <WarningCenterTab events={events} onSelectEvent={setSelectedEvent} />}
          {activeTab === 17 && <RiskImpactTab events={events} onSelectEvent={setSelectedEvent} />}
          {activeTab === 18 && <DataQualityCenterTab observations={observations} />}
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
// Top Events
// ─────────────────────────────────────────────────────────────────

function TopEventsTab({
  events,
  onSelectEvent,
}: {
  events: WeatherEvent[];
  onSelectEvent: (evt: WeatherEvent) => void;
}) {
  return (
    <>
      <div className="vayu-grid-main">
        <div className="vayu-panel">
          <div className="vayu-panel-header">
            <div>
              <p className="vayu-panel-kicker">Top Event Feed</p>
              <h3 className="vayu-panel-title">Verified event stream — last 50 updates</h3>
            </div>
          </div>
          <div className="vayu-panel-body">
            <div className="vayu-map-wrap" style={{ height: 260 }}>
              <AnalysisMap events={events} />
            </div>
            <div className="vayu-map-legend" style={{ marginTop: 10 }}>
              <span><span className="vayu-legend-dot critical" /> Critical</span>
              <span><span className="vayu-legend-dot high" /> High</span>
              <span><span className="vayu-legend-dot moderate" /> Moderate</span>
              <span><span className="vayu-legend-dot low" /> Low</span>
            </div>
          </div>
        </div>

        <div className="vayu-panel">
          <div className="vayu-panel-header">
            <div>
              <p className="vayu-panel-kicker">Priority Summary</p>
              <h3 className="vayu-panel-title">Event intensity snapshot</h3>
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
      </div>

      <div className="vayu-panel">
        <div className="vayu-panel-header">
          <div>
            <p className="vayu-panel-kicker">Recent Verified Events</p>
            <h3 className="vayu-panel-title">Top events list</h3>
          </div>
          <span style={{ font: "9px 'DM Mono', monospace", color: "#789196" }}>{events.length} records</span>
        </div>
        <div className="vayu-panel-body no-pad">
          <div className="vayu-table-wrap">
            <table className="vayu-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Location</th>
                  <th>Severity</th>
                  <th>Confidence</th>
                  <th>Rainfall</th>
                  <th>Temp</th>
                  <th>Wind</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {events.slice(0, 50).map((evt) => (
                  <tr key={evt.eventId} style={{ cursor: "pointer" }} onClick={() => onSelectEvent(evt)}>
                    <td><strong>{evt.title}</strong></td>
                    <td>{evt.city}, {evt.state}</td>
                    <td><span className={`vayu-severity ${severityClass(evt.severity)}`}>{evt.severity}</span></td>
                    <td className="mono">{evt.confidence}%</td>
                    <td className="mono">{evt.rainfallMm} mm</td>
                    <td className="mono">{evt.temperatureC}°C</td>
                    <td className="mono">{evt.windSpeedKmh} km/h</td>
                    <td className="dim">{evt.source}</td>
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
// Tab 0 / National Overview
// ─────────────────────────────────────────────────────────────────

function NationalOverviewTab({
  events,
  summary,
  eventDistData,
  donutColours,
  sourceBarData,
  observations,
  referenceTime,
  onSelectEvent,
}: {
  events: WeatherEvent[];
  summary: AnalyticsSummary | null;
  eventDistData: { label: string; value: number }[];
  donutColours: string[];
  sourceBarData: { label: string; value: number }[];
  observations: WeatherObservation[];
  referenceTime: Date;
  onSelectEvent: (evt: WeatherEvent) => void;
}) {
  const [showEventLayer, setShowEventLayer] = useState(true);
  const [showObservationLayer, setShowObservationLayer] = useState(false);
  const [hoursBack, setHoursBack] = useState(0);
  const availableTimestamps = [...events.map((event) => event.timestamp), ...observations.map((observation) => observation.timestamp)]
    .map((timestamp) => new Date(timestamp).getTime())
    .filter(Number.isFinite);
  const datasetReferenceTime = availableTimestamps.length ? Math.max(...availableTimestamps) : referenceTime.getTime();
  const cutoff = datasetReferenceTime - hoursBack * 60 * 60 * 1000;
  const mapEvents = events.filter((event) => new Date(event.timestamp).getTime() <= cutoff);
  const mapObservations = observations.filter((observation) => new Date(observation.timestamp).getTime() <= cutoff);
  const stateBreakdown = Object.entries(
    events.reduce<Record<string, number>>((acc, evt) => {
      acc[evt.state] = (acc[evt.state] ?? 0) + 1;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]).slice(0, 6);

  return (
    <>
      <div className="vayu-grid-main">
        <div className="vayu-panel">
          <div className="vayu-panel-header">
            <div>
              <p className="vayu-panel-kicker">National Overview</p>
              <h3 className="vayu-panel-title">National event and observation map</h3>
            </div>
            <span className="vayu-demo-label">DEMO RECORDS · NOT LIVE</span>
          </div>
          <div className="vayu-map-wrap">
            <AnalysisMap
              events={mapEvents}
              observations={mapObservations}
              showEvents={showEventLayer}
              showObservations={showObservationLayer}
              onSelectEvent={onSelectEvent}
            />
          </div>
          <div className="vayu-map-layer-controls">
            <button
              type="button"
              className={`vayu-map-layer-btn ${showEventLayer ? "active" : ""}`}
              aria-pressed={showEventLayer}
              onClick={() => setShowEventLayer((visible) => !visible)}
            >
              Weather events ({mapEvents.length})
            </button>
            <button
              type="button"
              className={`vayu-map-layer-btn ${showObservationLayer ? "active" : ""}`}
              aria-pressed={showObservationLayer}
              onClick={() => setShowObservationLayer((visible) => !visible)}
            >
              Weather observations · DEMO ({mapObservations.length})
            </button>
            <label className="vayu-map-time-control">
              Demo dataset cutoff: {formatIST(new Date(cutoff).toISOString())}
              <input
                type="range"
                min="0"
                max="3"
                step="1"
                value={hoursBack}
                onChange={(event) => setHoursBack(Number(event.target.value))}
                aria-label="Map time cutoff, from current demo data to three hours ago"
              />
            </label>
          </div>
          <div className="vayu-map-legend">
            <span><span className="vayu-legend-dot high" /> Weather event</span>
            <span><span className="vayu-legend-dot observation" /> Demo observation</span>
            <span className="vayu-map-source-note">No radar, satellite, or future forecast layer is connected.</span>
          </div>
        </div>

        <div>
          <div className="vayu-panel" style={{ marginBottom: 14 }}>
            <div className="vayu-panel-header">
              <div>
                <p className="vayu-panel-kicker">Distribution</p>
                <h3 className="vayu-panel-title">Event mix by category</h3>
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
                <p className="vayu-panel-kicker">Signal sources</p>
                <h3 className="vayu-panel-title">Source contribution</h3>
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

      <div className="vayu-grid-3">
        {stateBreakdown.map(([state, count]) => (
          <div key={state} className="vayu-dq-card">
            <div className="src-name">{state}</div>
            <strong style={{ font: "500 24px 'DM Mono', monospace", color: "#17354a" }}>{count}</strong>
            <div className="vayu-dq-freshness">active verified weather events</div>
          </div>
        ))}
      </div>

      <div className="vayu-panel">
        <div className="vayu-panel-header">
          <div>
            <p className="vayu-panel-kicker">Key operational indicators</p>
            <h3 className="vayu-panel-title">National summary</h3>
          </div>
        </div>
        <div className="vayu-panel-body">
          <div className="vayu-grid-3">
            <div className="vayu-dq-card">
              <div className="src-name">Active Events</div>
              <div className="src-status live">{summary?.activeEventsCount ?? 0}</div>
              <div className="vayu-dq-freshness">weather alerts in policy window</div>
            </div>
            <div className="vayu-dq-card">
              <div className="src-name">High / Critical</div>
              <div className="src-status demo">{summary?.highSeverityCount ?? 0}</div>
              <div className="vayu-dq-freshness">severe risk watchlist</div>
            </div>
            <div className="vayu-dq-card">
              <div className="src-name">Affected Districts</div>
              <div className="src-status mock">{summary?.affectedDistrictsCount ?? 0}</div>
              <div className="vayu-dq-freshness">districts under observation</div>
            </div>
          </div>
        </div>
      </div>

      <div className="vayu-panel">
        <div className="vayu-panel-header">
          <div>
            <p className="vayu-panel-kicker">Recent hotspots</p>
            <h3 className="vayu-panel-title">The highest confidence verified events</h3>
          </div>
        </div>
        <ul className="vayu-event-list">
          {events.slice(0, 6).map((evt) => (
            <li key={evt.eventId} className="vayu-event-item" onClick={() => onSelectEvent(evt)}>
              <div className={`vayu-event-icon ${eventIconColour(evt.eventType)}`}><CloudRain size={16} /></div>
              <div className="vayu-event-info">
                <strong>{evt.title}</strong>
                <small><span>{evt.city}, {evt.state}</span> · <span>{formatIST(evt.timestamp)}</span></small>
              </div>
              <div className="vayu-event-meta">
                <span className={`vayu-severity ${severityClass(evt.severity)}`}>{evt.severity}</span>
                <span className="vayu-event-time">Conf: {evt.confidence}%</span>
              </div>
              <ArrowUpRight size={14} color="#b8cbc9" />
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function CitizenIntelligenceTab({ reports }: { reports: CitizenAnalysisReport[] }) {
  const statusCounts = [
    { label: "Verified", value: reports.filter((report) => report.status === "VERIFIED").length },
    { label: "Pending", value: reports.filter((report) => report.status === "PENDING").length },
    { label: "Suspicious", value: reports.filter((report) => report.status === "SUSPICIOUS").length },
    { label: "Unsupported", value: reports.filter((report) => report.status === "UNSUPPORTED").length },
  ];
  const categories = Object.entries(reports.reduce<Record<string, number>>((counts, report) => {
    counts[report.category] = (counts[report.category] ?? 0) + 1;
    return counts;
  }, {})).map(([label, value]) => ({ label, value }));
  const states = Object.entries(reports.reduce<Record<string, number>>((counts, report) => {
    counts[report.state] = (counts[report.state] ?? 0) + 1;
    return counts;
  }, {})).map(([label, value]) => ({ label, value }));

  return (
    <>
      <div className="vayu-pipeline-note">DEMO GROUND REPORTS · Citizen observations are not official meteorological measurements. VISTA automation and source trust scoring are not connected.</div>
      <div className="vayu-grid-3">
        <div className="vayu-panel"><div className="vayu-panel-header"><div><p className="vayu-panel-kicker">Ground reports</p><h3 className="vayu-panel-title">Verification status</h3></div></div><div className="vayu-panel-body"><BarList data={statusCounts} colour="green" /></div></div>
        <div className="vayu-panel"><div className="vayu-panel-header"><div><p className="vayu-panel-kicker">Report classification</p><h3 className="vayu-panel-title">By event type</h3></div></div><div className="vayu-panel-body">{categories.length ? <BarList data={categories} colour="cyan" /> : <div className="vayu-empty">No reports in the selected window.</div>}</div></div>
        <div className="vayu-panel"><div className="vayu-panel-header"><div><p className="vayu-panel-kicker">Geographic distribution</p><h3 className="vayu-panel-title">Reports by state</h3></div></div><div className="vayu-panel-body">{states.length ? <BarList data={states} colour="amber" /> : <div className="vayu-empty">No reports in the selected window.</div>}</div></div>
      </div>
      <div className="vayu-panel">
        <div className="vayu-panel-header"><div><p className="vayu-panel-kicker">Citizen observations</p><h3 className="vayu-panel-title">Recent ground reports</h3></div><span className="vayu-demo-label">{reports.length} DEMO RECORDS</span></div>
        {reports.length ? reports.slice(0, 30).map((report) => (
          <div className="vayu-cit-item" key={report.reportId}>
            <div className="vayu-cit-avatar"><CloudRain size={14} /></div>
            <div className="vayu-cit-body"><strong>{report.category} · {report.city}, {report.state}</strong><p>{report.text}</p><div className="vayu-cit-meta"><span className={`vayu-vstatus ${verificationClass(report.status)}`}>{report.status}</span><span className="vayu-cit-time">{formatIST(report.timestamp)}</span></div></div>
          </div>
        )) : <div className="vayu-empty">No citizen reports match current filters.</div>}
      </div>
    </>
  );
}

function WarningCenterTab({ events, onSelectEvent }: { events: WeatherEvent[]; onSelectEvent: (event: WeatherEvent) => void }) {
  const candidates = events.filter((event) => event.severity === "High" || event.severity === "Critical");
  return (
    <>
      <div className="vayu-pipeline-note warning">VAANKAN DETECTED EVENTS · DEMO ONLY · NOT OFFICIAL WARNINGS. Confirm authoritative warning status from the responsible agency.</div>
      <div className="vayu-panel">
        <div className="vayu-panel-header"><div><p className="vayu-panel-kicker">Decision support</p><h3 className="vayu-panel-title">High-severity event candidates</h3></div><span className="vayu-demo-label">{candidates.length} DEMO CANDIDATES</span></div>
        {candidates.length ? candidates.map((event) => (
          <button type="button" className="vayu-warning-row" key={event.eventId} onClick={() => onSelectEvent(event)}>
            <span className={`vayu-severity ${severityClass(event.severity)}`}>{event.severity}</span>
            <span className="vayu-warning-title"><strong>{event.title}</strong><small>{event.city}, {event.district}, {event.state}</small></span>
            <span className="vayu-warning-meta">VAANKAN DETECTED<br />{formatIST(event.timestamp)}</span>
            <ArrowUpRight size={15} />
          </button>
        )) : <div className="vayu-empty">No high-severity demo events match current filters.</div>}
      </div>
    </>
  );
}

function RiskImpactTab({ events, onSelectEvent }: { events: WeatherEvent[]; onSelectEvent: (event: WeatherEvent) => void }) {
  return (
    <>
      <div className="vayu-pipeline-note">VAANKAN DECISION SUPPORT · Population and infrastructure exposure datasets are not connected. No impact estimates are generated.</div>
      <div className="vayu-panel">
        <div className="vayu-panel-header"><div><p className="vayu-panel-kicker">Event extent</p><h3 className="vayu-panel-title">Known demo evidence and unavailable exposure</h3></div><span className="vayu-demo-label">ILLUSTRATIVE INPUTS</span></div>
        <div className="vayu-panel-body no-pad"><div className="vayu-table-wrap"><table className="vayu-table"><thead><tr><th>Event</th><th>Location</th><th>Severity</th><th>Demo radius</th><th>Ground reports</th><th>Population / infrastructure</th></tr></thead><tbody>
          {events.map((event) => <tr key={event.eventId} onClick={() => onSelectEvent(event)} style={{ cursor: "pointer" }}><td>{event.title}</td><td>{event.city}, {event.state}</td><td><span className={`vayu-severity ${severityClass(event.severity)}`}>{event.severity}</span></td><td className="mono">{event.affectedRadiusKm.toFixed(1)} km · DEMO</td><td className="mono">{event.verifiedReportCount} verified / {event.reportCount} total</td><td className="dim">Not connected</td></tr>)}
        </tbody></table></div>{events.length === 0 && <div className="vayu-empty">No events match current filters.</div>}</div>
      </div>
    </>
  );
}

function DataQualityCenterTab({ observations }: { observations: WeatherObservation[] }) {
  const flags = [
    { label: "Good", value: observations.filter((observation) => observation.dataQualityFlag === "Good").length },
    { label: "Questionable / Suspect", value: observations.filter((observation) => observation.dataQualityFlag === "Suspect").length },
    { label: "Estimated", value: observations.filter((observation) => observation.dataQualityFlag === "Estimated").length },
  ];
  const sources = [...new Set(observations.map((observation) => observation.dataSource))];
  return (
    <>
      <div className="vayu-pipeline-note">DEMO OBSERVATION SAMPLE · These counts describe the selected local dataset only; they are not national coverage or live source-health metrics.</div>
      <div className="vayu-grid-2">
        <div className="vayu-panel"><div className="vayu-panel-header"><div><p className="vayu-panel-kicker">Observation flags</p><h3 className="vayu-panel-title">Sample data quality distribution</h3></div></div><div className="vayu-panel-body">{observations.length ? <BarList data={flags} colour="green" /> : <div className="vayu-empty">No observations in the selected window.</div>}</div></div>
        <div className="vayu-panel"><div className="vayu-panel-header"><div><p className="vayu-panel-kicker">Provenance</p><h3 className="vayu-panel-title">Sample source coverage</h3></div></div><div className="vayu-panel-body"><div className="vayu-metric-row"><span className="vayu-metric-label">Observations in view</span><span className="vayu-metric-value">{observations.length}</span></div><div className="vayu-metric-row"><span className="vayu-metric-label">States represented</span><span className="vayu-metric-value">{new Set(observations.map((observation) => observation.state)).size}</span></div><div className="vayu-metric-row"><span className="vayu-metric-label">Sample sources</span><span className="vayu-metric-value">{sources.join(", ") || "None"}</span></div><div className="vayu-metric-row"><span className="vayu-metric-label">Live health / freshness</span><span className="vayu-metric-value">Not connected</span></div></div></div>
      </div>
    </>
  );
}

function ThunderstormLightningTab({ events }: { events: WeatherEvent[] }) {
  const thunder = events.filter((e) => ["Thunderstorm", "Lightning", "Hailstorm"].includes(e.eventType));
  const peak = thunder.reduce((max, e) => Math.max(max, e.windSpeedKmh), 0);

  return (
    <>
      <div className="vayu-grid-2">
        <div className="vayu-panel">
          <div className="vayu-panel-header">
            <div>
              <p className="vayu-panel-kicker">Convective Activity</p>
              <h3 className="vayu-panel-title">Thunderstorm & lightning watch</h3>
            </div>
          </div>
          <div className="vayu-panel-body">
            <div className="vayu-metric-row">
              <span className="vayu-metric-label">Active Convective Events</span>
              <span className="vayu-metric-value high">{thunder.length}</span>
            </div>
            <div className="vayu-metric-row">
              <span className="vayu-metric-label">Peak Wind Speed</span>
              <span className="vayu-metric-value high">{peak} km/h</span>
            </div>
            <div className="vayu-metric-row">
              <span className="vayu-metric-label">Hailstorm Cells</span>
              <span className="vayu-metric-value moderate">{events.filter((e) => e.eventType === "Hailstorm").length}</span>
            </div>
          </div>
        </div>

        <div className="vayu-panel">
          <div className="vayu-panel-header">
            <div>
              <p className="vayu-panel-kicker">Current risk</p>
              <h3 className="vayu-panel-title">Severe convective intensity</h3>
            </div>
          </div>
          <div className="vayu-panel-body">
            <BarList
              data={thunder.slice(0, 6).map((e) => ({ label: `${e.city} (${e.state.slice(0, 3)})`, value: e.confidence, suffix: "%" }))}
              colour="amber"
            />
          </div>
        </div>
      </div>

      <div className="vayu-panel">
        <div className="vayu-panel-header">
          <div>
            <p className="vayu-panel-kicker">Details</p>
            <h3 className="vayu-panel-title">Thunderstorm & lightning event log</h3>
          </div>
        </div>
        <div className="vayu-panel-body no-pad">
          <div className="vayu-table-wrap">
            <table className="vayu-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Location</th>
                  <th>Rainfall</th>
                  <th>Wind</th>
                  <th>Severity</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {thunder.map((evt) => (
                  <tr key={evt.eventId}>
                    <td>{evt.eventType}</td>
                    <td>{evt.city}, {evt.state}</td>
                    <td className="mono">{evt.rainfallMm} mm</td>
                    <td className="mono">{evt.windSpeedKmh} km/h</td>
                    <td><span className={`vayu-severity ${severityClass(evt.severity)}`}>{evt.severity}</span></td>
                    <td className="mono">{evt.confidence}%</td>
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

function WindDustTab({ events }: { events: WeatherEvent[] }) {
  const windEvents = events.filter((e) => ["Strong Wind", "Dust Storm", "Cyclone"].includes(e.eventType));
  const maxGust = windEvents.reduce((max, e) => Math.max(max, e.windSpeedKmh), 0);

  return (
    <>
      <div className="vayu-grid-2">
        <div className="vayu-panel">
          <div className="vayu-panel-header">
            <div>
              <p className="vayu-panel-kicker">Wind Field</p>
              <h3 className="vayu-panel-title">Strong wind & dust storm fields</h3>
            </div>
          </div>
          <div className="vayu-panel-body">
            <div className="vayu-metric-row">
              <span className="vayu-metric-label">High Wind Events</span>
              <span className="vayu-metric-value high">{windEvents.length}</span>
            </div>
            <div className="vayu-metric-row">
              <span className="vayu-metric-label">Peak Gust</span>
              <span className="vayu-metric-value high">{maxGust} km/h</span>
            </div>
            <div className="vayu-metric-row">
              <span className="vayu-metric-label">Dust Storm Cells</span>
              <span className="vayu-metric-value moderate">{events.filter((e) => e.eventType === "Dust Storm").length}</span>
            </div>
          </div>
        </div>

        <div className="vayu-panel">
          <div className="vayu-panel-header">
            <div>
              <p className="vayu-panel-kicker">Warning Summary</p>
              <h3 className="vayu-panel-title">Wind and dust exposure</h3>
            </div>
          </div>
          <div className="vayu-panel-body">
            <BarList
              data={windEvents.slice(0, 6).map((e) => ({ label: `${e.city} (${e.state.slice(0, 3)})`, value: e.windSpeedKmh, suffix: " km/h" }))}
              colour="amber"
            />
          </div>
        </div>
      </div>

      <div className="vayu-panel">
        <div className="vayu-panel-header">
          <div>
            <p className="vayu-panel-kicker">Wind / dust log</p>
            <h3 className="vayu-panel-title">Strong winds, gusts and dust events</h3>
          </div>
        </div>
        <div className="vayu-panel-body no-pad">
          <div className="vayu-table-wrap">
            <table className="vayu-table">
              <thead>
                <tr>
                  <th>Event Type</th>
                  <th>Location</th>
                  <th>Wind</th>
                  <th>Visibility</th>
                  <th>Radius</th>
                  <th>Severity</th>
                </tr>
              </thead>
              <tbody>
                {windEvents.map((evt) => (
                  <tr key={evt.eventId}>
                    <td>{evt.eventType}</td>
                    <td>{evt.city}, {evt.state}</td>
                    <td className="mono">{evt.windSpeedKmh} km/h</td>
                    <td className="mono">{evt.visibilityKm ?? 0} km</td>
                    <td className="mono">{evt.affectedRadiusKm} km</td>
                    <td><span className={`vayu-severity ${severityClass(evt.severity)}`}>{evt.severity}</span></td>
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

function FogVisibilityTab({ events }: { events: WeatherEvent[] }) {
  const fogEvents = events.filter((e) => e.eventType === "Fog");
  const avgVis = fogEvents.length
    ? fogEvents.reduce((sum, e) => sum + (e.visibilityKm ?? 0), 0) / fogEvents.length
    : 0;

  return (
    <>
      <div className="vayu-grid-2">
        <div className="vayu-panel">
          <div className="vayu-panel-header">
            <div>
              <p className="vayu-panel-kicker">Visibility degradation</p>
              <h3 className="vayu-panel-title">Fog and reduced visibility</h3>
            </div>
          </div>
          <div className="vayu-panel-body">
            <div className="vayu-metric-row">
              <span className="vayu-metric-label">Fog Events</span>
              <span className="vayu-metric-value moderate">{fogEvents.length}</span>
            </div>
            <div className="vayu-metric-row">
              <span className="vayu-metric-label">Average Visibility</span>
              <span className="vayu-metric-value high">{avgVis.toFixed(1)} km</span>
            </div>
            <div className="vayu-metric-row">
              <span className="vayu-metric-label">Affected Districts</span>
              <span className="vayu-metric-value low">{new Set(fogEvents.map((e) => e.district)).size}</span>
            </div>
          </div>
        </div>

        <div className="vayu-panel">
          <div className="vayu-panel-header">
            <div>
              <p className="vayu-panel-kicker">Risk matrix</p>
              <h3 className="vayu-panel-title">Low-visibility impact</h3>
            </div>
          </div>
          <div className="vayu-panel-body">
            <BarList
              data={fogEvents.slice(0, 6).map((e) => ({ label: `${e.city} (${e.state.slice(0, 3)})`, value: Number((e.visibilityKm ?? 0).toFixed(1)), suffix: " km" }))}
              colour="cyan"
            />
          </div>
        </div>
      </div>
    </>
  );
}

function CycloneTab({ events }: { events: WeatherEvent[] }) {
  const cycloneEvents = events.filter((e) => e.eventType === "Cyclone");

  return (
    <>
      <div className="vayu-grid-2">
        <div className="vayu-panel">
          <div className="vayu-panel-header">
            <div>
              <p className="vayu-panel-kicker">Cyclone track</p>
              <h3 className="vayu-panel-title">Storm path and coastal exposure</h3>
            </div>
          </div>
          <div className="vayu-panel-body">
            <div className="vayu-metric-row">
              <span className="vayu-metric-label">Cyclone Watches</span>
              <span className="vayu-metric-value high">{cycloneEvents.length}</span>
            </div>
            <div className="vayu-metric-row">
              <span className="vayu-metric-label">Maximum Risk Radius</span>
              <span className="vayu-metric-value high">{cycloneEvents.reduce((max, e) => Math.max(max, e.affectedRadiusKm), 0)} km</span>
            </div>
            <div className="vayu-metric-row">
              <span className="vayu-metric-label">Primary Coastal States</span>
              <span className="vayu-metric-value moderate">{new Set(cycloneEvents.map((e) => e.state)).size}</span>
            </div>
          </div>
        </div>

        <div className="vayu-panel">
          <div className="vayu-panel-header">
            <div>
              <p className="vayu-panel-kicker">Risk intensity</p>
              <h3 className="vayu-panel-title">Cyclone intensity benchmark</h3>
            </div>
          </div>
          <div className="vayu-panel-body">
            <BarList
              data={cycloneEvents.slice(0, 6).map((e) => ({ label: `${e.city}, ${e.state}`, value: e.confidence, suffix: "%" }))}
              colour="coral"
            />
          </div>
        </div>
      </div>
    </>
  );
}

function DroughtStressTab({ events }: { events: WeatherEvent[] }) {
  const heat = events.filter((e) => e.eventType === "Heatwave");
  const dryStress = heat.length + events.filter((e) => e.eventType === "Dust Storm").length;

  return (
    <>
      <div className="vayu-grid-2">
        <div className="vayu-panel">
          <div className="vayu-panel-header">
            <div>
              <p className="vayu-panel-kicker">Climate stress</p>
              <h3 className="vayu-panel-title">Drought and heat stress index</h3>
            </div>
          </div>
          <div className="vayu-panel-body">
            <div className="vayu-metric-row">
              <span className="vayu-metric-label">Heatwave Areas</span>
              <span className="vayu-metric-value high">{heat.length}</span>
            </div>
            <div className="vayu-metric-row">
              <span className="vayu-metric-label">Dry Stress Signals</span>
              <span className="vayu-metric-value moderate">{dryStress}</span>
            </div>
            <div className="vayu-metric-row">
              <span className="vayu-metric-label">SPI Data Status</span>
              <span className="vayu-metric-value low">Mock</span>
            </div>
          </div>
        </div>

        <div className="vayu-panel">
          <div className="vayu-panel-header">
            <div>
              <p className="vayu-panel-kicker">Heat stress</p>
              <h3 className="vayu-panel-title">Peak temperature summary</h3>
            </div>
          </div>
          <div className="vayu-panel-body">
            <BarList
              data={heat.slice(0, 6).map((e) => ({ label: `${e.city}`, value: e.temperatureC, suffix: "°C" }))}
              colour="coral"
            />
          </div>
        </div>
      </div>
    </>
  );
}

function HistoricalClimateTab({ observations, events }: { observations: WeatherObservation[]; events: WeatherEvent[] }) {
  const avgRain = observations.reduce((sum, o) => sum + o.rainfall24hMm, 0) / Math.max(observations.length, 1);
  const avgTemp = observations.reduce((sum, o) => sum + o.temperatureC, 0) / Math.max(observations.length, 1);
  const avgRainAnomaly = observations.reduce((sum, observation) => sum + observation.rainfallAnomaly, 0) / Math.max(observations.length, 1);
  const avgTemperatureAnomaly = observations.reduce((sum, observation) => sum + observation.temperatureAnomaly, 0) / Math.max(observations.length, 1);
  const avgWindAnomaly = observations.reduce((sum, observation) => sum + observation.windAnomaly, 0) / Math.max(observations.length, 1);

  return (
    <>
      <div className="vayu-grid-3">
        <div className="vayu-panel">
          <div className="vayu-panel-header">
            <div>
              <p className="vayu-panel-kicker">Climate baseline</p>
              <h3 className="vayu-panel-title">Current vs expected</h3>
            </div>
          </div>
          <div className="vayu-panel-body">
            <div className="vayu-metric-row">
              <span className="vayu-metric-label">Mean 24h Rainfall</span>
              <span className="vayu-metric-value">{avgRain.toFixed(1)} mm</span>
            </div>
            <div className="vayu-metric-row">
              <span className="vayu-metric-label">Mean Temperature</span>
              <span className="vayu-metric-value">{avgTemp.toFixed(1)}°C</span>
            </div>
            <div className="vayu-metric-row">
              <span className="vayu-metric-label">Event Count</span>
              <span className="vayu-metric-value">{events.length}</span>
            </div>
          </div>
        </div>

        <div className="vayu-panel">
          <div className="vayu-panel-header">
            <div>
              <p className="vayu-panel-kicker">Multi-year trend</p>
              <h3 className="vayu-panel-title">Historical comparison summary</h3>
            </div>
          </div>
          <div className="vayu-panel-body">
              <div className="vayu-pipeline-note">DEMO OBSERVATIONS · Averages below are computed from the selected sample, not official climate normals.</div>
            <BarList
              data={[
                { label: "Rainfall anomaly", value: Math.abs(avgRainAnomaly), suffix: " sample units" },
                { label: "Temperature anomaly", value: Math.abs(avgTemperatureAnomaly), suffix: " °C" },
                { label: "Wind anomaly", value: Math.abs(avgWindAnomaly), suffix: " sample units" },
              ]}
              colour="green"
            />
          </div>
        </div>

        <div className="vayu-panel">
          <div className="vayu-panel-header">
            <div>
              <p className="vayu-panel-kicker">Baseline note</p>
              <h3 className="vayu-panel-title">Model assumption</h3>
            </div>
          </div>
          <div className="vayu-panel-body">
            <div style={{ fontSize: 11, color: "#8a9a9c", lineHeight: 1.7 }}>
              Historical benchmarking is intentionally illustrative in demo mode and requires long-range climatology datasets for fully calibrated comparisons.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function ForecastActualTab() {
  return (
    <>
      <div className="vayu-pipeline-note">DEMO / NOT CONNECTED · Forecast-observation pairs are unavailable. No accuracy or error metrics are reported.</div>
      <div className="vayu-grid-2">
        <div className="vayu-panel">
          <div className="vayu-panel-header">
            <div>
              <p className="vayu-panel-kicker">Forecast intelligence</p>
              <h3 className="vayu-panel-title">Forecast vs actual comparison</h3>
            </div>
          </div>
          <div className="vayu-panel-body">
            <div className="vayu-metric-row">
              <span className="vayu-metric-label">Forecast feed</span>
              <span className="vayu-metric-value">Not connected</span>
            </div>
            <div className="vayu-metric-row">
              <span className="vayu-metric-label">Matched forecast / observation pairs</span>
              <span className="vayu-metric-value">0 available</span>
            </div>
            <div className="vayu-metric-row">
              <span className="vayu-metric-label">MAE / RMSE / Bias</span>
              <span className="vayu-metric-value">Not calculated</span>
            </div>
          </div>
        </div>

        <div className="vayu-panel">
          <div className="vayu-panel-header">
            <div>
              <p className="vayu-panel-kicker">Method</p>
              <h3 className="vayu-panel-title">Forecast evaluation requirements</h3>
            </div>
          </div>
          <div className="vayu-panel-body">
            <div className="vayu-risk-gauge">
              <div className="vayu-risk-number moderate">N/A</div>
              <div>
                <div className="vayu-risk-label">Metrics withheld</div>
                <div className="vayu-risk-sub">MAE, RMSE, and bias require timestamp- and region-aligned forecast and observed measurements.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
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

