import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import L from "leaflet";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  ChevronDown,
  CloudRain,
  Database,
  Filter,
  Gauge,
  Globe2,
  History,
  Home,
  Bell,
  LocateFixed,
  LogOut,
  Navigation,
  UserPlus,
  LayoutDashboard,
  MapPin,
  MapPinned,
  CalendarDays,
  Clock3,
  FileText,
  Mail,
  MessageSquare,
  Menu,
  MoreHorizontal,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Moon,
  Sun,
  TableProperties,
  UserRound,
  UsersRound,
} from "lucide-react";
import "./App.css";
import "./ai-chat.css";
import "leaflet/dist/leaflet.css";
import AnalystPortal from "./pages/analyst/AnalystPortal";
import DataSourceIntelligence from "./pages/admin/DataSourceIntelligence";
import DatabaseRecordsDashboard from "./pages/admin/DatabaseRecordsDashboard";
import { sendCitizenAssistantMessage } from "./services/aiService";
import { acknowledgeCitizenAlert, createReport, listCitizenActivities, listCitizenAlerts, listCitizenReports, listReports, listSubmissionHistory, loginCitizen, registerCitizen, seedSampleEvents, submitToVayu, submitVerification, updateCitizenProfile, type ApiCitizenAlert, type ApiReport, type CitizenActivity, type CitizenAccount } from "./services/reportService";

type View = "dashboard" | "review" | "alert" | "history" | "sources" | "database";
type Status = "Verified" | "Review" | "Suspicious" | "Unsupported";
type Role = "admin" | "citizen";
type Filters = {
  period: string;
  event: string;
  region: string;
  status: string;
};

type Report = {
  id: string;
  title: string;
  location: string;
  source: string;
  time: string;
  status: Status;
  confidence: number | null;
  reports: number;
  tone: "blue" | "coral" | "amber";
  category: string;
  region: string;
  ageHours: number;
  timestamp?: string;
  latitude: number;
  longitude: number;
  intensity: number | null;
  evidence?: EvidenceItem[];
  submitted?: boolean;
};

type EvidenceItem = { name: string; type: string; detail: string };

function apiReportToAdminReport(report: ApiReport): Report {
  const ageHours = Math.max(0, (Date.now() - new Date(report.timestamp).getTime()) / 3_600_000);
  const status: Status = report.verification_status === "VERIFIED" || report.verification_status === "VERIFIED_AND_SUBMITTED_TO_VAYU"
    ? "Verified"
    : report.verification_status === "SUSPICIOUS"
      ? "Suspicious"
      : report.verification_status === "UNSUPPORTED"
        ? "Unsupported"
        : "Review";
  const categoryNames: Record<string, string> = {
    rainfall: "Rainfall",
    thunderstorm: "Thunderstorm",
    flooding: "Flooding",
    heatwave: "Heatwave",
    fog: "Fog",
    dust_storm: "Dust storm",
    strong_winds: "Strong winds",
  };
  return {
    id: report.record_id,
    title: report.text,
    location: `${report.city}, ${report.district}, ${report.state}`,
    source: report.source_name,
    time: new Date(report.timestamp).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
    status,
    submitted: report.submitted ?? report.verification_status === "VERIFIED_AND_SUBMITTED_TO_VAYU",
    confidence: null,
    reports: 1,
    tone: status === "Verified" ? "blue" : status === "Suspicious" || status === "Unsupported" ? "coral" : "amber",
    category: categoryNames[report.event_type_claimed] ?? report.event_type_claimed,
    region: report.state,
    ageHours,
    timestamp: report.timestamp,
    latitude: report.latitude,
    longitude: report.longitude,
    intensity: null,
    evidence: [
      { name: report.record_id, type: "Citizen ground report", detail: "One submitted report; confidence and meteorological corroboration are not assessed." },
      ...(report.image_url ? [{ name: report.image_url, type: "Submitted image", detail: "Media link supplied with report; authenticity is not assessed." }] : []),
      ...(report.video_url ? [{ name: report.video_url, type: "Submitted video", detail: "Media link supplied with report; authenticity is not assessed." }] : []),
    ],
  };
}

type NavItem = {
  label: string;
  icon: typeof LayoutDashboard;
  view: View;
  count?: number;
};

const navItems: NavItem[] = [
  { label: "Admin Panel", icon: LayoutDashboard, view: "dashboard" },
  { label: "History", icon: History, view: "history" },
  { label: "Data Source Intelligence", icon: Database, view: "sources" },
  { label: "Database Records", icon: TableProperties, view: "database" },
];

function adminViewForPath(path: string): View {
  const normalizedPath = path.replace(/\/$/, "");
  if (normalizedPath === "/admin/history") return "history";
  if (normalizedPath === "/admin/data-sources") return "sources";
  if (normalizedPath === "/admin/database") return "database";
  return "dashboard";
}

function StatusPill({ status }: { status: Status }) {
  return (
    <span className={`status-pill ${status.toLowerCase()}`}>
      <span />
      {status}
    </span>
  );
}

