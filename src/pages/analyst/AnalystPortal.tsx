import { useEffect, useRef, useState } from "react";
import { Activity, ArrowRight, BarChart3, CloudRain, LayoutDashboard, LogOut, Moon, RefreshCw, ShieldCheck, Sun, Users, X } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./AnalystPortal.css";
import "../../ai-chat.css";
import AnalystAnalysis from "./AnalystAnalysis";
import { sendAnalystCopilotMessage } from "../../services/aiService";
import { DEFAULT_ANALYST_FILTERS, getAnalystDataset, type AnalystEvent, type AnalystDataset } from "../../services/analystService";
import type { CitizenAnalysisReport } from "../admin/Analysis/types";

const EVENT_LABELS: Record<string, string> = {
  "Heavy Rainfall": "Rainfall",
  Flood: "Flooding",
  Fog: "Fog",
  "Strong Wind": "Strong Winds",
  Thunderstorm: "Thunderstorm",
  Lightning: "Thunderstorm",
  Hailstorm: "Thunderstorm",
  Heatwave: "Heatwave",
  "Dust Storm": "Dust Storm",
  Cyclone: "Cyclone",
};

function formatUpdated(value: Date) {
  return value.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function AnalystPortal({
  darkMode,
  setDarkMode,
  onSignOut,
}: {
  darkMode: boolean;
  setDarkMode: (value: boolean) => void;
  onSignOut: () => void;
}) {
  const [route, setRoute] = useState<"dashboard" | "analysis">(
    window.location.pathname.replace(/\/$/, "").endsWith("/analysis") ? "analysis" : "dashboard",
  );

  useEffect(() => {
    if (window.location.pathname === "/analyst" || window.location.pathname === "/analyst/") {
      window.history.replaceState({}, "", "/analyst/dashboard");
    }
    const onPopState = () => {
      setRoute(window.location.pathname.replace(/\/$/, "").endsWith("/analysis") ? "analysis" : "dashboard");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = (next: "dashboard" | "analysis") => {
    window.history.pushState({}, "", `/analyst/${next}`);
    setRoute(next);
  };

  return (
    <div className={`analyst-shell portal-theme-analyst ${darkMode ? "night-mode" : ""}`}>
      <aside className="analyst-sidebar">
        <a className="analyst-brand" href="/analyst/dashboard" onClick={(event) => { event.preventDefault(); navigate("dashboard"); }}>
          <span className="analyst-brand-mark"><CloudRain size={19} /></span>
          <span><strong>VAANKAN</strong><small>National Weather<br />Analytics Platform</small></span>
        </a>
        <nav className="analyst-nav" aria-label="Analyst portal">
          <button className={route === "dashboard" ? "active" : ""} onClick={() => navigate("dashboard")}>
            <LayoutDashboard size={17} />Dashboard
          </button>
          <button className={route === "analysis" ? "active" : ""} onClick={() => navigate("analysis")}>
            <BarChart3 size={17} />Analysis
          </button>
        </nav>
        <div className="analyst-sidebar-footer">Analyst workspace <span>DATABASE + WEATHER API</span></div>
      </aside>
      <main className="analyst-main">
        <header className="analyst-topbar">
          <p>National weather intelligence · Analyst workspace</p>
          <div className="analyst-topbar-actions">
            <button type="button" className="analyst-theme-toggle" onClick={() => setDarkMode(!darkMode)} aria-label="Toggle analyst dark mode">{darkMode ? <Sun size={15} /> : <Moon size={15} />}</button>
            <button type="button" onClick={onSignOut}><LogOut size={15} />Sign out</button>
          </div>
        </header>
        {route === "dashboard" ? <AnalystDashboard onNavigate={navigate} /> : <AnalystAnalysis />}
        <AnalystCopilot />
      </main>
    </div>
  );
}

function AnalystCopilot() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState("analyst-session");
  const [messages, setMessages] = useState<Array<{ role: "assistant" | "user"; content: string }>>([
    {
      role: "assistant",
      content: "VAYU is ready to explain severity, anomalies, evidence, and event evolution using the current VAANKAN context.",
    },
  ]);

  const eventId = undefined;
  const quickQuestions = [
    "Why is this event high severity?",
    "What evidence supports this event?",
    "What changed during the last 6 hours?",
    "Which districts are affected?",
    "What anomalies are detected?",
    "Summarize this event.",
  ];

  const sendMessage = async (nextMessage?: string) => {
    const message = (nextMessage ?? draft).trim();
    if (!message || loading) return;

    setMessages((current) => [...current, { role: "user", content: message }]);
    setDraft("");
    setLoading(true);

    try {
      const response = await sendAnalystCopilotMessage(message, eventId, conversationId);
      setMessages((current) => [...current, { role: "assistant", content: response.message }]);
      setConversationId(response.conversation_id);
    } catch {
      setMessages((current) => [...current, { role: "assistant", content: "VAYU Intelligence Copilot is temporarily unavailable. You can continue using the Analyst dashboard and event analysis." }]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <div className="assistant-floating-shell">
        <button type="button" className="assistant-launcher" onClick={() => setOpen(true)} aria-label="Open VAYU Intelligence Copilot">
          <Activity size={18} />
          <span>VAYU Intelligence Copilot</span>
        </button>
      </div>
    );
  }

  return (
    <div className="assistant-floating-shell">
      <div className="assistant-panel analyst-copilot-panel">
        <div className="assistant-header">
          <div>
            <p className="assistant-kicker">VAYU</p>
            <h3>VAYU Intelligence Copilot</h3>
          </div>
          <button type="button" className="assistant-close" onClick={() => setOpen(false)} aria-label="Close analyst copilot">×</button>
        </div>
        <div className="assistant-context">
          {eventId ? `Selected event: ${eventId}` : "No event selected; the copilot will use the latest VAANKAN intelligence context."}
        </div>
        <div className="assistant-quick-questions">
          {quickQuestions.map((question) => (
            <button key={question} type="button" onClick={() => void sendMessage(question)} disabled={loading}>
              {question}
            </button>
          ))}
        </div>
        <div className="assistant-message-list">
          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={`assistant-message ${message.role}`}>
              {message.content}
            </div>
          ))}
          {loading && <div className="assistant-message assistant loading">VAYU is analyzing the available intelligence...</div>}
        </div>
        <div className="assistant-input-row">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void sendMessage();
              }
            }}
            placeholder="Ask VAYU..."
            aria-label="Ask the VAYU Intelligence Copilot"
          />
          <button type="button" onClick={() => void sendMessage()} disabled={loading || !draft.trim()}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function AnalystDashboard({ onNavigate }: { onNavigate: (route: "dashboard" | "analysis") => void }) {
  const [events, setEvents] = useState<AnalystEvent[]>([]);
  const [reports, setReports] = useState<CitizenAnalysisReport[]>([]);
  const [dataMode, setDataMode] = useState<AnalystDataset["mode"]>("NOT_CONNECTED");
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<AnalystEvent | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    void getAnalystDataset(DEFAULT_ANALYST_FILTERS).then((dataset) => {
      if (!active) return;
      setEvents(dataset.events);
      setReports(dataset.reports);
      setDataMode(dataset.mode);
      setLastUpdated(new Date(dataset.updatedAt));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [refreshKey]);

  const todayEvents = events.filter((event) => lastUpdated.getTime() - new Date(event.timestamp).getTime() <= 24 * 60 * 60 * 1000).length;
  const pendingReports = reports.filter((report) => report.status === "PENDING").length;
  const verifiedReports = reports.filter((report) => report.status === "VERIFIED");
  const verificationRate = reports.length ? Math.round(verifiedReports.length * 100 / reports.length) : null;
  const priorityEvents = events.filter((event) => event.severity === "High" || event.severity === "Critical");
  const criticalCount = priorityEvents.filter((event) => event.severity === "Critical").length;
  const highCount = priorityEvents.filter((event) => event.severity === "High").length;
  const hasSeverityData = events.some((event) => ["Low", "Moderate", "High", "Critical"].includes(event.severity));
  const activeEvents = events.filter((event) => !["RESOLVED", "CLOSED", "ENDED"].includes((event.eventStatus ?? "").toUpperCase()));
  const affectedDistricts = new Set(events.map((event) => event.district).filter(Boolean)).size;

  const eventTypeCounts = Object.entries(events.reduce<Record<string, number>>((counts, event) => {
    const label = EVENT_LABELS[event.eventType] ?? "Other";
    counts[label] = (counts[label] ?? 0) + 1;
    return counts;
  }, {})).sort((left, right) => right[1] - left[1]);
  const severityCounts = ["Low", "Moderate", "High", "Critical"].map((severity) => ({
    label: severity,
    count: events.filter((event) => event.severity === severity).length,
  }));
  const maxEventCount = Math.max(1, ...eventTypeCounts.map((item) => item[1]));
  const maxSeverityCount = Math.max(1, ...severityCounts.map((item) => item.count));

  return (
    <section className="analyst-dashboard" aria-busy={loading}>
      <div className="analyst-page-heading">
        <div><p className="analyst-eyebrow">ANALYST PORTAL · DATABASE</p><h1>Dashboard</h1><p>PostgreSQL reports with configured meteorological observations</p></div>
        <div className="analyst-refresh-meta"><span>Last updated: {formatUpdated(lastUpdated)}</span><button type="button" onClick={() => { setLoading(true); setRefreshKey((key) => key + 1); }} disabled={loading}><RefreshCw size={15} />Refresh</button></div>
      </div>
      <div className="analyst-demo-banner">Data source: {dataMode}. Reports are read from PostgreSQL; weather observations depend on the configured provider.</div>

      <section className="analyst-kpis" aria-label="Event summary">
        <Kpi icon={CloudRain} label="Total Events" value={loading ? "—" : events.length} note="All recorded weather events" />
        <Kpi icon={Activity} label="Today's Events" value={loading ? "—" : todayEvents} note="Reported in the last 24 hours" />
        <Kpi icon={Users} label="Pending Review" value={loading ? "—" : pendingReports} note="Awaiting verification" />
        <Kpi icon={ShieldCheck} label="Verification Rate" value={verificationRate === null ? "N/A" : `${verificationRate}%`} note={`${verifiedReports.length} of ${reports.length} reports verified`} />
      </section>

      <section className="analyst-overview-section">
        <div className="analyst-section-heading"><div><p className="analyst-eyebrow">WEATHER OVERVIEW</p><h2>National event situation</h2></div><span>Decision support · DEMO</span></div>
        <div className="analyst-insight-grid">
          <Insight label="Active Events" value={loading ? "—" : activeEvents.length} note="Not marked resolved, closed, or ended" />
          <Insight label="High / Critical Events" value={loading ? "—" : events.length && !hasSeverityData ? "N/A" : priorityEvents.length} note={hasSeverityData ? `${criticalCount} critical · ${highCount} high · not official warnings` : "Severity assessment is not available"} />
          <Insight label="Affected Districts" value={loading ? "—" : affectedDistricts} note="Unique districts represented in event records" />
          <Insight label="Anomalies Detected" value="N/A" note="No calibrated anomaly threshold is connected" />
        </div>
      </section>

      <section className="analyst-dashboard-grid analyst-dashboard-map-grid">
        <div className="analyst-panel analyst-map-panel">
          <PanelHeading title="Live Event Map" label="CURRENT EVENT FEED" />
          <DashboardMap events={events} onSelect={setSelectedEvent} />
          <div className="analyst-map-legend">
            {[["Rainfall", "rain"], ["Flooding", "flood"], ["Fog", "fog"], ["Strong Winds", "wind"], ["Thunderstorm", "storm"], ["Heatwave", "heat"], ["Dust Storm", "dust"], ["Cyclone", "cyclone"], ["Other", "other"]].map(([label, color]) => <span key={label}><i className={`legend-${color}`} />{label}</span>)}
          </div>
        </div>
        <div className="analyst-stack">
          <div className="analyst-panel analyst-quick-panel">
            <PanelHeading title="Quick Actions" />
            <QuickAction label="Report Event" onClick={() => window.location.assign("/citizen")} />
            <QuickAction label="Analysis" onClick={() => onNavigate("analysis")} />
          </div>
        </div>
      </section>

      <section className="analyst-dashboard-grid analyst-dashboard-chart-grid">
        <div className="analyst-panel"><PanelHeading title="Events by Type" /><div className="analyst-bars analyst-vertical-bars">{eventTypeCounts.map(([label, count]) => <div className="analyst-vertical-item" key={label}><div className="analyst-vertical-track"><i style={{ height: `${count * 100 / maxEventCount}%` }} /></div><strong>{count}</strong><span>{label}</span></div>)}</div></div>
        <div className="analyst-panel"><PanelHeading title="Severity Distribution" />{events.length && !hasSeverityData ? <div className="analyst-empty">Severity assessment is unavailable for these events.</div> : <div className="analyst-bars">{severityCounts.map(({ label, count }) => <div className="analyst-horizontal-item" key={label}><div><span>{label}</span><strong>{count}</strong></div><i><b className={`severity-${label.toLowerCase()}`} style={{ width: `${count * 100 / maxSeverityCount}%` }} /></i></div>)}</div>}</div>
      </section>

      {selectedEvent && <EventDetailDialog event={selectedEvent} onClose={() => setSelectedEvent(null)} />}
    </section>
  );
}

function Kpi({ icon: Icon, label, value, note }: { icon: typeof CloudRain; label: string; value: string | number; note: string }) {
  return <article className="analyst-kpi"><span className="analyst-kpi-icon"><Icon size={17} /></span><span className="analyst-kpi-label">{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

function Insight({ label, value, note }: { label: string; value: string | number; note: string }) {
  return <article className="analyst-insight"><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

function PanelHeading({ title, label }: { title: string; label?: string }) {
  return <div className="analyst-panel-heading"><h3>{title}</h3>{label && <span>{label}</span>}</div>;
}

function QuickAction({ label, onClick }: { label: string; onClick: () => void }) {
  return <button className="analyst-quick-action" type="button" onClick={onClick}><span>{label}</span><ArrowRight size={15} /></button>;
}

function DashboardMap({ events, onSelect }: { events: AnalystEvent[]; onSelect: (event: AnalystEvent) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { center: [22.8, 80.5], zoom: 4.5, zoomControl: true, attributionControl: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 13, attribution: "© OpenStreetMap contributors" }).addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.eachLayer((layer) => { if (layer instanceof L.CircleMarker || layer instanceof L.Marker) layer.remove(); });
    events.forEach((event) => {
      const color = event.severity === "Critical" ? "#ed625b" : event.severity === "High" ? "#f0a14a" : event.severity === "Moderate" ? "#45bfd0" : "#7a9baa";
      if (event.verificationStatus === "VERIFIED" && event.confidence !== null) L.circleMarker([event.latitude, event.longitude], { radius: 8 + event.confidence * 0.08, color, fill: false, weight: 2, opacity: 0.75 }).addTo(map);
      const marker = L.circleMarker([event.latitude, event.longitude], { radius: 6, color: "#071a2b", weight: 2, fillColor: color, fillOpacity: 1 })
        .bindPopup(`<strong>${event.title}</strong><br>${event.city}, ${event.state}<br>${event.eventType} · ${event.severity}<br>Verification: ${event.verificationStatus}${event.isDemo ? " · DEMO" : ""}`)
          .on("click", () => onSelect(event));
      marker.addTo(map);
    });
        }, [events, onSelect]);

  return <div className="analyst-leaflet-map" ref={containerRef} />;
}

function EventDetailDialog({ event, onClose }: { event: AnalystEvent; onClose: () => void }) {
  return <div className="analyst-dialog-backdrop" role="presentation" onClick={onClose}><section className="analyst-event-dialog" role="dialog" aria-modal="true" aria-label="Event details" onClick={(click) => click.stopPropagation()}><button className="analyst-dialog-close" onClick={onClose} aria-label="Close event details"><X size={17} /></button><p className="analyst-eyebrow">ANALYST EVENT DETAIL {event.isDemo ? "· DEMO" : ""}</p><h2>{event.title}</h2><p>{event.city}, {event.district}, {event.state}</p><div className="analyst-dialog-facts"><span>Type<strong>{event.eventType}</strong></span><span>Severity<strong>{event.severity}</strong></span><span>Source<strong>{event.source}</strong></span><span>Verification<strong>{event.verificationStatus}</strong></span><span>Reported<strong>{new Date(event.timestamp).toLocaleString("en-IN")}</strong></span><span>Location<strong>{event.latitude.toFixed(4)}, {event.longitude.toFixed(4)}</strong></span></div><small>Read-only analyst view. Administrative verification decisions remain in the Admin Portal.</small></section></div>;
}