function AdminApp() {
  const [view, setView] = useState<View>(adminViewForPath(window.location.pathname));
  const [adminReports, setAdminReports] = useState<Report[]>([]);
  const [reportSource, setReportSource] = useState<"API" | "UNAVAILABLE">("UNAVAILABLE");
  const [reportRefreshCount, setReportRefreshCount] = useState(0);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [role, setRole] = useState<Role>("admin");
  const [darkMode, setDarkMode] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    period: "Last 7 days",
    event: "All events",
    region: "All India",
    status: "All statuses",
  });
  const [mobileNav, setMobileNav] = useState(false);
  const [notice, setNotice] = useState("");
  const [selectedAlert, setSelectedAlert] = useState<Report | null>(null);

  useEffect(() => {
    const syncAdminRoute = () => {
      setView(adminViewForPath(window.location.pathname));
    };
    window.addEventListener("popstate", syncAdminRoute);
    return () => window.removeEventListener("popstate", syncAdminRoute);
  }, []);

  useEffect(() => {
    if (!isAuthenticated && window.location.pathname !== "/admin/login") {
      window.history.replaceState({}, "", "/admin/login");
    }
  }, [isAuthenticated]);

  useEffect(() => {
    let active = true;
    const refreshAdminReports = () => {
      void listReports().then((result) => {
        if (!active) return;
        if (result.ok) {
          setAdminReports(result.data.map(apiReportToAdminReport));
          setReportSource("API");
        } else {
          setAdminReports([]);
          setReportSource("UNAVAILABLE");
        }
      });
    };

    refreshAdminReports();

    const handleReportSync = () => {
      refreshAdminReports();
    };
    window.addEventListener("vaankan-report-synced", handleReportSync);
    return () => {
      active = false;
      window.removeEventListener("vaankan-report-synced", handleReportSync);
    };
  }, [reportRefreshCount]);

  const visibleReports = useMemo(
    () =>
      adminReports.filter((report) => {
        const periodHours =
          filters.period === "Today"
            ? 24
            : filters.period === "Last 7 days"
              ? 168
              : 24;
        return (
          (filters.event === "All events" ||
            report.category === filters.event) &&
          (filters.region === "All India" ||
            report.region === filters.region) &&
          (filters.status === "All statuses" ||
            report.status === filters.status) &&
          report.ageHours <= periodHours
        );
      }),
    [adminReports, filters],
  );

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  };
  const openAlert = (report: Report) => {
    setSelectedAlert(report);
    setView("alert");
    setMobileNav(false);
  };
  const verifyAlert = async (report: Report) => {
    try {
      const response = await submitVerification(
        report.id,
        "VERIFIED",
        "Ground weather evidence reviewed by admin operator",
        "A. Sharma",
      );
      if (response.ok) {
        const verifiedReport = { ...report, status: "Verified" as Status };
        setSelectedAlert(verifiedReport);
        setAdminReports((currentReports) => currentReports.map((item) => item.id === report.id ? verifiedReport : item));
        showNotice(
          `Event ${report.id} verified in PostgreSQL. Submit it next to create alerts and send mail.`,
        );
        window.dispatchEvent(new Event("vaankan-report-synced"));
      } else {
        showNotice(`Decision was not saved to PostgreSQL: ${response.error}`);
      }
    } catch {
      showNotice("Decision was not saved because the backend is unavailable.");
    }
  };
  const submitAlert = async (report: Report) => {
    const result = await submitToVayu(report.id);
    if (!result.ok) {
      showNotice(`Event was not submitted: ${result.error}`);
      return;
    }
    const submittedReport = { ...report, status: "Verified" as Status, submitted: true };
    setSelectedAlert(submittedReport);
    setAdminReports((currentReports) => currentReports.map((item) => item.id === report.id ? submittedReport : item));
    setReportRefreshCount((count) => count + 1);
    window.dispatchEvent(new Event("vaankan-report-synced"));
    showNotice(`Submitted to database. Email: ${result.data.email_status}; recipients within 10 km: ${result.data.notified_count}.`);
  };
  const seedAdminSamples = async () => {
    const result = await seedSampleEvents();
    if (!result.ok) {
      showNotice(`Sample events were not stored: ${result.error}`);
      return;
    }
    setReportRefreshCount((count) => count + 1);
    showNotice(`${result.data.created_count} sample events stored; ${result.data.pending_review_count} pending, ${result.data.pending_near_target_count} within 10 km.`);
  };

  if (!isAuthenticated) {
    return (
      <LoginPage
        onLogin={() => {
          setRole("admin");
          setView("dashboard");
          setIsAuthenticated(true);
          window.history.replaceState({}, "", "/admin");
        }}
        onAction={showNotice}
        notice={notice}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        portal="admin"
      />
    );
  }

  return (
    <div className={`app-shell admin-theme ${darkMode ? "night-mode" : ""}`}>
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div className="brand">
          <span className="brand-mark">
            <CloudRain size={18} />
          </span>
          <span>VAANKAN</span>
          <small>v0.1 / DEMO</small>
        </div>
        <div className="network-status">
          <span className={`pulse ${reportSource === "API" ? "" : "demo"}`} />
          {reportSource === "API" ? "PostgreSQL reports" : "Database unavailable"}
          <strong>{reportSource}</strong>
        </div>
        <nav>
          <p className="nav-label">Admin</p>
          {navItems.map(({ label, icon: Icon, view: itemView, count }) => (
            <button
              key={label}
              className={`nav-item ${view === itemView ? "active" : ""}`}
              onClick={() => {
                setView(itemView);
                window.history.pushState({}, "", itemView === "history" ? "/admin/history" : itemView === "sources" ? "/admin/data-sources" : itemView === "database" ? "/admin/database" : "/admin");
                setMobileNav(false);
              }}
            >
              <Icon size={17} />
              {label}
              {count && <b>{count}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="operator">
            <span className="avatar">AS</span>
            <span>
              <strong>A. Sharma</strong>
              <small>National control room</small>
            </span>
            <MoreHorizontal size={17} />
          </div>
          <button
            className="help-link"
            onClick={() =>
              showNotice("VAANKAN MVP: evidence-first weather intelligence.")
            }
          >
            About this build <ArrowUpRight size={14} />
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => setMobileNav(!mobileNav)}
            aria-label="Toggle navigation"
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            <span>National operations</span>
            <span>/</span>
            <strong>
              {view === "dashboard"
                ? "Admin Panel / Intelligence Operations"
                : view === "history"
                  ? "Admin Submission History"
                  : view === "sources"
                    ? "Data Source Intelligence"
                      : view === "database"
                        ? "Database Records"
                  : view === "review"
                      ? "Admin Review Queue"
                      : `Alert / ${selectedAlert?.id ?? "Record"}`}
            </strong>
          </div>
          <div className="top-actions">
            <span className="last-sync">
              <RefreshCw size={14} /> Synced 42 sec ago
            </span>
            <button
              className="icon-button"
              onClick={() => setDarkMode(!darkMode)}
              aria-label="Toggle night mode"
            >
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              className="user-button"
              onClick={() =>
                showNotice(
                  `${role === "admin" ? "Admin" : "Citizen"} profile is active.`,
                )
              }
            >
              <UserRound size={16} />{" "}
              {role === "admin" ? "A. Sharma" : "Citizen observer"}{" "}
              <ChevronDown size={15} />
            </button>
            <button
              className="signout-button"
              onClick={() => {
                setIsAuthenticated(false);
                setView("dashboard");
                window.history.pushState({}, "", "/admin");
              }}
            >
              <ArrowUpRight size={14} /> Sign out
            </button>
          </div>
        </header>
        {view === "dashboard" ? (
          <DashboardEnhanced
            filters={filters}
            setFilters={setFilters}
            visibleReports={visibleReports}
            onAction={showNotice}
            onOpenAlert={openAlert}
            onSeedSamples={seedAdminSamples}
          />
        ) : view === "review" ? (
          <ReviewQueueEnhanced
            filters={filters}
            setFilters={setFilters}
            visibleReports={visibleReports}
            onAction={showNotice}
            onOpenAlert={openAlert}
            onSeedSamples={seedAdminSamples}
          />
        ) : view === "history" ? (
          <SubmissionHistoryPage />
        ) : view === "sources" ? (
          <DataSourceIntelligence />
        ) : view === "database" ? (
          <DatabaseRecordsDashboard />
        ) : selectedAlert ? (
          <AlertDetail report={selectedAlert} onBack={() => setView("dashboard")} onAction={showNotice} onVerify={verifyAlert} onSubmit={submitAlert} />
        ) : null}
        <footer>
          <span>
            <span className="footer-dot" /> All systems nominal
          </span>
          <span>
            VAANKAN intelligence layer <strong>•</strong> 23 Sep 2026, 14:32 IST
          </span>
        </footer>
      </main>
      {notice && (
        <div className="toast">
          <Check size={16} />
          {notice}
        </div>
      )}
    </div>
  );
}

function App() {
  const path = window.location.pathname;
  const [analystAuthenticated, setAnalystAuthenticated] = useState(false);
  const [analystDarkMode, setAnalystDarkMode] = useState(false);
  const [analystLoginNotice, setAnalystLoginNotice] = useState("");

  useEffect(() => {
    for (const storage of [window.localStorage, window.sessionStorage]) {
      for (const key of Object.keys(storage)) {
        if (key.startsWith("vaankan-")) storage.removeItem(key);
      }
    }
  }, []);

  useEffect(() => {
    if (!path.startsWith("/analyst")) return;
    if (!analystAuthenticated && path !== "/analyst/login") {
      window.history.replaceState({}, "", "/analyst/login");
    } else if (analystAuthenticated && (path === "/analyst" || path === "/analyst/")) {
      window.history.replaceState({}, "", "/analyst/dashboard");
    }
  }, [analystAuthenticated, path]);

  if (path.startsWith("/citizen")) return <CitizenPortal />;
  if (path.startsWith("/analyst")) {
    if (!analystAuthenticated || path === "/analyst/login") {
      return (
        <LoginPage
          portal="analyst"
          onLogin={() => {
            window.history.replaceState({}, "", "/analyst/dashboard");
            setAnalystAuthenticated(true);
          }}
          onAction={setAnalystLoginNotice}
          notice={analystLoginNotice}
          darkMode={analystDarkMode}
          setDarkMode={setAnalystDarkMode}
        />
      );
    }
    return <AnalystPortal darkMode={analystDarkMode} setDarkMode={setAnalystDarkMode} onSignOut={() => {
      window.history.replaceState({}, "", "/analyst/login");
      setAnalystAuthenticated(false);
    }} />;
  }
  return <AdminApp />;
}

function LoginPage({
  onLogin,
  onAction,
  notice,
  darkMode,
  setDarkMode,
  portal,
}: {
  onLogin: (role: "admin" | "analyst") => void;
  onAction: (message: string) => void;
  notice: string;
  darkMode: boolean;
  setDarkMode: (value: boolean) => void;
  portal: "admin" | "analyst";
}) {
  const [email, setEmail] = useState(portal === "analyst" ? "analyst@vaankan.gov.in" : "operator@vaankan.gov.in");
  const [password, setPassword] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password) {
      onAction("Enter your password to continue.");
      return;
    }
    onLogin(portal);
  };

  return (
    <div className={`login-page portal-theme-${portal} ${darkMode ? "night-mode" : ""}`}>
      <section className="login-story">
        <div className="login-brand">
          <span className="brand-mark">
            <CloudRain size={18} />
          </span>
          <span>VAANKAN</span>
        </div>
        <div className="login-story-copy">
          <p className="eyebrow">{portal === "analyst" ? "ANALYST ACCESS · NATIONAL WEATHER INTELLIGENCE" : "ADMINISTRATOR ACCESS · NATIONAL WEATHER INTELLIGENCE"}</p>
          <h1>From sky to ground truth.</h1>
          <p>
            {portal === "analyst" ? "Access the national weather intelligence workspace." : "Review reports, verification evidence, and administrative decisions."}
          </p>
          <div className="login-signals">
            <span>
              <span className="pulse" /> Demo workspace
            </span>
            <span>
              <ShieldCheck size={14} /> Evidence-first
            </span>
          </div>
        </div>
        <small className="login-version">
          VAANKAN INTELLIGENCE LAYER / v0.1 DEMO
        </small>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <div className="login-theme-toggle">
            <button
              className="icon-button"
              onClick={() => setDarkMode(!darkMode)}
              aria-label="Toggle night mode"
            >
              {darkMode ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
          <div className="mobile-login-brand">
            <span className="brand-mark">
              <CloudRain size={17} />
            </span>
            <span>VAANKAN</span>
          </div>
          <p className="eyebrow">{portal === "analyst" ? "ANALYST ACCESS" : "ADMIN ACCESS"}</p>
          <h2>Welcome back.</h2>
          <p className="login-intro">{portal === "analyst" ? "Sign in to open your analyst workspace." : "Sign in to open the Admin Panel."}</p>
          <form onSubmit={submit}>
            <label>
              Email address
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
              />
            </label>
            <div className="login-options">
              <label className="remember">
                <input type="checkbox" defaultChecked /> Remember this device
              </label>
              <button
                type="button"
                onClick={() =>
                  onAction(
                    "Password reset will be connected to the identity service.",
                  )
                }
              >
                Forgot password?
              </button>
            </div>
            <button className="login-submit" type="submit">
              <ShieldCheck size={16} /> Sign in as {portal}{" "}
              <ArrowUpRight size={15} />
            </button>
          </form>
          <p className="login-help">
            Demo access accepts any non-empty password.
            <br />
            <button
              type="button"
              onClick={() =>
                onAction(
                  "Contact administration is coming with the identity service.",
                )
              }
            >
              Need access? Contact administration <ArrowUpRight size={13} />
            </button>
          </p>
        </div>
      </section>
      {notice && (
        <div className="toast">
          <Check size={16} />
          {notice}
        </div>
      )}
    </div>
  );
}

type CitizenLocation = { latitude: number; longitude: number; label: string };
type CitizenProfile = {
  userId: string;
  name: string;
  phone: string;
  email: string;
  id: string;
  address: string;
  latitude: string;
  longitude: string;
  createdAt: string;
};

function citizenAccountToProfile(account: CitizenAccount): CitizenProfile {
  return {
    userId: account.user_id,
    name: account.name,
    phone: account.phone,
    email: account.email,
    id: account.government_id,
    address: account.address,
    latitude: account.latitude === null ? "" : String(account.latitude),
    longitude: account.longitude === null ? "" : String(account.longitude),
    createdAt: new Date().toISOString(),
  };
}

function apiReportToCitizenEntry(report: ApiReport): CitizenReportEntry {
  const [title, ...descriptionParts] = report.text.split(" - ");
  const status = report.verification_status === "VERIFIED" || report.verification_status === "VERIFIED_AND_SUBMITTED_TO_VAYU"
    ? "VERIFIED"
    : report.verification_status === "SUSPICIOUS"
      ? "SUSPICIOUS"
      : report.verification_status === "UNSUPPORTED"
        ? "UNSUPPORTED"
        : "IN REVIEW";
  return {
    reportId: report.record_id,
    status,
    eventType: report.event_type_claimed.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
    location: report.locality || [report.city, report.district, report.state].filter(Boolean).join(", "),
    timestamp: report.timestamp,
    vista: status === "IN REVIEW" ? "Preliminary assessment in progress" : "Preliminary assessment recorded",
    finalStatus: status === "VERIFIED" ? "Verified by administrator" : status === "IN REVIEW" ? "Awaiting admin verification" : status,
    title,
    description: report.description || descriptionParts.join(" - "),
    severity: report.citizen_reported_severity || "Not specified",
    notes: "",
    media: report.image_url || report.video_url || "",
    source: report.source_name,
    latitude: String(report.latitude),
    longitude: String(report.longitude),
    district: report.district,
    state: report.state,
    city: report.city,
    locality: report.locality ?? undefined,
    pincode: report.pincode ?? undefined,
    evidence: report.image_url || report.video_url || "No uploaded evidence",
    ongoingStatus: report.is_ongoing ? "Ongoing" : "Not ongoing",
    observedConditions: report.event_type_claimed,
    impactObservations: report.description || descriptionParts.join(" - "),
    adminDecision: status === "IN REVIEW" ? "Awaiting admin review" : status,
    vayuStatus: report.verification_status === "VERIFIED_AND_SUBMITTED_TO_VAYU" ? "Available to analysis" : "Database-driven",
  };
}

function distanceInKm(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
) {
  const earthRadius = 6371;
  const latitudeDelta = ((second.latitude - first.latitude) * Math.PI) / 180;
  const longitudeDelta = ((second.longitude - first.longitude) * Math.PI) / 180;
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos((first.latitude * Math.PI) / 180) *
      Math.cos((second.latitude * Math.PI) / 180) *
      Math.sin(longitudeDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function CitizenPortal() {
  const [authenticated, setAuthenticated] = useState(false);
  const [activeProfile, setActiveProfile] = useState<CitizenProfile | null>(
    null,
  );
  const [showRegistration, setShowRegistration] = useState(false);
  const [citizenView, setCitizenView] = useState<
    "home" | "alerts" | "search" | "report" | "profile" | "activities"
  >("home");
  const [filters, setFilters] = useState<Filters>({
    period: "Last 7 days",
    event: "All events",
    region: "All India",
    status: "All statuses",
  });
  const [location, setLocation] = useState<CitizenLocation | null>(null);
  const [locationStatus, setLocationStatus] = useState("Location not shared");
  const [notice, setNotice] = useState("");
  const [nightMode, setNightMode] = useState(false);
  const [acknowledgedAlertIds, setAcknowledgedAlertIds] = useState<string[]>([]);
  const [citizenAlertRecords, setCitizenAlertRecords] = useState<ApiCitizenAlert[]>([]);
  const [alertsLoadedFor, setAlertsLoadedFor] = useState("");
  const [citizenApiReports, setCitizenApiReports] = useState<Report[]>([]);
  const [myReports, setMyReports] = useState<CitizenReportEntry[]>([]);

  useEffect(() => {
    let active = true;
    const refreshReports = () => {
      void listReports({ limit: 500 }).then((result) => {
        if (active && result.ok) setCitizenApiReports(result.data.map(apiReportToAdminReport));
      });
    };
    refreshReports();
    window.addEventListener("vaankan-report-synced", refreshReports);
    return () => {
      active = false;
      window.removeEventListener("vaankan-report-synced", refreshReports);
    };
  }, []);

  useEffect(() => {
    const email = activeProfile?.email;
    if (!authenticated || !email) {
      setMyReports([]);
      return;
    }
    let active = true;
    void listCitizenReports(email).then((result) => {
      if (!active || !result.ok) return;
      const savedReports = result.data.map(apiReportToCitizenEntry);
      const sortedReports = savedReports.sort(
        (left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime(),
      );
      setMyReports(sortedReports);
    });
    return () => {
      active = false;
    };
  }, [authenticated, activeProfile?.email]);
  useEffect(() => {
    const email = activeProfile?.email;
    if (!authenticated || !email) return;
    let active = true;
    const refreshAlerts = () => {
      void listCitizenAlerts(email).then((result) => {
        if (active && result.ok) {
          setCitizenAlertRecords(result.data);
          setAlertsLoadedFor(email);
          setAcknowledgedAlertIds(result.data.filter((alert) => alert.acknowledged).map((alert) => alert.alert_id));
        }
      });
    };
    refreshAlerts();
    const interval = window.setInterval(refreshAlerts, 15000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [authenticated, activeProfile?.email]);
  const watchId = useRef<number | null>(null);
  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2800);
  };
  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus("GPS is not available in this browser");
      return;
    }
    setLocationStatus("Requesting GPS location...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          label: `${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`,
        };
        setLocation(nextLocation);
        if (activeProfile) {
          void updateCitizenProfile(activeProfile.email, {
            latitude: nextLocation.latitude,
            longitude: nextLocation.longitude,
          }).then((result) => {
            if (!result.ok) {
              setLocationStatus(`GPS captured but not saved to database (${result.error})`);
              return;
            }
            setActiveProfile(citizenAccountToProfile(result.data));
            setLocationStatus("GPS location saved to your database profile");
          });
        } else {
          setLocationStatus("GPS location updated");
        }
      },
      () => setLocationStatus("Location permission declined"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };
  useEffect(() => {
    const currentPath = window.location.pathname;
    if (currentPath === "/citizen/report") {
      setCitizenView("report");
    } else if (currentPath === "/citizen/activities") {
      setCitizenView("activities");
    } else if (currentPath === "/citizen") {
      setCitizenView("home");
    }
  }, []);
  useEffect(() => {
    if (!authenticated || !navigator.geolocation) return;
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const nextLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          label: `Current location · ${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`,
        };
        setLocation(nextLocation);
        setLocationStatus("GPS tracking active; saving location");
        if (activeProfile) {
          void updateCitizenProfile(activeProfile.email, {
            latitude: nextLocation.latitude,
            longitude: nextLocation.longitude,
          }).then((result) => {
            if (result.ok) setActiveProfile(citizenAccountToProfile(result.data));
          });
        }
      },
      () =>
        setLocationStatus("GPS permission is required for local intelligence"),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
    );
    return () => {
      if (watchId.current !== null)
        navigator.geolocation.clearWatch(watchId.current);
    };
  }, [authenticated, activeProfile?.email]);
  const completeLogin = (profile: CitizenProfile) => {
    setLocation(profile.latitude && profile.longitude ? {
      latitude: Number(profile.latitude),
      longitude: Number(profile.longitude),
      label: `${Number(profile.latitude).toFixed(4)}, ${Number(profile.longitude).toFixed(4)}`,
    } : null);
    setActiveProfile(profile);
    setAuthenticated(true);
  };
  const persistProfile = async (profile: CitizenProfile) => {
    const result = await updateCitizenProfile(profile.email, {
      name: profile.name,
      phone: profile.phone,
      address: profile.address,
      government_id: profile.id,
      latitude: profile.latitude ? Number(profile.latitude) : null,
      longitude: profile.longitude ? Number(profile.longitude) : null,
    });
    if (!result.ok) {
      showNotice(`Profile was not saved to the database (${result.error}).`);
      return;
    }
    setActiveProfile(citizenAccountToProfile(result.data));
    showNotice("Your profile was saved to the database.");
  };
  const logout = () => {
    setAuthenticated(false);
    setActiveProfile(null);
    setCitizenView("home");
  };
  const acknowledgeAlert = async (alertId: string) => {
    if (!activeProfile) return;
    const result = await acknowledgeCitizenAlert(activeProfile.email, alertId);
    if (!result.ok) {
      showNotice(`Acknowledgement was not saved: ${result.error}`);
      return;
    }
    setAcknowledgedAlertIds((current) => current.includes(alertId) ? current : [...current, alertId]);
    showNotice(result.data.already_acknowledged ? "This alert was already acknowledged." : "Alert acknowledgement saved to PostgreSQL.");
  };

  const visibleReports = useMemo(
    () => {
      return citizenApiReports.filter((report) => {
          const periodHours =
            filters.period === "Today"
              ? 24
              : filters.period === "Last 7 days"
                ? 168
                : 24;
          return (
            (filters.event === "All events" || report.category === filters.event) &&
            (filters.region === "All India" || report.region === filters.region) &&
            report.ageHours <= periodHours
          );
      });
    },
    [filters, citizenApiReports],
  );
  const nearbyAlerts = useMemo(
    () =>
      location
        ? (alertsLoadedFor === activeProfile?.email ? citizenAlertRecords : [])
            .map((alert) => {
              const distance = distanceInKm(location, { latitude: alert.latitude, longitude: alert.longitude });
              const category = alert.event_type.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
              const alertReport: Report & { distance: number } = {
                id: alert.alert_id,
                title: alert.title,
                location: alert.location,
                source: alert.source,
                time: new Date(alert.timestamp).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
                timestamp: alert.timestamp,
                status: "Verified",
                submitted: true,
                confidence: null,
                reports: 1,
                tone: "blue",
                category,
                region: alert.location.split(",").at(-1)?.trim() ?? "India",
                ageHours: alert.age_hours,
                latitude: alert.latitude,
                longitude: alert.longitude,
                intensity: null,
                distance,
              };
              return alertReport;
            })
            .filter((alert) => {
              const periodHours = filters.period === "Last 7 days" ? 168 : 24;
              const matchesEvent = filters.event === "All events" || alert.category.toLowerCase() === filters.event.toLowerCase();
              const matchesRegion = filters.region === "All India" || alert.region.toLowerCase() === filters.region.toLowerCase();
              const matchesStatus = filters.status === "All statuses" || filters.status === "Verified";
              return alert.distance <= 10 && alert.ageHours <= periodHours && matchesEvent && matchesRegion && matchesStatus;
            })
        : [],
    [activeProfile?.email, alertsLoadedFor, citizenAlertRecords, filters, location],
  );

  if (!authenticated)
    return (
      <CitizenLoginDatabase
        showRegistration={showRegistration}
        setShowRegistration={setShowRegistration}
        onLogin={completeLogin}
        onRegister={(profile) => {
          setActiveProfile(profile);
          setAuthenticated(true);
          setCitizenView("profile");
        }}
      />
    );

  return (
    <div className={`citizen-shell ${nightMode ? "citizen-night" : ""}`}>
      <header className="citizen-header">
        <button className="citizen-logo" onClick={() => setCitizenView("home")}>
          <span className="citizen-logo-mark">
            <CloudRain size={18} />
          </span>
          VAANKAN <small>CITIZEN</small>
        </button>
        <nav>
          <button
            className={citizenView === "home" ? "active" : ""}
            onClick={() => setCitizenView("home")}
          >
            <Home size={16} /> Home
          </button>
          <button
            className={citizenView === "search" ? "active" : ""}
            onClick={() => {
              setCitizenView("search");
              window.history.pushState({}, "", "/citizen");
            }}
          >
            <Search size={16} /> Search
          </button>
          <button
            className={citizenView === "report" ? "active" : ""}
            onClick={() => {
              setCitizenView("report");
              window.history.pushState({}, "", "/citizen/report");
            }}
          >
            <FileText size={16} /> Report
          </button>
          <button
            className={citizenView === "alerts" ? "active" : ""}
            onClick={() => {
              setCitizenView("alerts");
              window.history.pushState({}, "", "/citizen");
            }}
          >
            <Bell size={16} /> Alerts{" "}
            {nearbyAlerts.filter((alert) => !acknowledgedAlertIds.includes(alert.id)).length > 0 && <b>{nearbyAlerts.filter((alert) => !acknowledgedAlertIds.includes(alert.id)).length}</b>}
          </button>
          <button
            className={citizenView === "activities" ? "active" : ""}
            onClick={() => {
              setCitizenView("activities");
              window.history.pushState({}, "", "/citizen/activities");
            }}
          >
            <Clock3 size={16} /> Activities
          </button>
          <button
            className={citizenView === "profile" ? "active" : ""}
            onClick={() => setCitizenView("profile")}
          >
            <UserRound size={16} /> Profile
          </button>
        </nav>
        <div className="citizen-header-actions">
          <button
            className="citizen-icon-button"
            onClick={() => setNightMode(!nightMode)}
            aria-label="Toggle night mode"
          >
            {nightMode ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button className="citizen-signout" onClick={logout}>
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </header>
      <main className="citizen-main">
        {citizenView === "home" ? (
          <CitizenHome
            filters={filters}
            setFilters={setFilters}
            visibleReports={visibleReports}
            nearbyAlerts={nearbyAlerts.filter((alert) => !acknowledgedAlertIds.includes(alert.id))}
            location={location}
            locationStatus={locationStatus}
            requestLocation={requestLocation}
            onAction={showNotice}
          />
        ) : citizenView === "report" ? (
          <CitizenReportPage
            profile={activeProfile}
            reportHistory={myReports}
            onSubmit={async (entry) => {
              const eventTypeMap: Record<string, ApiReport["event_type_claimed"]> = {
                Rainfall: "rainfall",
                Thunderstorm: "thunderstorm",
                Flooding: "flooding",
                Heatwave: "heatwave",
                Fog: "fog",
                "Dust storm": "dust_storm",
                "Strong winds": "strong_winds",
              };

              const payload: ApiReport = {
                record_id: entry.reportId,
                source_type: "citizen",
                source_name: entry.source,
                timestamp: entry.timestamp,
                text: `${entry.title} - ${entry.description}`.trim(),
                language: "en",
                latitude: Number.parseFloat(entry.latitude || "0") || 0,
                longitude: Number.parseFloat(entry.longitude || "0") || 0,
                city: entry.city || "Chennai",
                district: entry.district || "Chennai",
                state: entry.state || "Tamil Nadu",
                event_type_claimed: eventTypeMap[entry.eventType] ?? "rainfall",
                image_url: entry.media && /^https?:\/\//i.test(entry.media) ? entry.media : null,
                video_url: null,
                verification_status: "PENDING",
                citizen_id: activeProfile?.email ?? undefined,
                description: entry.description,
                locality: entry.locality,
                pincode: entry.pincode,
                citizen_reported_severity: entry.severity,
                is_ongoing: entry.ongoingStatus === "Ongoing",
              };

              const backendResult = await createReport(payload);
              if (!backendResult.ok) {
                showNotice(`Report was not saved. PostgreSQL returned: ${backendResult.error}`);
                return;
              } else {
                showNotice(`Report ${entry.reportId} submitted successfully.`);
              }
              if (activeProfile) {
                setMyReports((currentReports) => {
                  return [entry, ...currentReports.filter((report) => report.reportId !== entry.reportId)];
                });
              }

              window.dispatchEvent(new Event("vaankan-report-synced"));
              setCitizenView("home");
              window.history.pushState({}, "", "/citizen");
            }}
            onAction={showNotice}
          />
        ) : citizenView === "alerts" ? (
          <CitizenAlerts
            nearbyAlerts={nearbyAlerts.filter((alert) => !acknowledgedAlertIds.includes(alert.id))}
            location={location}
            locationStatus={locationStatus}
            onAction={showNotice}
            profile={activeProfile}
            onAcknowledge={acknowledgeAlert}
          />
        ) : citizenView === "activities" ? (
          <CitizenActivities citizenId={activeProfile?.email ?? ""} />
        ) : citizenView === "search" ? (
          <CitizenSearch reports={visibleReports} />
        ) : (
          <CitizenProfileEditor
            key={`${activeProfile?.email}-${activeProfile?.latitude}-${activeProfile?.longitude}`}
            profile={activeProfile}
            onSave={persistProfile}
            requestLocation={requestLocation}
          />
        )}
      </main>
      <CitizenAssistantPanel
        profile={activeProfile}
        locationLabel={location ? location.label : "Location not shared"}
      />
      {notice && (
        <div className="citizen-toast">
          <Check size={16} />
          {notice}
        </div>
      )}
    </div>
  );
}

function CitizenAssistantPanel({
  profile,
  locationLabel,
}: {
  profile: CitizenProfile | null;
  locationLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: "assistant" | "user"; content: string }>>([
    {
      role: "assistant",
      content: "Hello! I can help explain nearby weather activity, active alerts, and the status of your reports.",
    },
  ]);
  const [conversationId, setConversationId] = useState(`citizen-${profile?.email ?? "observer"}`);

  const quickQuestions = [
    "What is happening near me?",
    "Are there any active weather events?",
    "How do I report heavy rainfall?",
    "What does IN REVIEW mean?",
    "What does VERIFIED mean?",
    "What is happening near Chennai?",
  ];

  const sendMessage = async (nextMessage?: string) => {
    const message = (nextMessage ?? draft).trim();
    if (!message || loading) return;

    setMessages((current) => [...current, { role: "user", content: message }]);
    setDraft("");
    setLoading(true);

    try {
      const response = await sendCitizenAssistantMessage(message, conversationId, locationLabel);
      setMessages((current) => [...current, { role: "assistant", content: response.message }]);
      setConversationId(response.conversation_id);
    } catch {
      setMessages((current) => [
        ...current,
        { role: "assistant", content: "VAANKAN Assistant is temporarily unavailable. Please try again shortly." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="assistant-floating-shell">
      {open ? (
        <div className="assistant-panel citizen-assistant-panel">
          <div className="assistant-header">
            <div>
              <p className="assistant-kicker">VAANKAN</p>
              <h3>VAANKAN Assistant</h3>
            </div>
            <button type="button" className="assistant-close" onClick={() => setOpen(false)} aria-label="Close assistant">
              ×
            </button>
          </div>
          <div className="assistant-context">{profile ? `${profile.name} · ${locationLabel}` : `Citizen view · ${locationLabel}`}</div>
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
            {loading && <div className="assistant-message assistant loading">VAANKAN is checking the available weather intelligence...</div>}
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
              placeholder="Ask VAANKAN..."
              aria-label="Ask the VAANKAN assistant"
            />
            <button type="button" onClick={() => void sendMessage()} disabled={loading || !draft.trim()}>
              Send
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="assistant-launcher" onClick={() => setOpen(true)} aria-label="Open VAANKAN Assistant">
          <MessageSquare size={18} />
          <span>VAANKAN Assistant</span>
        </button>
      )}
    </div>
  );
}

type CitizenReportEntry = {
  reportId: string;
  status: string;
  eventType: string;
  location: string;
  timestamp: string;
  vista: string;
  finalStatus: string;
  title: string;
  description: string;
  severity: string;
  notes: string;
  media: string;
  source: string;
  latitude?: string;
  longitude?: string;
  district?: string;
  state?: string;
  city?: string;
  locality?: string;
  pincode?: string;
  evidence?: string;
  ongoingStatus?: string;
  observedConditions?: string;
  impactObservations?: string;
  adminDecision?: string;
  vayuStatus?: string;
};

function CitizenReportPage({
  profile,
  reportHistory,
  onSubmit,
  onAction,
}: {
  profile: CitizenProfile | null;
  reportHistory: CitizenReportEntry[];
  onSubmit: (entry: CitizenReportEntry) => void;
  onAction: (message: string) => void;
}) {
  const [form, setForm] = useState({
    title: "",
    eventType: "Rainfall",
    location: profile?.address ?? "",
    latitude: profile?.latitude ?? "",
    longitude: profile?.longitude ?? "",
    timestamp: new Date().toISOString().slice(0, 16),
    severity: "Moderate",
    description: "",
    notes: "",
    media: "",
  });
  const [error, setError] = useState("");
  const [selectedReport, setSelectedReport] = useState<CitizenReportEntry | null>(null);
  const sortedHistory = useMemo(
    () => [...reportHistory].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [reportHistory],
  );

  const update = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = form.title.trim();
    const description = form.description.trim();
    const location = form.location.trim();

    if (!title || !description || !location) {
      setError("Add the event title, description, and incident location before submitting.");
      return;
    }

    const reportId = `CIT-${new Date().toISOString().slice(2, 10).replace(/[-:T.]/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const entry: CitizenReportEntry = {
      reportId,
      status: "IN REVIEW",
      eventType: form.eventType,
      location,
      timestamp: new Date(form.timestamp).toISOString(),
      vista: "Preliminary assessment in progress",
      finalStatus: "Awaiting admin verification",
      title,
      description,
      severity: form.severity,
      notes: form.notes.trim(),
      media: form.media.trim(),
      source: profile?.email ? `Citizen • ${profile.email}` : "Citizen portal",
      latitude: form.latitude || "",
      longitude: form.longitude || "",
      district: "Tamil Nadu",
      state: "Tamil Nadu",
      city: location.split(",").slice(-1)[0]?.trim() || "Chennai",
      locality: location,
      pincode: "",
      evidence: form.media.trim() || "No uploaded evidence",
      ongoingStatus: "Ongoing",
      observedConditions: form.eventType,
      impactObservations: description,
      adminDecision: "Awaiting admin review",
      vayuStatus: "Not yet submitted",
    };

    setError("");
    onSubmit(entry);
    onAction("Your weather report was accepted into the VISTA intake flow.");
  };

  return (
    <div className="citizen-page">
      <div className="citizen-welcome">
        <div>
          <p className="eyebrow citizen-eyebrow">REPORT WEATHER EVENT</p>
          <h1>Submit a weather observation.</h1>
          <p>Capture the event, location, and supporting evidence for VISTA review and admin verification.</p>
        </div>
      </div>

      <div className="report-page-grid">
        <section className="profile-editor report-form-panel">
          <div className="profile-editor-heading">
            <div className="citizen-location-icon">
              <FileText size={20} />
            </div>
            <div>
              <span className="citizen-card-label">GROUND OBSERVATION</span>
              <h2>Citizen weather report</h2>
            </div>
          </div>

          <form onSubmit={submit}>
            <div className="profile-form-grid">
              <label>
                Incident title
                <input
                  value={form.title}
                  onChange={(event) => update("title", event.target.value)}
                  placeholder="Heavy rain and street flooding"
                />
              </label>

              <label>
                Event type
                <select
                  value={form.eventType}
                  onChange={(event) => update("eventType", event.target.value)}
                  style={{ border: "1px solid #cfdccf", background: "#fffdf8", outline: "none", color: "#27352f", padding: "11px 12px", fontSize: 12 }}
                >
                  <option>Rainfall</option>
                  <option>Thunderstorm</option>
                  <option>Flooding</option>
                  <option>Heatwave</option>
                  <option>Fog</option>
                  <option>Dust storm</option>
                  <option>Strong winds</option>
                </select>
              </label>

              <label className="profile-address">
                Incident location
                <input
                  value={form.location}
                  onChange={(event) => update("location", event.target.value)}
                  placeholder="Medavakkam, Chennai"
                />
              </label>

              <label>
                Latitude
                <input
                  value={form.latitude}
                  onChange={(event) => update("latitude", event.target.value)}
                  placeholder="12.9552"
                />
              </label>

              <label>
                Longitude
                <input
                  value={form.longitude}
                  onChange={(event) => update("longitude", event.target.value)}
                  placeholder="80.1451"
                />
              </label>

              <label>
                Observation time
                <input
                  type="datetime-local"
                  value={form.timestamp}
                  onChange={(event) => update("timestamp", event.target.value)}
                />
              </label>

              <label>
                Severity
                <select
                  value={form.severity}
                  onChange={(event) => update("severity", event.target.value)}
                  style={{ border: "1px solid #cfdccf", background: "#fffdf8", outline: "none", color: "#27352f", padding: "11px 12px", fontSize: 12 }}
                >
                  <option>Low</option>
                  <option>Moderate</option>
                  <option>High</option>
                  <option>Extreme</option>
                </select>
              </label>

              <label className="profile-address">
                What did you observe?
                <textarea
                  value={form.description}
                  onChange={(event) => update("description", event.target.value)}
                  placeholder="Describe the rainfall, flooding, wind, damage, visibility, or other conditions you observed."
                  rows={5}
                  style={{ border: "1px solid #cfdccf", background: "#fffdf8", outline: "none", color: "#27352f", padding: "11px 12px", fontSize: 12, resize: "vertical" }}
                />
              </label>

              <label className="profile-address">
                Supporting media or reference link
                <input
                  value={form.media}
                  onChange={(event) => update("media", event.target.value)}
                  placeholder="https://example.com/image.jpg or upload note"
                />
              </label>

              <label className="profile-address">
                Additional notes
                <textarea
                  value={form.notes}
                  onChange={(event) => update("notes", event.target.value)}
                  placeholder="Road conditions, power outage, nearby waterlogging, or any witness detail."
                  rows={3}
                  style={{ border: "1px solid #cfdccf", background: "#fffdf8", outline: "none", color: "#27352f", padding: "11px 12px", fontSize: 12, resize: "vertical" }}
                />
              </label>
            </div>

            {error && (
              <div className="citizen-inline-notice" style={{ marginTop: 16 }}>{error}</div>
            )}

            <div className="profile-editor-actions" style={{ marginTop: 18 }}>
              <span>Submitted reports are routed to VISTA for preliminary assessment.</span>
              <button type="submit" className="citizen-submit">
                Submit report <ArrowUpRight size={15} />
              </button>
            </div>
          </form>
        </section>

        <aside className="profile-editor report-history-panel">
          <div className="profile-editor-heading">
            <div className="citizen-location-icon">
              <History size={20} />
            </div>
            <div>
              <span className="citizen-card-label">REPORTS</span>
              <h2>HISTORY</h2>
            </div>
          </div>

          <div className="report-history-list">
            {sortedHistory.length ? (
              sortedHistory.map((report) => (
                <button
                  key={report.reportId}
                  type="button"
                  className={`report-history-item ${selectedReport?.reportId === report.reportId ? "selected" : ""}`}
                  onClick={() => setSelectedReport(report)}
                >
                  <div className="report-history-item-main">
                    <strong>{report.title || report.eventType}</strong>
                    <span>
                      {new Date(report.timestamp).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </span>
                  </div>
                  <span className={`report-history-status ${report.status.toLowerCase().replace(/\s+/g, "-")}`}>
                    {report.status}
                  </span>
                </button>
              ))
            ) : (
              <div className="no-alerts report-empty-state">
                <span><History size={22} /></span>
                <h2>No reports submitted yet.</h2>
                <p>Your submitted weather reports will appear here.</p>
              </div>
            )}
          </div>

          {selectedReport && (
            <div className="report-history-detail-overlay">
              <div className="report-history-detail-pane">
                <div className="report-detail-header">
                  <h3>REPORT DETAILS</h3>
                  <button type="button" onClick={() => setSelectedReport(null)} aria-label="Close report details">×</button>
                </div>

                <div className="report-detail-summary">
                  <div className="report-detail-id">{selectedReport.reportId}</div>
                  <h4>{selectedReport.title || selectedReport.eventType}</h4>
                  <div className="report-detail-location">{selectedReport.location}</div>
                </div>

                <div className="report-detail-meta">
                  <div className="meta-row">
                    <small>Status</small>
                    <strong>{selectedReport.status}</strong>
                  </div>
                  <div className="meta-row">
                    <small>Submitted</small>
                    <span>{new Date(selectedReport.timestamp).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
                  </div>
                  <div className="meta-row">
                    <small>Description</small>
                    <span>{selectedReport.description || "No description provided."}</span>
                  </div>
                  <div className="meta-row">
                    <small>Severity</small>
                    <span>{selectedReport.severity}</span>
                  </div>
                  <div className="meta-row">
                    <small>Evidence</small>
                    <span>{selectedReport.evidence || selectedReport.media || "No uploaded evidence"}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function CitizenLoginDatabase({
  showRegistration,
  setShowRegistration,
  onLogin,
  onRegister,
  notice = "",
}: {
  showRegistration: boolean;
  setShowRegistration: (value: boolean) => void;
  onLogin: (profile: CitizenProfile) => void;
  onRegister: (profile: CitizenProfile) => void;
  notice?: string;
}) {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    id: "",
    address: "",
    latitude: "",
    longitude: "",
  });
  const update = (key: keyof typeof form, value: string) =>
    setForm({ ...form, [key]: value });
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    const email = form.email.trim();
    const errors: string[] = [];
    if (!email) errors.push("Email address is required");
    else if (email.length < 5 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Email address must be valid");
    if (!password) errors.push("Password is required");
    else if (password.length < 8) errors.push("Password must be at least 8 characters");
    if (showRegistration) {
      if (form.name.trim().length < 2) errors.push("Full name must be at least 2 characters");
      if (form.phone.trim().length < 7) errors.push("Phone number must be at least 7 characters");
      if (form.id.trim().length < 4) errors.push("Government ID must be at least 4 characters");
      else if (form.id.trim().length > 80) errors.push("Government ID must be no more than 80 characters");
      if (form.address.trim().length < 3) errors.push("Address must be at least 3 characters");
    }
    if (errors.length) {
      setMessage(errors.join(". ") + ".");
      return;
    }
    setSubmitting(true);
    try {
    if (showRegistration) {
      const result = await registerCitizen({
        name: form.name.trim(),
        email,
        password,
        address: form.address.trim(),
        phone: form.phone.trim(),
        government_id: form.id.trim(),
      });
      if (!result.ok) {
        setMessage(`Registration could not be saved: ${result.error}`);
        return;
      }
      onRegister(citizenAccountToProfile(result.data));
      return;
    }
    const result = await loginCitizen(email, password);
    if (!result.ok) {
      setMessage(`Sign-in failed: ${result.error}`);
      return;
    }
    onLogin(citizenAccountToProfile(result.data));
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div className="citizen-login">
      <div className="citizen-login-art">
        <div className="citizen-logo">
          <span className="citizen-logo-mark">
            <CloudRain size={18} />
          </span>
          VAANKAN <small>CITIZEN</small>
        </div>
        <div>
          <p className="eyebrow citizen-eyebrow">GROUND OBSERVATION NETWORK</p>
          <h1>Weather intelligence, from where you stand.</h1>
          <p>
            Receive verified local alerts and help your community see what is
            happening on the ground.
          </p>
        </div>
        <div className="citizen-login-foot">
          <span>
            <span className="pulse" /> Local alerts within 10 km
          </span>
          <span>
            <Navigation size={14} /> GPS activates after sign-in
          </span>
        </div>
      </div>
      <div className="citizen-login-panel">
        <div className="citizen-login-card">
          <div className="citizen-login-top">
            <span className="eyebrow citizen-eyebrow">CITIZEN PORTAL</span>
            <button
              className="citizen-icon-button"
              onClick={() => setShowRegistration(!showRegistration)}
              aria-label="Switch login mode"
            >
              <UserPlus size={17} />
            </button>
          </div>
          <h2>
            {showRegistration
              ? "Create your observer profile."
              : "Welcome back."}
          </h2>
          <p className="citizen-intro">
            {showRegistration
              ? "Add an address for registration. GPS starts after your first sign-in."
              : "Sign in to activate continuous GPS tracking and local intelligence."}
          </p>
          <form onSubmit={submit}>
            {showRegistration && (
              <>
                <label>
                  Full name
                  <input
                    value={form.name}
                    onChange={(event) => update("name", event.target.value)}
                    placeholder="Your name"
                  />
                </label>
                <div className="citizen-form-row">
                  <label>
                    Phone number
                    <input
                      value={form.phone}
                      onChange={(event) => update("phone", event.target.value)}
                      placeholder="+91"
                    />
                  </label>
                  <label>
                    Government ID
                    <input
                      value={form.id}
                      onChange={(event) => update("id", event.target.value)}
                      placeholder="ID number"
                    />
                  </label>
                </div>
                <label>
                  Address
                  <input
                    value={form.address}
                    onChange={(event) => update("address", event.target.value)}
                    placeholder="Type your address"
                  />
                </label>
              </>
            )}
            <label>
              Email address
              <input
                type="email"
                value={form.email}
                onChange={(event) => update("email", event.target.value)}
                placeholder="you@example.com"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                minLength={8}
                autoComplete={showRegistration ? "new-password" : "current-password"}
              />
            </label>
            <button className="citizen-submit" type="submit" disabled={submitting}>
              {submitting ? "Connecting..." : showRegistration ? "Create account" : "Sign in"}{" "}
              <ArrowUpRight size={15} />
            </button>
          </form>
          <button
            className="citizen-switch"
            onClick={() => setShowRegistration(!showRegistration)}
          >
            {showRegistration
              ? "Already registered? Sign in"
              : "New here? Create a citizen profile"}
          </button>
          <small className="citizen-demo-note">
            Citizen accounts and reports are stored in PostgreSQL. GPS is saved after permission is granted.
          </small>
          {(notice || message) && (
            <div className="citizen-inline-notice">{notice || message}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function CitizenProfileEditor({
  profile,
  onSave,
  requestLocation,
}: {
  profile: CitizenProfile | null;
  onSave: (profile: CitizenProfile) => void;
  requestLocation: () => void;
}) {
  const [form, setForm] = useState<CitizenProfile | null>(profile);
  if (!form)
    return (
      <div className="no-alerts">
        <h2>Profile unavailable.</h2>
        <p>Sign out and register or sign in again.</p>
      </div>
    );
  const update = (key: keyof CitizenProfile, value: string) =>
    setForm({ ...form, [key]: value });
  return (
    <div className="citizen-page">
      <div className="citizen-welcome">
        <div>
          <p className="eyebrow citizen-eyebrow">PERSONAL DETAILS</p>
          <h1>Your observer profile.</h1>
          <p>
            Keep your contact and location details current for relevant local
            alerts.
          </p>
        </div>
      </div>
      <section className="profile-editor">
        <div className="profile-editor-heading">
          <div className="citizen-location-icon">
            <UserRound size={20} />
          </div>
          <div>
            <span className="citizen-card-label">DATABASE PROFILE</span>
            <h2>Edit your details</h2>
          </div>
        </div>
        <div className="profile-form-grid">
          <label>
            Full name
            <input
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
            />
          </label>
          <label>
            Phone number
            <input
              value={form.phone}
              onChange={(event) => update("phone", event.target.value)}
            />
          </label>
          <label>
            Email address
            <input
              type="email"
              value={form.email}
              onChange={(event) => update("email", event.target.value)}
            />
          </label>
          <label>
            Government ID
            <input
              value={form.id}
              onChange={(event) => update("id", event.target.value)}
            />
          </label>
          <label className="profile-address">
            Address
            <input
              value={form.address}
              onChange={(event) => update("address", event.target.value)}
              placeholder="Type your address"
            />
          </label>
          <div className="profile-location-block">
            <div className="profile-location-title">
              <span>
                <LocateFixed size={15} /> GPS coordinates
              </span>
              <button type="button" onClick={requestLocation}>
                Refresh GPS
              </button>
            </div>
            <div className="citizen-form-row">
              <label>
                Latitude
                <input
                  value={form.latitude}
                  onChange={(event) => update("latitude", event.target.value)}
                />
              </label>
              <label>
                Longitude
                <input
                  value={form.longitude}
                  onChange={(event) => update("longitude", event.target.value)}
                />
              </label>
            </div>
            <small>
              Coordinates are editable if GPS is unavailable or inaccurate.
            </small>
          </div>
        </div>
        <div className="profile-editor-actions">
          <span>Profile changes are saved to PostgreSQL</span>
          <button className="citizen-submit" onClick={() => onSave(form)}>
            Save profile <Check size={15} />
          </button>
        </div>
      </section>
    </div>
  );
}

function CitizenHome({
  filters,
  setFilters,
  visibleReports,
  nearbyAlerts,
  location,
  locationStatus,
  requestLocation,
  onAction,
}: {
  filters: Filters;
  setFilters: (value: Filters) => void;
  visibleReports: Report[];
  nearbyAlerts: Array<Report & { distance: number }>;
  location: CitizenLocation | null;
  locationStatus: string;
  requestLocation: () => void;
  onAction: (message: string) => void;
}) {
  const localReports = useMemo(
    () =>
      location
        ? visibleReports.filter((report) => distanceInKm(location, report) <= 50)
        : [],
    [location, visibleReports],
  );
  return (
    <div className="citizen-page">
      <div className="citizen-welcome">
        <div>
          <p className="eyebrow citizen-eyebrow">YOUR WEATHER VIEW</p>
          <h1>Stay aware, stay ready.</h1>
          <p>
            Local conditions and verified reports, shaped around your location.
          </p>
        </div>
        <div
          className={`local-alert-badge ${nearbyAlerts.length ? "has-alert" : ""}`}
        >
          <span className="alert-badge-icon">
            <Bell size={16} />
          </span>
          <span>
            <strong>
              {nearbyAlerts.length
                ? `${nearbyAlerts.length} nearby alert${nearbyAlerts.length > 1 ? "s" : ""}`
                : "No nearby alerts"}
            </strong>
            <small>
              {nearbyAlerts.length
                ? "Within 10 km of you"
                : "We will notify you if one appears"}
            </small>
          </span>
        </div>
      </div>
      <section className="citizen-location-card">
        <div className="citizen-location-icon">
          <LocateFixed size={20} />
        </div>
        <div>
          <span className="citizen-card-label">YOUR LOCATION</span>
          <strong>{location ? location.label : "Location not set"}</strong>
          <small>
            {location
              ? "GPS captured and editable from your profile"
              : locationStatus}
          </small>
        </div>
        <button onClick={requestLocation}>
          {location ? "Refresh GPS" : "Use my location"}{" "}
          <Navigation size={14} />
        </button>
      </section>
      <FilterControls filters={filters} setFilters={setFilters} />
      <section className="citizen-dashboard-grid">
        <div className="citizen-map-card">
          <div className="citizen-card-heading">
            <div>
              <span className="citizen-card-label">LOCAL EVENT MAP</span>
              <h2>What is happening near you</h2>
            </div>
            <span className="citizen-map-count">
              {localReports.length} signals
            </span>
          </div>
          <IndiaMap reports={localReports} userLocation={location} />
        </div>
        <div className="area-analysis">
          <span className="citizen-card-label">AREA ANALYSIS</span>
          <h2>{location ? "Your local picture" : "Set your location"}</h2>
          <div className="analysis-score">
            <strong>
                {(() => {
                  const values = localReports.flatMap((report) => report.intensity === null ? [] : [report.intensity]);
                  return values.length
                    ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
                    : "N/A";
                })()}
            </strong>
            <span>
              / 100
              <br />
              signal intensity
            </span>
          </div>
          <p>
            {nearbyAlerts.length
              ? "Verified weather activity is close to your location. Keep alerts enabled."
              : "No verified disaster alert is currently within your 10 km notification radius."}
          </p>
          <div className="analysis-line">
            <span>Reports in selected window</span>
            <strong>
              {localReports.reduce((sum, report) => sum + report.reports, 0)}
            </strong>
          </div>
          <div className="analysis-line">
            <span>Average confidence</span>
            <strong>
              {(() => {
                const values = localReports.flatMap((report) => report.confidence === null ? [] : [report.confidence]);
                return values.length
                  ? `${Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)}%`
                  : "Not assessed";
              })()}
            </strong>
          </div>
        </div>
      </section>
      <section className="citizen-event-strip">
        <div>
          <span className="citizen-card-label">FILTERED INTELLIGENCE</span>
          <h2>Recent verified signals</h2>
        </div>
        <div className="citizen-mini-events">
          {localReports.slice(0, 3).map((report) => (
            <div key={report.id}>
              <span
                className={`citizen-event-dot ${report.status.toLowerCase()}`}
              />
              <span>
                <strong>{report.title}</strong>
                <small>
                  {report.location} · {report.time}
                </small>
              </span>
            </div>
          ))}
        </div>
        <button
          onClick={() => onAction("Filtered citizen intelligence is current.")}
        >
          View all <ArrowUpRight size={14} />
        </button>
      </section>
    </div>
  );
}

function CitizenActivities({ citizenId }: { citizenId: string }) {
  const [activityFeed, setActivityFeed] = useState<CitizenActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!citizenId) {
      setActivityFeed([]);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    void listCitizenActivities(citizenId).then((result) => {
      if (!active) return;
      if (result.ok) {
        setActivityFeed(result.data);
        setError("");
      } else {
        setError(`Activities could not be loaded from PostgreSQL (${result.error}).`);
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, [citizenId]);
  return (
    <div className="citizen-page citizen-activities-page">
      <div className="citizen-welcome">
        <div>
          <p className="eyebrow citizen-eyebrow">CITIZEN PORTAL / ACTIVITIES</p>
          <h1>Your activity</h1>
          <p>Report and alert events recorded for your account.</p>
        </div>
        <span className="citizen-activity-count">{activityFeed.length} records</span>
      </div>
      <section className="citizen-activity-panel citizen-activities-full">
        <div className="citizen-card-heading">
          <div>
            <span className="citizen-card-label">ACTIVITY LOG</span>
            <h2>Recent activity</h2>
          </div>
        </div>
        {error ? <div className="citizen-activity-empty">{error}</div> : loading ? <div className="citizen-activity-empty">Loading activities from PostgreSQL...</div> : <CitizenActivityFeed activityFeed={activityFeed} />}
      </section>
    </div>
  );
}

function CitizenActivityFeed({
  activityFeed,
}: {
  activityFeed: CitizenActivity[];
}) {
  if (!activityFeed.length) {
    return <div className="citizen-activity-empty">No activity has been recorded for this account yet.</div>;
  }
  return (
    <div className="citizen-activity-list">
      {activityFeed.map((item) => (
        <div className="citizen-activity-item" key={item.id}>
          <span className={`citizen-activity-status ${item.status.toLowerCase().replace(/\s+/g, "-")}`}>
            {item.status}
          </span>
          <div>
            <strong>{item.title}</strong>
            <small>{item.description}</small>
          </div>
          <time>{new Date(item.timestamp).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</time>
        </div>
      ))}
    </div>
  );
}

function CitizenSearch({ reports: searchableReports }: { reports: Report[] }) {
  const [query, setQuery] = useState("");
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const results = searchableReports.filter((report) =>
    `${report.location} ${report.title} ${report.region}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className="citizen-page">
      <div className="citizen-welcome">
        <div>
          <p className="eyebrow citizen-eyebrow">LOCATION SEARCH</p>
          <h1>Explore another location.</h1>
          <p>Search independently without changing your live GPS view.</p>
        </div>
      </div>
      <section className="location-search-panel">
        <div className="search-field">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search city, region or event"
            autoFocus
          />
        </div>
        <div className="location-search-results">
          {results.map((report) => (
            <button
              key={report.id}
              className={selectedReport?.id === report.id ? "selected" : ""}
              onClick={() => setSelectedReport(report)}
            >
              <MapPinned size={16} />
              <span>
                <strong>{report.location}</strong>
                <small>{report.title} · {report.time}</small>
              </span>
              <ArrowUpRight size={14} />
            </button>
          ))}
        </div>
      </section>
      {selectedReport && (
        <section className="citizen-map-card search-location-result">
          <div className="citizen-card-heading">
            <div>
              <span className="citizen-card-label">SEARCHED LOCATION</span>
              <h2>{selectedReport.location}</h2>
            </div>
            <span className="citizen-map-count">{selectedReport.confidence === null ? "Confidence not assessed" : `${selectedReport.confidence}% confidence`}</span>
          </div>
          <IndiaMap reports={[selectedReport]} userLocation={selectedReport} />
        </section>
      )}
    </div>
  );
}

function CitizenAlerts({
  nearbyAlerts,
  location,
  locationStatus,
  onAction,
  profile,
  onAcknowledge,
}: {
  nearbyAlerts: Array<Report & { distance: number }>;
  location: CitizenLocation | null;
  locationStatus: string;
  onAction: (message: string) => void;
  profile: CitizenProfile | null;
  onAcknowledge: (alertId: string) => void | Promise<void>;
}) {
  return (
    <div className="citizen-page">
      <div className="citizen-welcome">
        <div>
          <p className="eyebrow citizen-eyebrow">ALERT CENTRE</p>
          <h1>Local alerts.</h1>
          <p>
            Only high-signal weather events within 10 km of your shared location
            appear here.
          </p>
        </div>
      </div>
      {!location && (
        <section className="citizen-location-card">
          <div className="citizen-location-icon">
            <LocateFixed size={20} />
          </div>
          <div>
            <strong>Share your location to activate local alerts</strong>
            <small>{locationStatus}</small>
          </div>
          <button
            onClick={() =>
              onAction("Return to Home and use GPS to activate alerts.")
            }
          >
            Go to location <ArrowUpRight size={14} />
          </button>
        </section>
      )}
      <section className="alerts-list">
        {nearbyAlerts.length ? (
          nearbyAlerts.map((alert) => (
            <article className="citizen-alert-card" key={alert.id}>
              <div className="alert-card-top">
                <span className="alert-severity">VERIFIED EVENT</span>
                <span>{alert.distance.toFixed(1)} km away</span>
              </div>
              <h2>{alert.title}</h2>
              <p>
                {alert.location} · {alert.time}
              </p>
              <div className="profile-editor-actions" style={{ marginTop: 14, paddingTop: 14 }}>
                <span>Requires your acknowledgement</span>
                <button type="button" className="citizen-submit" onClick={() => onAcknowledge(alert.id)}>
                  Acknowledge <Check size={15} />
                </button>
              </div>
            </article>
          ))
        ) : (
          <div className="no-alerts">
            <span>
              <Bell size={22} />
            </span>
            <h2>No disaster alerts nearby.</h2>
            <p>
              We will show an alert here only when a verified event is detected
              within 10 km of your location.
            </p>
            <button
              onClick={() =>
                onAction(
                  "Location-based notifications are enabled for this session.",
                )
              }
            >
              Notifications enabled
            </button>
          </div>
        )}
      </section>
      <AlertDeliveryModule profile={profile} />
    </div>
  );
}

function AlertDeliveryModule({
  profile,
}: {
  profile: CitizenProfile | null;
}) {
  return (
    <section className="alert-delivery-module">
      <div>
        <span className="citizen-card-label">ALERT DELIVERY</span>
        <h2>Three ways to reach you</h2>
        <p>Portal alerts stay active while GPS tracking is enabled.</p>
      </div>
      <div className="delivery-channels">
        <div><Bell size={17} /><span><strong>Portal</strong><small>Active while signed in</small></span><Check size={15} /></div>
        <div><MessageSquare size={17} /><span><strong>SMS</strong><small>{profile?.phone || "Add phone in profile"}</small></span><small>Requires SMS provider</small></div>
        <div>
          <Mail size={17} />
          <span>
            <strong>Email</strong>
            <small>{profile?.email || "Add email in profile"}</small>
          </span>
          <span className="delivery-action">After admin verification</span>
        </div>
      </div>
    </section>
  );
}

function FilterControls({
  filters,
  setFilters,
}: {
  filters: Filters;
  setFilters: (value: Filters) => void;
}) {
  const update = (key: keyof Filters, value: string) =>
    setFilters({ ...filters, [key]: value });
  return (
    <section className="filterbar">
      <div className="filter-title">
        <SlidersHorizontal size={16} /> View filters
      </div>
      <label>
        <span>Window</span>
        <select
          value={filters.period}
          onChange={(event) => update("period", event.target.value)}
        >
          <option>Last 24 hours</option>
          <option>Today</option>
          <option>Last 7 days</option>
        </select>
      </label>
      <label>
        <span>Event type</span>
        <select
          value={filters.event}
          onChange={(event) => update("event", event.target.value)}
        >
          <option>All events</option>
          <option>Flooding</option>
          <option>Rainfall</option>
          <option>Thunderstorm</option>
          <option>Heatwave</option>
          <option>Fog</option>
          <option>Dust storm</option>
          <option>Strong winds</option>
        </select>
      </label>
      <label>
        <span>Region</span>
        <select
          value={filters.region}
          onChange={(event) => update("region", event.target.value)}
        >
          <option>All India</option>
          <option>Tamil Nadu</option>
          <option>Rajasthan</option>
          <option>Puducherry</option>
          <option>West Bengal</option>
          <option>Kerala</option>
          <option>Maharashtra</option>
          <option>Punjab</option>
          <option>Assam</option>
          <option>Andhra Pradesh</option>
          <option>Madhya Pradesh</option>
        </select>
      </label>
      <label>
        <span>Status</span>
        <select
          value={filters.status}
          onChange={(event) => update("status", event.target.value)}
        >
          <option>All statuses</option>
          <option>Verified</option>
          <option>Review</option>
          <option>Suspicious</option>
        </select>
      </label>
      <button
        className="filter-reset"
        onClick={() =>
          setFilters({
            period: "Last 7 days",
            event: "All events",
            region: "All India",
            status: "All statuses",
          })
        }
      >
        <RefreshCw size={14} /> Reset
      </button>
    </section>
  );
}

function IndiaMap({
  reports: mapReports,
  userLocation,
}: {
  reports: Report[];
  userLocation?: { latitude: number; longitude: number } | null;
}) {
  const mapElement = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mapElement.current) return;
    const map = L.map(mapElement.current, {
      zoomControl: false,
      attributionControl: true,
    }).setView([22.5, 80.2], 4.5);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
    mapReports.forEach((report) => {
      const intensity = report.intensity;
      const color =
        report.status === "Suspicious"
          ? "#e26b5d"
          : report.status === "Review" || report.status === "Unsupported"
            ? "#c78c27"
            : "#2caeb7";
      if (intensity !== null) {
        L.circle([report.latitude, report.longitude], {
          radius: 18000 + intensity * 430,
          color,
          fillColor: color,
          fillOpacity: 0.13,
          weight: 1,
        }).addTo(map);
      }
      L.circleMarker([report.latitude, report.longitude], {
        radius: intensity === null ? 7 : 5 + intensity / 18,
        color,
        fillColor: color,
        fillOpacity: 0.9,
        weight: 2,
      })
        .bindPopup(
          `<strong>${report.title}</strong><br>${report.location}<br>${intensity === null ? "Intensity not assessed" : `Intensity: ${intensity}%`}`,
        )
        .addTo(map);
    });
    if (userLocation) {
      L.marker([userLocation.latitude, userLocation.longitude], {
        icon: L.divIcon({
          className: "gps-map-pin",
          html: '<span class="gps-map-pin-head"></span>',
          iconSize: [28, 36],
          iconAnchor: [14, 34],
        }),
      })
        .bindPopup("<strong>Your location</strong>")
        .addTo(map);
    }
    return () => {
      map.remove();
    };
  }, [mapReports, userLocation]);
  return (
    <div className="real-map-wrap">
      <div ref={mapElement} className="real-map" />
      <div className="map-overlay-legend">
        <span>
          <i className="legend-dot blue" /> Verified
        </span>
        <span>
          <i className="legend-dot amber" /> Review
        </span>
        <span>
          <i className="legend-dot coral" /> Suspicious
        </span>
        <small>Circle size = intensity</small>
      </div>
    </div>
  );
}

function DashboardEnhanced({
  filters,
  setFilters,
  visibleReports,
  onAction,
  onOpenAlert,
  onSeedSamples,
}: {
  filters: Filters;
  setFilters: (value: Filters) => void;
  visibleReports: Report[];
  onAction: (message: string) => void;
  onOpenAlert: (report: Report) => void;
  onSeedSamples: () => void;
}) {
  const average = visibleReports.length
    ? (() => {
        const values = visibleReports.flatMap((report) => report.confidence === null ? [] : [report.confidence]);
        return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
      })()
    : null;
  return (
    <div className="page-wrap">
      <div className="page-heading">
        <div>
          <p className="eyebrow">REAL-TIME WEATHER INTELLIGENCE</p>
          <h1>Ground truth, at a glance.</h1>
          <p className="subheading">
            A live view of verified weather events across the network.
          </p>
        </div>
        <div className="admin-page-actions">
          <button className="outline-button" onClick={onSeedSamples}>
            <Database size={16} /> Create 12 sample events
          </button>
          <button
            className="outline-button"
            onClick={() => onAction("Report intake is available from the Citizen Portal.")}
          >
            <MapPin size={16} /> Submit observation
          </button>
        </div>
      </div>
      <FilterControls filters={filters} setFilters={setFilters} />
      <section className="stat-grid">
        <Stat
          icon={Globe2}
          label="Events in view"
          value={String(visibleReports.length)}
          detail="Responding to filters"
        />
        <Stat
          icon={ShieldCheck}
          label="Verified confidence"
          value={average === null ? "N/A" : `${average}%`}
          detail={average === null ? "Not assessed" : "Filtered event average"}
        />
        <Stat
          icon={AlertTriangle}
          label="Needs review"
          value={String(
            visibleReports.filter((report) => report.status !== "Verified")
              .length,
          )}
          detail="In current view"
          tone="coral"
        />
        <Stat
          icon={UsersRound}
          label="Ground observations"
          value={String(
            visibleReports.reduce((sum, report) => sum + report.reports, 0),
          )}
          detail="Reports in current view"
          trend="up"
        />
      </section>
      <section className="primary-grid">
        <div className="map-panel panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">
                <span className="live-dot" /> LIVE INDIA MAP
              </span>
              <h2>Event intensity</h2>
            </div>
            <span className="metric-tag">{visibleReports.length} EVENTS</span>
          </div>
          <IndiaMap reports={visibleReports} />
          <div className="map-footer">
            <span>
              <MapPin size={14} /> India / filtered view
            </span>
            <span>Intensity overlay active</span>
          </div>
        </div>
        <div className="signal-panel panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">NETWORK SIGNAL</span>
              <h2>Report velocity</h2>
            </div>
            <span className="metric-tag">LIVE</span>
          </div>
          <div className="signal-value">
            {visibleReports.reduce((sum, report) => sum + report.reports, 0)}{" "}
            <small>reports in view</small>
          </div>
          <div className="bars">
            {[42, 55, 38, 62, 50, 76, 64, 88, 71, 92, 80, 96].map(
              (height, index) => (
                <i key={index} style={{ height: `${height}%` }} />
              ),
            )}
          </div>
          <div className="signal-foot">
            <span>
              <span className="trend-up">+18%</span> vs previous window
            </span>
            <span>{filters.period}</span>
          </div>
          <div className="signal-divider" />
          <div className="mini-stat">
            <span>
              <Database size={16} /> Source health
            </span>
            <strong>N/A</strong>
          </div>
          <div className="mini-stat">
            <span>
              <Gauge size={16} /> Ingestion health
            </span>
            <strong>Not connected</strong>
          </div>
        </div>
      </section>
      <section className="lower-grid">
        <div className="events-panel panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">CONSOLIDATED EVENTS</span>
              <h2>Recent intelligence</h2>
            </div>
            <span className="queue-count">{visibleReports.length}</span>
          </div>
          <div className="event-list">
            {visibleReports.length ? (
              visibleReports.map((report) => (
                <EventRow key={report.id} report={report} onAction={onAction} onOpenAlert={onOpenAlert} />
              ))
            ) : (
              <div className="empty-state">
                No events match the current filters.
              </div>
            )}
          </div>
        </div>
        <div className="review-panel panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">ADMIN QUEUE</span>
              <h2>Needs attention</h2>
            </div>
            <span className="queue-count">
              {
                visibleReports.filter((report) => report.status !== "Verified")
                  .length
              }
            </span>
          </div>
          <div className="attention-item">
            <span className="priority-dot coral" />
            <div>
              <strong>Recycled image detected</strong>
              <small>Review suspicious source evidence</small>
            </div>
            <button
              onClick={() => {
                const reviewReport = visibleReports.find((report) => report.status !== "Verified") ?? visibleReports[0];
                if (reviewReport) onOpenAlert(reviewReport);
              }}
              aria-label="Review selected event"
            >
              <ArrowUpRight size={15} />
            </button>
          </div>
          <button
            className="queue-button"
            onClick={() => onAction("Admin review queue opened.")}
          >
            Open review queue <ArrowUpRight size={14} />
          </button>
        </div>
      </section>
    </div>
  );
}

function ReviewQueueEnhanced({
  filters,
  setFilters,
  visibleReports,
  onAction,
  onOpenAlert,
  onSeedSamples,
}: {
  filters: Filters;
  setFilters: (value: Filters) => void;
  visibleReports: Report[];
  onAction: (message: string) => void;
  onOpenAlert: (report: Report) => void;
  onSeedSamples: () => void;
}) {
  const [query, setQuery] = useState("");
  const searchedReports = visibleReports.filter((report) =>
    `${report.id} ${report.location} ${report.source} ${report.title}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className="page-wrap">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMINISTRATION / VERIFICATION</p>
          <h1>Review queue.</h1>
          <p className="subheading">
            The same filters now narrow the evidence queue and map context.
          </p>
        </div>
        <div className="queue-summary">
          <strong>{searchedReports.length}</strong>
          <span>events in view</span>
          <button className="outline-button" onClick={onSeedSamples}><Database size={15} /> Seed samples</button>
        </div>
      </div>
      <FilterControls filters={filters} setFilters={setFilters} />
      <section className="review-toolbar">
        <div className="search-field">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search event ID, location or source"
          />
        </div>
        <span className="filter-result">
          {searchedReports.length} matching events
        </span>
      </section>
      <section className="review-table panel">
        <div className="table-header">
          <span>Event / location</span>
          <span>Evidence signal</span>
          <span>AI confidence</span>
          <span>Received</span>
          <span>Action</span>
        </div>
        {searchedReports.length ? (
          searchedReports.map((report, index) => (
            <div className="table-row" key={report.id}>
              <div className="event-cell">
                <span className={`event-icon ${report.tone}`}>
                  <CloudRain size={16} />
                </span>
                <span>
                  <strong>{report.title}</strong>
                  <small>
                    {report.id} · {report.location}
                  </small>
                </span>
              </div>
              <div className="evidence-cell">
                <span className="evidence-line">
                  <i style={{ width: `${report.confidence ?? 0}%` }} />
                </span>
                <small>{report.source}</small>
              </div>
              <strong className={`confidence ${report.tone}`}>
                {report.confidence === null ? "N/A" : `${report.confidence}%`}
              </strong>
              <span className="muted-text">{report.time}</span>
              <div className="row-actions">
                <button className="icon-button" onClick={() => onOpenAlert(report)} aria-label={`Open ${report.id}`}>
                  <ArrowUpRight size={16} />
                </button>
                {index === 0 ? (
                  <button
                    className="approve-button"
                    onClick={() => onAction(`${report.id} marked as verified.`)}
                  >
                    <Check size={14} /> Verify
                  </button>
                ) : (
                  <button
                    className="review-action"
                    onClick={() =>
                      onAction(`Evidence drawer opened for ${report.id}.`)
                    }
                  >
                    Inspect <ArrowUpRight size={14} />
                  </button>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state">
            No review records match the current filters.
          </div>
        )}
      </section>
    </div>
  );
}

function Dashboard({
  period,
  setPeriod,
  eventFilter,
  setEventFilter,
  visibleReports,
  onAction,
}: {
  period: string;
  setPeriod: (value: string) => void;
  eventFilter: string;
  setEventFilter: (value: string) => void;
  visibleReports: Report[];
  onAction: (message: string) => void;
}) {
  return (
    <div className="page-wrap">
      <div className="page-heading">
        <div>
          <p className="eyebrow">REAL-TIME WEATHER INTELLIGENCE</p>
          <h1>Ground truth, at a glance.</h1>
          <p className="subheading">
            A live view of verified weather events across the network.
          </p>
        </div>
        <button
          className="outline-button"
          onClick={() =>
            onAction("Report intake is available from the Citizen Portal.")
          }
        >
          {" "}
          <MapPin size={16} /> Submit observation
        </button>
      </div>
      <section className="filterbar">
        <div className="filter-title">
          <SlidersHorizontal size={16} /> View filters
        </div>
        <label>
          <span>Window</span>
          <select
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
          >
            <option>Last 24 hours</option>
            <option>Last 7 days</option>
            <option>Today</option>
          </select>
        </label>
        <label>
          <span>Event type</span>
          <select
            value={eventFilter}
            onChange={(event) => setEventFilter(event.target.value)}
          >
            <option>All events</option>
            <option>Flooding</option>
            <option>Rainfall</option>
            <option>Strong winds</option>
            <option>Dust storm</option>
          </select>
        </label>
        <label>
          <span>Region</span>
          <select defaultValue="All India">
            <option>All India</option>
            <option>Tamil Nadu</option>
            <option>Rajasthan</option>
            <option>Puducherry</option>
          </select>
        </label>
        <button
          className="filter-reset"
          onClick={() => {
            setPeriod("Last 7 days");
            setEventFilter("All events");
          }}
        >
          <RefreshCw size={14} /> Reset
        </button>
      </section>
      <section className="stat-grid">
        <Stat
          icon={Globe2}
          label="Active events"
          value="28"
          detail="+6 since yesterday"
          trend="up"
        />
        <Stat
          icon={ShieldCheck}
          label="Verified confidence"
          value="86.2%"
          detail="Across all reports"
        />
        <Stat
          icon={AlertTriangle}
          label="Needs review"
          value="12"
          detail="4 high priority"
          tone="coral"
        />
        <Stat
          icon={UsersRound}
          label="Ground observations"
          value="1,284"
          detail="+18.4% this week"
          trend="up"
        />
      </section>
      <section className="primary-grid">
        <div className="map-panel panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">
                <span className="live-dot" /> LIVE MAP
              </span>
              <h2>Event activity</h2>
            </div>
            <button
              className="icon-button"
              onClick={() =>
                onAction(
                  "Map layers are configured for the live geospatial service.",
                )
              }
              aria-label="Map options"
            >
              <MoreHorizontal size={19} />
            </button>
          </div>
          <div className="map-canvas">
            <div className="map-grid" />
            <div className="map-label label-north">NORTH INDIA</div>
            <div className="map-label label-south">SOUTH INDIA</div>
            <div className="map-route route-one" />
            <div className="map-route route-two" />
            <MapMarker className="marker-one" color="blue" label="18" />
            <MapMarker className="marker-two" color="coral" label="6" />
            <MapMarker className="marker-three" color="blue" label="11" />
            <MapMarker className="marker-four" color="amber" label="3" />
            <div className="map-legend">
              <span>
                <i className="legend-dot blue" /> Verified
              </span>
              <span>
                <i className="legend-dot amber" /> Review
              </span>
              <span>
                <i className="legend-dot coral" /> Suspicious
              </span>
            </div>
          </div>
          <div className="map-footer">
            <span>
              <MapPin size={14} /> 28 events in view
            </span>
            <button
              onClick={() => onAction("Map view expanded to full screen.")}
            >
              Expand map <ArrowUpRight size={14} />
            </button>
          </div>
        </div>
        <div className="signal-panel panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">NETWORK SIGNAL</span>
              <h2>Report velocity</h2>
            </div>
            <span className="metric-tag">LIVE</span>
          </div>
          <div className="signal-value">
            42 <small>reports / hr</small>
          </div>
          <div className="bars">
            {[42, 55, 38, 62, 50, 76, 64, 88, 71, 92, 80, 96].map(
              (height, index) => (
                <i key={index} style={{ height: `${height}%` }} />
              ),
            )}
          </div>
          <div className="signal-foot">
            <span>
              <span className="trend-up">+18%</span> vs previous window
            </span>
            <span>12:00 — 14:00</span>
          </div>
          <div className="signal-divider" />
          <div className="mini-stat">
            <span>
              <Database size={16} /> Source health
            </span>
            <strong>N/A</strong>
          </div>
          <div className="mini-stat">
            <span>
              <Gauge size={16} /> Ingestion health
            </span>
            <strong>Not connected</strong>
          </div>
        </div>
      </section>
      <section className="lower-grid">
        <div className="events-panel panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">CONSOLIDATED EVENTS</span>
              <h2>Recent intelligence</h2>
            </div>
            <button
              className="text-button"
              onClick={() => onAction("Showing all consolidated events.")}
            >
              View all <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="event-list">
            {visibleReports.length ? (
              visibleReports.map((report) => (
                <EventRow key={report.id} report={report} onAction={onAction} />
              ))
            ) : (
              <div className="empty-state">No events match this filter.</div>
            )}
          </div>
        </div>
        <div className="review-panel panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">ADMIN QUEUE</span>
              <h2>Needs attention</h2>
            </div>
            <span className="queue-count">12</span>
          </div>
          <div className="attention-item">
            <span className="priority-dot coral" />
            <div>
              <strong>Recycled image detected</strong>
              <small>WV-2026-0144 · Jodhpur</small>
            </div>
            <button
              onClick={() => onAction("Review opened for WV-2026-0144.")}
              aria-label="Review recycled image"
            >
              <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="attention-item">
            <span className="priority-dot amber" />
            <div>
              <strong>Low location confidence</strong>
              <small>WV-2026-0142 · Kozhikode</small>
            </div>
            <button
              onClick={() => onAction("Review opened for WV-2026-0142.")}
              aria-label="Review location confidence"
            >
              <ArrowUpRight size={15} />
            </button>
          </div>
          <button
            className="queue-button"
            onClick={() => onAction("Admin review queue opened.")}
          >
            Open review queue <ArrowUpRight size={14} />
          </button>
        </div>
      </section>
    </div>
  );
}

function ReviewQueue({ onAction }: { onAction: (message: string) => void }) {
  return (
    <div className="page-wrap">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMINISTRATION / VERIFICATION</p>
          <h1>Review queue.</h1>
          <p className="subheading">
            Inspect the evidence behind AI decisions and keep the record
            accountable.
          </p>
        </div>
        <div className="queue-summary">
          <strong>12</strong>
          <span>open reviews</span>
        </div>
      </div>
      <section className="review-toolbar">
        <div className="search-field">
          <Search size={16} />
          <input placeholder="Search event ID, location or source" />
        </div>
        <button className="outline-button">
          <Filter size={16} /> Filters <span className="filter-count">2</span>
        </button>
        <button className="icon-button" aria-label="More review options">
          <MoreHorizontal size={19} />
        </button>
      </section>
      <section className="review-table panel">
        <div className="table-header">
          <span>Event / location</span>
          <span>Evidence signal</span>
          <span>AI confidence</span>
          <span>Received</span>
          <span>Action</span>
        </div>
        {([] as Report[]).map((report, index) => (
          <div className="table-row" key={report.id}>
            <div className="event-cell">
              <span className={`event-icon ${report.tone}`}>
                <CloudRain size={16} />
              </span>
              <span>
                <strong>{report.title}</strong>
                <small>
                  {report.id} · {report.location}
                </small>
              </span>
            </div>
            <div className="evidence-cell">
              <span className="evidence-line">
                <i style={{ width: `${report.confidence ?? 0}%` }} />
              </span>
              <small>{report.source}</small>
            </div>
            <strong className={`confidence ${report.tone}`}>
              {report.confidence === null ? "N/A" : `${report.confidence}%`}
            </strong>
            <span className="muted-text">{report.time}</span>
            <div className="row-actions">
              {index === 0 ? (
                <button
                  className="approve-button"
                  onClick={() => onAction(`${report.id} marked as verified.`)}
                >
                  <Check size={14} /> Verify
                </button>
              ) : (
                <button
                  className="review-action"
                  onClick={() =>
                    onAction(`Evidence drawer opened for ${report.id}.`)
                  }
                >
                  Inspect <ArrowUpRight size={14} />
                </button>
              )}
              <button
                className="icon-button"
                onClick={() => onAction(`More actions for ${report.id}.`)}
                aria-label="More actions"
              >
                <MoreHorizontal size={17} />
              </button>
            </div>
          </div>
        ))}
      </section>
      <div className="review-note">
        <ShieldCheck size={17} />
        <span>
          Every decision keeps its evidence trail, model version, and operator
          action for audit.
        </span>
        <button
          onClick={() =>
            onAction("Audit log is ready for the backend integration.")
          }
        >
          Audit log <ArrowUpRight size={14} />
        </button>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  detail,
  trend,
  tone,
}: {
  icon: typeof Globe2;
  label: string;
  value: string;
  detail: string;
  trend?: string;
  tone?: string;
}) {
  return (
    <div className={`stat-card ${tone ?? ""}`}>
      <div className="stat-icon">
        <Icon size={17} />
      </div>
      <span className="stat-label">{label}</span>
      <strong>{value}</strong>
      <small>
        {trend && <span className="trend-up">{trend === "up" ? "↑" : ""}</span>}{" "}
        {detail}
      </small>
    </div>
  );
}
function MapMarker({
  className,
  color,
  label,
}: {
  className: string;
  color: string;
  label: string;
}) {
  return (
    <div className={`map-marker ${className} ${color}`}>
      <span>{label}</span>
      <i />
    </div>
  );
}
function EventRow({
  report,
  onAction,
  onOpenAlert,
}: {
  report: Report;
  onAction?: (message: string) => void;
  onOpenAlert?: (report: Report) => void;
}) {
  return (
    <div className="event-row">
      <span className={`event-icon ${report.tone}`}>
        <CloudRain size={16} />
      </span>
      <div className="event-info">
        <strong>{report.title}</strong>
        <small>
          <MapPin size={12} /> {report.location}
        </small>
      </div>
      <div className="event-meta">
        <StatusPill status={report.status} />
        <small>
          {report.reports} reports · {report.time}
        </small>
      </div>
      <button
        className="row-arrow"
        onClick={() => onOpenAlert ? onOpenAlert(report) : onAction?.(`Opened intelligence record ${report.id}.`)}
        aria-label={`Open ${report.id}`}
      >
        <ArrowUpRight size={16} />
      </button>
    </div>
  );
}

function AlertDetail({
  report,
  onBack,
  onAction,
  onVerify,
  onSubmit,
}: {
  report: Report;
  onBack: () => void;
  onAction: (message: string) => void;
  onVerify: (report: Report) => void;
  onSubmit: (report: Report) => void | Promise<void>;
}) {
  const [selectedStatus, setSelectedStatus] = useState<Status>(report.status);
  const [reason, setReason] = useState("Ground weather observation and radar consensus verified.");
  const [submitting, setSubmitting] = useState(false);
  const [sendingSubmission, setSendingSubmission] = useState(false);
  const [lastSubmission, setLastSubmission] = useState<{
    submission_id: string;
    notified_count: number;
    email_status: string;
  } | null>(null);

  const eventDate = new Date(report.timestamp ?? Date.UTC(2026, 8, 26, 12) - report.ageHours * 60 * 60 * 1000);
  const documents = report.evidence ?? [
    { name: `${report.id}-citizen-observations.csv`, type: "Ground reports", detail: `${report.reports} submitted observations` },
    { name: `source-${report.id}`, type: "Report provenance", detail: report.source },
    ...(report.confidence === null ? [] : [{ name: `${report.id}-model-summary.txt`, type: "Model explanation", detail: `${report.confidence}% confidence and anomaly notes` }]),
  ];

  const handleSubmitVerification = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const status = selectedStatus === "Verified"
        ? "VERIFIED"
        : selectedStatus === "Suspicious"
          ? "SUSPICIOUS"
          : selectedStatus === "Unsupported"
            ? "UNSUPPORTED"
            : "PENDING";
      const response = await submitVerification(report.id, status, reason, "A. Sharma");

      if (response.ok) {
        const data = response.data;
        setLastSubmission(data);
        onVerify({ ...report, status: selectedStatus });
        if (selectedStatus === "Verified") {
          onAction(`Decision ${data.submission_id} recorded as VERIFIED. Submit the event separately to create citizen alerts.`);
        } else {
          onAction(`Committed #${data.submission_id} to DB with status ${selectedStatus}.`);
        }
      } else {
        onAction(`Backend decision was not recorded: ${response.error}.`);
      }
    } catch {
      onAction("Backend offline. Updated local alert status.");
      onVerify({ ...report, status: selectedStatus });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="alert-detail-page">
      <button className="back-link" onClick={onBack}><ArrowUpRight size={15} /> Back to intelligence dashboard</button>
      <div className="alert-detail-heading">
        <div>
          <p className="eyebrow">ALERT RECORD / {report.id}</p>
          <h1>{report.title}</h1>
          <p className="subheading">Evidence-led record for verification, database persistence, and automated 10 km email dispatch.</p>
        </div>
        <div className="alert-status-stack">
          <span>MODEL PREDICTION</span>
          <StatusPill status={report.status} />
          <small>Current review: {selectedStatus}</small>
        </div>
      </div>
      <section className="alert-detail-grid">
        <div className="alert-facts panel">
          <div className="panel-heading"><div><span className="section-kicker">EVENT CONTEXT</span><h2>What the system knows</h2></div><ShieldCheck size={18} /></div>
          <div className="fact-grid">
            <div><MapPin size={16} /><span><small>Location</small><strong>{report.location}</strong><em>{report.latitude.toFixed(4)}, {report.longitude.toFixed(4)}</em></span></div>
            <div><CalendarDays size={16} /><span><small>Event date</small><strong>{eventDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}</strong></span></div>
            <div><Clock3 size={16} /><span><small>Event time</small><strong>{eventDate.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} IST</strong><em>Received {report.time}</em></span></div>
            <div><Gauge size={16} /><span><small>Model confidence</small><strong>{report.confidence === null ? "Not assessed" : `${report.confidence}%`}</strong><em>{report.intensity === null ? "Intensity not assessed" : `Intensity ${report.intensity}/100`}</em></span></div>
          </div>
          <div className="detail-map"><IndiaMap reports={[report]} /></div>
        </div>
        <aside className="verification-panel panel">
          <span className="section-kicker">HUMAN VERIFICATION & SUBMIT</span>
          <h2>Review & Submit Verification</h2>
          <p>Verify the event first. Only a verified event that you explicitly submit is stored with submitted=true and triggers portal alerts and email within 10 km.</p>
          <form className="submit-verification-form" onSubmit={handleSubmitVerification}>
            <label>
              Select Status
              <div className="status-selector">
                <button
                  type="button"
                  className={`verified ${selectedStatus === "Verified" ? "selected" : ""}`}
                  onClick={() => setSelectedStatus("Verified")}
                >
                  <Check size={13} /> Verify Report
                </button>
                <button
                  type="button"
                  className={`suspicious ${selectedStatus === "Suspicious" ? "selected" : ""}`}
                  onClick={() => setSelectedStatus("Suspicious")}
                >
                  <AlertTriangle size={13} /> Mark Suspicious
                </button>
                <button
                  type="button"
                  className={`review ${selectedStatus === "Unsupported" ? "selected" : ""}`}
                  onClick={() => setSelectedStatus("Unsupported")}
                >
                  Mark Unsupported
                </button>
              </div>
            </label>
            <label>
              Operator Notes / Reason
              <textarea
                className="reason-textarea"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Enter justification or evidence notes..."
                required
              />
            </label>
            <button className="submit-final-button" type="submit" disabled={submitting}>
              <ShieldCheck size={16} />
              {submitting ? "Saving decision..." : selectedStatus === "Verified" ? "Verify event" : "Save review decision"}
            </button>
          </form>

          {selectedStatus === "Verified" && !report.submitted && (
            <button
              className="submit-final-button submit-event-button"
              type="button"
              disabled={sendingSubmission}
              onClick={async () => {
                setSendingSubmission(true);
                try { await onSubmit({ ...report, status: "Verified" }); }
                finally { setSendingSubmission(false); }
              }}
            >
              <Bell size={16} /> {sendingSubmission ? "Submitting event..." : "Submit verified event and alert nearby citizens"}
            </button>
          )}

          {lastSubmission && (
            <div style={{ marginTop: "14px", padding: "10px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", fontSize: "11px", borderRadius: "4px" }}>
              <strong style={{ display: "block", marginBottom: "4px" }}>✓ Committed to DB ({lastSubmission.submission_id})</strong>
              Verification decision saved. Email dispatch waits until you explicitly submit the verified event.
            </div>
          )}

          {report.submitted && <div className="submitted-status-note"><Check size={15} /> VERIFIED · submitted to database · citizen alerts dispatched</div>}

          <div className="verification-current"><small>STATUS AFTER SUBMISSION</small><StatusPill status={selectedStatus} /></div>
        </aside>
      </section>
      <section className="evidence-panel panel">
        <div className="panel-heading"><div><span className="section-kicker">DATABASE EVIDENCE</span><h2>Documents and information</h2></div><span className="metric-tag">{documents.length} RECORDS</span></div>
        <div className="document-list">{documents.map((document) => <div className="document-row" key={document.name}><span className="document-icon"><FileText size={17} /></span><span><strong>{document.name}</strong><small>{document.type} · {document.detail}</small></span><button onClick={() => onAction(`Opened ${document.name}.`)}>Inspect <ArrowUpRight size={14} /></button></div>)}</div>
      </section>
    </div>
  );
}

type SubmissionItem = {
  submission_id: string;
  report_id: string;
  report_title: string;
  location?: string;
  event_type?: string;
  new_status: string;
  previous_status: string;
  reason: string;
  operator: string;
  timestamp: string;
  notified_count: number;
  email_status: string;
};

function SubmissionHistoryPage() {
  const [submissions, setSubmissions] = useState<SubmissionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const result = await listSubmissionHistory();
      if (result.ok) setSubmissions(result.data);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          const result = await listSubmissionHistory();
          if (!isMounted) {
            return;
          }
          if (result.ok) setSubmissions(result.data);
        } catch {
          // Fallback
        } finally {
          if (isMounted) {
            setLoading(false);
          }
        }
      })();
    }, 0);

    return () => {
      isMounted = false;
      window.clearTimeout(timer);
    };
  }, []);

  const filtered = useMemo(() => {
    return submissions.filter((item) => {
      const q = searchTerm.toLowerCase();
      return (
        item.submission_id.toLowerCase().includes(q) ||
        item.report_id.toLowerCase().includes(q) ||
        item.report_title.toLowerCase().includes(q) ||
        (item.location ?? "").toLowerCase().includes(q) ||
        item.operator.toLowerCase().includes(q)
      );
    });
  }, [submissions, searchTerm]);

  return (
    <div className="history-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">AUDIT & VERIFICATION HISTORY</p>
          <h1>Admin Submission & Dispatch Log</h1>
          <p className="subheading">
            Persistent database audit trail of all admin verification submissions and automated 10 km email dispatches.
          </p>
        </div>
        <button className="outline-button" onClick={() => void fetchHistory()}>
          <RefreshCw size={14} /> Refresh History
        </button>
      </div>

      <div className="review-toolbar">
        <div className="search-field">
          <Search size={15} />
          <input
            type="text"
            placeholder="Search submission ID, report ID, location, or operator..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="filter-result">{filtered.length} submission record(s)</div>
      </div>

      <div className="history-table-panel">
        <div className="history-table-header">
          <span>Submission ID</span>
          <span>Event & Location</span>
          <span>Status Applied</span>
          <span>Operator</span>
          <span>Reason / Operator Notes</span>
          <span>10 km Auto-Email</span>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            {loading ? "Loading submission history..." : "No verification submissions recorded yet."}
          </div>
        ) : (
          filtered.map((item) => {
            const statusLabel = (item.new_status.charAt(0).toUpperCase() + item.new_status.slice(1).toLowerCase()) as Status;
            return (
              <div className="history-table-row" key={item.submission_id}>
                <div>
                  <strong>{item.submission_id}</strong>
                  <small className="muted-text" style={{ display: "block" }}>
                    {new Date(item.timestamp).toLocaleString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </small>
                </div>

                <div>
                  <strong>{item.report_id}</strong> · {item.event_type}
                  <small className="muted-text" style={{ display: "block" }}>{item.location}</small>
                </div>

                <div>
                  <StatusPill status={statusLabel} />
                </div>

                <div>
                  <strong>{item.operator}</strong>
                </div>

                <div style={{ color: "#475569", fontSize: "11px" }}>
                  {item.reason}
                </div>

                <div>
                  <span className={`notified-badge ${item.notified_count === 0 ? "zero" : ""}`}>
                    <Mail size={12} />
                    {item.notified_count} citizen{item.notified_count === 1 ? "" : "s"} (10km)
                  </span>
                  <small className="muted-text" style={{ display: "block", marginTop: "3px" }}>
                    Status: {item.email_status.toUpperCase()}
                  </small>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// VayuAnalysisPage → fully replaced by src/pages/admin/Analysis/Analysis.tsx (AnalysisPage)

void Dashboard;
void ReviewQueue;

export default App;
