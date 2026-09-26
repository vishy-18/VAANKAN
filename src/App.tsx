import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import L from "leaflet";
import {
  Activity,
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
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Moon,
  Sun,
  UserRound,
  UsersRound,
} from "lucide-react";
import "./App.css";
import "leaflet/dist/leaflet.css";
import AnalysisPage from "./pages/admin/Analysis/Analysis";

type View = "dashboard" | "review" | "alert" | "history" | "analysis";
type Status = "Verified" | "Review" | "Suspicious";
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
  confidence: number;
  reports: number;
  tone: "blue" | "coral" | "amber";
  category: string;
  region: string;
  ageHours: number;
  latitude: number;
  longitude: number;
  intensity: number;
  evidence?: EvidenceItem[];
};

type EvidenceItem = { name: string; type: string; detail: string };

const reports: Report[] = [
  {
    id: "WV-2026-0150",
    title: "Heavy rainfall",
    location: "Medavakkam, Chennai",
    source: "Citizen + Weather API",
    time: "8 min ago",
    status: "Review",
    confidence: 88,
    reports: 7,
    tone: "amber",
    category: "Rainfall",
    region: "Tamil Nadu",
    ageHours: 0.13,
    latitude: 12.9552,
    longitude: 80.1451,
    intensity: 82,
    evidence: [
      { name: "WV-2026-0150-citizen-reports.csv", type: "Ground reports", detail: "7 reports from the Medavakkam area" },
      { name: "weather-api-medavakkam.json", type: "Weather feed", detail: "Rainfall rate and cloud cover observations" },
      { name: "WV-2026-0150-photo-set.webp", type: "Citizen media", detail: "3 uploaded images pending visual review" },
      { name: "WV-2026-0150-model-explanation.txt", type: "Model explanation", detail: "88% evidence confidence; location corroboration 91%" },
    ],
  },
  {
    id: "WV-2026-0147",
    title: "Flash flooding",
    location: "Cuddalore, Tamil Nadu",
    source: "Citizen + IMD",
    time: "12 min ago",
    status: "Verified",
    confidence: 94,
    reports: 18,
    tone: "blue",
    category: "Flooding",
    region: "Tamil Nadu",
    ageHours: 0.2,
    latitude: 11.75,
    longitude: 79.77,
    intensity: 94,
  },
  {
    id: "WV-2026-0146",
    title: "Heavy rainfall",
    location: "Chennai, Tamil Nadu",
    source: "Weather API",
    time: "24 min ago",
    status: "Verified",
    confidence: 91,
    reports: 11,
    tone: "blue",
    category: "Rainfall",
    region: "Tamil Nadu",
    ageHours: 0.4,
    latitude: 13.08,
    longitude: 80.27,
    intensity: 78,
  },
  {
    id: "WV-2026-0145",
    title: "Strong winds",
    location: "Puducherry",
    source: "Social media",
    time: "38 min ago",
    status: "Review",
    confidence: 67,
    reports: 6,
    tone: "amber",
    category: "Strong winds",
    region: "Puducherry",
    ageHours: 0.7,
    latitude: 11.91,
    longitude: 79.81,
    intensity: 67,
  },
  {
    id: "WV-2026-0144",
    title: "Dust storm",
    location: "Jodhpur, Rajasthan",
    source: "Citizen portal",
    time: "52 min ago",
    status: "Suspicious",
    confidence: 31,
    reports: 3,
    tone: "coral",
    category: "Dust storm",
    region: "Rajasthan",
    ageHours: 0.9,
    latitude: 26.24,
    longitude: 73.02,
    intensity: 31,
  },
  {
    id: "WV-2026-0143",
    title: "Thunderstorm",
    location: "Kolkata, West Bengal",
    source: "Weather API",
    time: "1 hr ago",
    status: "Verified",
    confidence: 84,
    reports: 14,
    tone: "blue",
    category: "Thunderstorm",
    region: "West Bengal",
    ageHours: 1,
    latitude: 22.57,
    longitude: 88.36,
    intensity: 84,
  },
  {
    id: "WV-2026-0142",
    title: "Flash flooding",
    location: "Kozhikode, Kerala",
    source: "Citizen + social",
    time: "2 hrs ago",
    status: "Review",
    confidence: 72,
    reports: 9,
    tone: "amber",
    category: "Flooding",
    region: "Kerala",
    ageHours: 2,
    latitude: 11.26,
    longitude: 75.78,
    intensity: 72,
  },
  {
    id: "WV-2026-0141",
    title: "Heatwave",
    location: "Nagpur, Maharashtra",
    source: "Weather API",
    time: "4 hrs ago",
    status: "Verified",
    confidence: 89,
    reports: 8,
    tone: "blue",
    category: "Heatwave",
    region: "Maharashtra",
    ageHours: 4,
    latitude: 21.15,
    longitude: 79.09,
    intensity: 89,
  },
  {
    id: "WV-2026-0140",
    title: "Fog",
    location: "Amritsar, Punjab",
    source: "Citizen portal",
    time: "7 hrs ago",
    status: "Verified",
    confidence: 81,
    reports: 7,
    tone: "blue",
    category: "Fog",
    region: "Punjab",
    ageHours: 7,
    latitude: 31.63,
    longitude: 74.87,
    intensity: 81,
  },
  {
    id: "WV-2026-0139",
    title: "Heavy rainfall",
    location: "Guwahati, Assam",
    source: "Social media",
    time: "13 hrs ago",
    status: "Review",
    confidence: 64,
    reports: 5,
    tone: "amber",
    category: "Rainfall",
    region: "Assam",
    ageHours: 13,
    latitude: 26.14,
    longitude: 91.73,
    intensity: 64,
  },
  {
    id: "WV-2026-0138",
    title: "Strong winds",
    location: "Visakhapatnam, Andhra Pradesh",
    source: "Citizen + IMD",
    time: "21 hrs ago",
    status: "Verified",
    confidence: 86,
    reports: 10,
    tone: "blue",
    category: "Strong winds",
    region: "Andhra Pradesh",
    ageHours: 21,
    latitude: 17.69,
    longitude: 83.22,
    intensity: 86,
  },
  {
    id: "WV-2026-0137",
    title: "Dust storm",
    location: "Jaipur, Rajasthan",
    source: "Web report",
    time: "2 days ago",
    status: "Suspicious",
    confidence: 38,
    reports: 4,
    tone: "coral",
    category: "Dust storm",
    region: "Rajasthan",
    ageHours: 36,
    latitude: 26.91,
    longitude: 75.79,
    intensity: 38,
  },
  {
    id: "WV-2026-0136",
    title: "Thunderstorm",
    location: "Bhopal, Madhya Pradesh",
    source: "Citizen portal",
    time: "5 days ago",
    status: "Verified",
    confidence: 77,
    reports: 6,
    tone: "blue",
    category: "Thunderstorm",
    region: "Madhya Pradesh",
    ageHours: 120,
    latitude: 23.26,
    longitude: 77.41,
    intensity: 77,
  },
];

type NavItem = {
  label: string;
  icon: typeof LayoutDashboard;
  view: View;
  count?: number;
};

const navItems: NavItem[] = [
  { label: "Admin Panel", icon: LayoutDashboard, view: "dashboard" as View },
  { label: "History Page", icon: History, view: "history" as View },
  { label: "Analysis Page", icon: Activity, view: "analysis" as View },
];

function StatusPill({ status }: { status: Status }) {
  return (
    <span className={`status-pill ${status.toLowerCase()}`}>
      <span />
      {status}
    </span>
  );
}

function AdminApp() {
  const [view, setView] = useState<View>("dashboard");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [role, setRole] = useState<Role>("admin");
  const [darkMode, setDarkMode] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    period: "Last 24 hours",
    event: "All events",
    region: "All India",
    status: "All statuses",
  });
  const [mobileNav, setMobileNav] = useState(false);
  const [notice, setNotice] = useState("");
  const [selectedAlert, setSelectedAlert] = useState<Report | null>(null);
  const visibleReports = useMemo(
    () =>
      reports.map((report) =>
        loadVerifiedAlertIds().includes(report.id)
          ? { ...report, status: "Verified" as Status }
          : report,
      ).filter((report) => {
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
    [filters],
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
    const verifiedReport = { ...report, status: "Verified" as Status };
    markAlertVerified(report.id);
    setSelectedAlert(verifiedReport);

    try {
      const response = await fetch(
        `http://127.0.0.1:8000/api/admin/reports/${report.id}/submit-verification`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "VERIFIED",
            reason: "Ground weather evidence & consensus verified by admin operator",
            operator: "A. Sharma",
          }),
        },
      );
      if (response.ok) {
        const data = (await response.json()) as {
          submission_id: string;
          notified_count: number;
        };
        showNotice(
          `Alert ${report.id} verified & committed to DB. Automatically sent email to ${data.notified_count} citizen(s) within 10 km!`,
        );
      } else {
        showNotice(`${report.id} verified.`);
      }
    } catch {
      const notifications = dispatchAlertNotifications(verifiedReport);
      void sendExternalNotifications(verifiedReport, notifications, showNotice);
    }
  };

  if (!isAuthenticated) {
    return (
      <LoginPage
        onLogin={(selectedRole) => {
          setRole(selectedRole);
          setIsAuthenticated(true);
        }}
        onAction={showNotice}
        notice={notice}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
      />
    );
  }

  return (
    <div className={`app-shell ${darkMode ? "night-mode" : ""}`}>
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div className="brand">
          <span className="brand-mark">
            <CloudRain size={18} />
          </span>
          <span>VAANKAN</span>
          <small>v0.1 / DEMO</small>
        </div>
        <div className="network-status">
          <span className="pulse" /> Live network <strong>98.4%</strong>
        </div>
        <nav>
          <p className="nav-label">Operations</p>
          {navItems.map(({ label, icon: Icon, view: itemView, count }) => (
            <button
              key={label}
              className={`nav-item ${view === itemView ? "active" : ""}`}
              onClick={() => {
                setView(itemView);
                setMobileNav(false);
              }}
            >
              <Icon size={17} />
              {label}
              {count && <b>{count}</b>}
            </button>
          ))}
          <p className="nav-label nav-spacer">System</p>
          <button
            className="nav-item"
            onClick={() =>
              showNotice("Source monitor is coming with the ingestion layer.")
            }
          >
            <Radio size={17} />
            Source monitor
          </button>
          <button
            className="nav-item"
            onClick={() =>
              showNotice("Analytics are being prepared for the next release.")
            }
          >
            <Activity size={17} />
            Analytics
          </button>
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
                  : view === "analysis"
                    ? "VAYU Weather Data Analysis Engine"
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
          />
        ) : view === "review" ? (
          <ReviewQueueEnhanced
            filters={filters}
            setFilters={setFilters}
            visibleReports={visibleReports}
            onAction={showNotice}
            onOpenAlert={openAlert}
          />
        ) : view === "history" ? (
          <SubmissionHistoryPage />
        ) : view === "analysis" ? (
          <AnalysisPage
            filters={filters}
            setFilters={setFilters}
            visibleReports={visibleReports}
            onAction={showNotice}
          />
        ) : selectedAlert ? (
          <AlertDetail report={selectedAlert} onBack={() => setView("dashboard")} onAction={showNotice} onVerify={verifyAlert} />
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
  return window.location.pathname.startsWith("/citizen") ? (
    <CitizenPortal />
  ) : (
    <AdminApp />
  );
}

function LoginPage({
  onLogin,
  onAction,
  notice,
  darkMode,
  setDarkMode,
}: {
  onLogin: (role: Role) => void;
  onAction: (message: string) => void;
  notice: string;
  darkMode: boolean;
  setDarkMode: (value: boolean) => void;
}) {
  const [email, setEmail] = useState("operator@vaankan.gov.in");
  const [password, setPassword] = useState("");
  const [loginRole, setLoginRole] = useState<Role>("admin");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password) {
      onAction("Enter your password to continue.");
      return;
    }
    onLogin(loginRole);
  };

  return (
    <div className={`login-page ${darkMode ? "night-mode" : ""}`}>
      <section className="login-story">
        <div className="login-brand">
          <span className="brand-mark">
            <CloudRain size={18} />
          </span>
          <span>VAANKAN</span>
        </div>
        <div className="login-story-copy">
          <p className="eyebrow">NATIONAL WEATHER INTELLIGENCE</p>
          <h1>From sky to ground truth.</h1>
          <p>
            One secure control room for verified weather events, citizen
            observations, and evidence-led decisions.
          </p>
          <div className="login-signals">
            <span>
              <span className="pulse" /> Live network
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
          <p className="eyebrow">SECURE ACCESS</p>
          <h2>Welcome back.</h2>
          <p className="login-intro">Sign in to open your workspace.</p>
          <div className="role-tabs">
            <button
              className={loginRole === "admin" ? "active" : ""}
              onClick={() => setLoginRole("admin")}
            >
              <ShieldCheck size={15} /> Admin panel
            </button>
            <button
              className={loginRole === "citizen" ? "active" : ""}
              onClick={() => setLoginRole("citizen")}
            >
              <UsersRound size={15} /> Citizen portal
            </button>
          </div>
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
              <ShieldCheck size={16} /> Sign in as{" "}
              {loginRole === "admin" ? "admin" : "citizen"}{" "}
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
  name: string;
  phone: string;
  email: string;
  id: string;
  address: string;
  latitude: string;
  longitude: string;
  password: string;
  createdAt: string;
};

const citizenDatabaseKey = "vaankan-citizen-profiles";
const notificationDatabaseKey = "vaankan-alert-notifications";
const verifiedAlertsKey = "vaankan-verified-alerts";

type AlertNotification = {
  id: string;
  reportId: string;
  email: string;
  phone: string;
  distanceKm: number;
  channels: { portal: string; email: string; sms: string };
  createdAt: string;
};

function loadCitizenProfiles(): CitizenProfile[] {
  try {
    const stored = window.localStorage.getItem(citizenDatabaseKey);
    return stored ? (JSON.parse(stored) as CitizenProfile[]) : [];
  } catch {
    return [];
  }
}

function saveCitizenProfiles(profiles: CitizenProfile[]) {
  window.localStorage.setItem(citizenDatabaseKey, JSON.stringify(profiles));
}

function loadAlertNotifications(): AlertNotification[] {
  try {
    const stored = window.localStorage.getItem(notificationDatabaseKey);
    return stored ? (JSON.parse(stored) as AlertNotification[]) : [];
  } catch {
    return [];
  }
}

function loadVerifiedAlertIds(): string[] {
  try {
    return JSON.parse(window.localStorage.getItem(verifiedAlertsKey) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function markAlertVerified(reportId: string) {
  const verifiedIds = loadVerifiedAlertIds();
  if (!verifiedIds.includes(reportId)) {
    window.localStorage.setItem(verifiedAlertsKey, JSON.stringify([...verifiedIds, reportId]));
  }
}

function dispatchAlertNotifications(report: Report) {
  const recipients = loadCitizenProfiles()
    .map((profile) => ({
      profile,
      distanceKm:
        profile.latitude && profile.longitude
          ? distanceInKm(
              { latitude: report.latitude, longitude: report.longitude },
              { latitude: Number(profile.latitude), longitude: Number(profile.longitude) },
            )
          : Number.POSITIVE_INFINITY,
    }))
    .filter(({ distanceKm }) => distanceKm <= 10);
  const existing = loadAlertNotifications();
  const next = recipients.map(({ profile, distanceKm }) => ({
    id: `${report.id}-${profile.email}`,
    reportId: report.id,
    email: profile.email,
    phone: profile.phone,
    distanceKm: Number(distanceKm.toFixed(2)),
    channels: { portal: "queued", email: "queued", sms: "queued" },
    createdAt: new Date().toISOString(),
  }));
  const merged = [...next, ...existing.filter((item) => !next.some((notification) => notification.id === item.id))];
  window.localStorage.setItem(notificationDatabaseKey, JSON.stringify(merged));
  return next;
}

async function sendExternalNotifications(
  report: Report,
  notifications: AlertNotification[],
  showNotice: (message: string) => void,
) {
  if (!notifications.length) return;
  const results = await Promise.all(
    notifications.map(async (notification) => {
      try {
        const response = await fetch("http://127.0.0.1:8000/api/notifications/dispatch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            report_id: report.id,
            email: notification.email,
            phone: notification.phone,
            subject: `VAANKAN verified alert: ${report.title}`,
            body: `Verified VAANKAN alert: ${report.title} at ${report.location}. This event is within ${notification.distanceKm} km of your saved location.`,
          }),
        });
        return response.ok ? await response.json() as { email: string; sms: string; sent: boolean } : { email: "api_error", sms: "api_error", sent: false };
      } catch {
        return { email: "api_unavailable", sms: "api_unavailable", sent: false };
      }
    }),
  );
  const sent = results.filter((result) => result.sent).length;
  if (sent) {
    showNotice(`${sent} user${sent === 1 ? "" : "s"} received a provider notification.`);
  } else {
    showNotice("No email or SMS was sent. Configure SMTP and Twilio provider settings in the backend.");
  }
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
  const [profiles, setProfiles] =
    useState<CitizenProfile[]>(loadCitizenProfiles);
  const [activeProfile, setActiveProfile] = useState<CitizenProfile | null>(
    null,
  );
  const [showRegistration, setShowRegistration] = useState(false);
  const [citizenView, setCitizenView] = useState<
    "home" | "alerts" | "search" | "profile"
  >("home");
  const [filters, setFilters] = useState<Filters>({
    period: "Last 24 hours",
    event: "All events",
    region: "All India",
    status: "All statuses",
  });
  const [location, setLocation] = useState<CitizenLocation | null>(null);
  const [locationStatus, setLocationStatus] = useState("Location not shared");
  const [notice, setNotice] = useState("");
  const [nightMode, setNightMode] = useState(false);
  const [notificationRevision, setNotificationRevision] = useState(0);
  const [verifiedAlertIds, setVerifiedAlertIds] = useState<string[]>(loadVerifiedAlertIds);
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
          const updatedProfile = {
            ...activeProfile,
            latitude: String(nextLocation.latitude),
            longitude: String(nextLocation.longitude),
          };
          setActiveProfile(updatedProfile);
          const updatedProfiles = profiles.map((profile) =>
            profile.email === updatedProfile.email ? updatedProfile : profile,
          );
          setProfiles(updatedProfiles);
          saveCitizenProfiles(updatedProfiles);
        }
        setLocationStatus("GPS location updated");
      },
      () => setLocationStatus("Location permission declined"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };
  useEffect(() => {
    const refreshNotifications = (event: StorageEvent) => {
      if (event.key === verifiedAlertsKey || event.key === notificationDatabaseKey) {
        setVerifiedAlertIds(loadVerifiedAlertIds());
        setNotificationRevision((revision) => revision + 1);
      }
    };
    window.addEventListener("storage", refreshNotifications);
    return () => window.removeEventListener("storage", refreshNotifications);
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
        setActiveProfile((currentProfile) => {
          if (!currentProfile) return currentProfile;
          const updatedProfile = {
            ...currentProfile,
            latitude: String(nextLocation.latitude),
            longitude: String(nextLocation.longitude),
          };
          setProfiles((currentProfiles) => {
            const updatedProfiles = currentProfiles.map((profile) =>
              profile.email === updatedProfile.email ? updatedProfile : profile,
            );
            saveCitizenProfiles(updatedProfiles);
            return updatedProfiles;
          });
          return updatedProfile;
        });
        setLocationStatus("GPS tracking active");
      },
      () =>
        setLocationStatus("GPS permission is required for local intelligence"),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
    );
    return () => {
      if (watchId.current !== null)
        navigator.geolocation.clearWatch(watchId.current);
    };
  }, [authenticated]);
  const completeLogin = (profile: CitizenProfile) => {
    setActiveProfile(profile);
    setAuthenticated(true);
  };
  const persistProfile = (profile: CitizenProfile) => {
    const updatedProfiles = profiles.some(
      (item) => item.email === profile.email,
    )
      ? profiles.map((item) => (item.email === profile.email ? profile : item))
      : [...profiles, profile];
    setProfiles(updatedProfiles);
    setActiveProfile(profile);
    saveCitizenProfiles(updatedProfiles);
    setAuthenticated(true);
    setCitizenView("profile");
    showNotice("Your citizen profile was saved.");
  };
  const logout = () => {
    setAuthenticated(false);
    setActiveProfile(null);
    setCitizenView("home");
  };
  const visibleReports = useMemo(
    () => {
      return reports
        .map((report) =>
          verifiedAlertIds.includes(report.id)
            ? { ...report, status: "Verified" as Status }
            : report,
        )
        .filter((report) => {
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
    [filters, verifiedAlertIds],
  );
  const locationReports = useMemo(
    () =>
      location
        ? visibleReports
            .map((report) => ({
              ...report,
              distance: distanceInKm(location, report),
            }))
            .filter((report) => report.distance <= 50)
        : [],
    [location, visibleReports],
  );
  const nearbyAlerts = useMemo(
    () =>
      locationReports.filter(
        (report) => report.distance <= 10 && report.status !== "Suspicious",
      ),
    [locationReports],
  );

  if (!authenticated)
    return (
      <CitizenLoginDatabase
        showRegistration={showRegistration}
        setShowRegistration={setShowRegistration}
        profiles={profiles}
        onLogin={completeLogin}
        onRegister={persistProfile}
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
            onClick={() => setCitizenView("search")}
          >
            <Search size={16} /> Search
          </button>
          <button
            className={citizenView === "alerts" ? "active" : ""}
            onClick={() => setCitizenView("alerts")}
          >
            <Bell size={16} /> Alerts{" "}
            {nearbyAlerts.length > 0 && <b>{nearbyAlerts.length}</b>}
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
            nearbyAlerts={nearbyAlerts}
            location={location}
            locationStatus={locationStatus}
            requestLocation={requestLocation}
            onAction={showNotice}
          />
        ) : citizenView === "alerts" ? (
          <CitizenAlerts
            nearbyAlerts={nearbyAlerts}
            location={location}
            locationStatus={locationStatus}
            onAction={showNotice}
            profile={activeProfile}
            notificationRevision={notificationRevision}
          />
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
      {notice && (
        <div className="citizen-toast">
          <Check size={16} />
          {notice}
        </div>
      )}
    </div>
  );
}

function CitizenLoginDatabase({
  showRegistration,
  setShowRegistration,
  profiles,
  onLogin,
  onRegister,
  notice = "",
}: {
  showRegistration: boolean;
  setShowRegistration: (value: boolean) => void;
  profiles: CitizenProfile[];
  onLogin: (profile: CitizenProfile) => void;
  onRegister: (profile: CitizenProfile) => void;
  notice?: string;
}) {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
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
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    if (!password || !form.email) {
      setMessage("Email and password are required.");
      return;
    }
    if (showRegistration) {
      if (!form.name || !form.phone || !form.id || !form.address) {
        setMessage("Add your personal details and address to register.");
        return;
      }
      if (
        profiles.some(
          (profile) => profile.email.toLowerCase() === form.email.toLowerCase(),
        )
      ) {
        setMessage("An account with this email already exists.");
        return;
      }
      onRegister({
        ...form,
        latitude: "",
        longitude: "",
        password,
        createdAt: new Date().toISOString(),
      });
      return;
    }
    const profile = profiles.find(
      (item) =>
        item.email.toLowerCase() === form.email.toLowerCase() &&
        item.password === password,
    );
    if (!profile) {
      setMessage(
        "No matching citizen account found. Register first or check your password.",
      );
      return;
    }
    onLogin(profile);
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
              />
            </label>
            <button className="citizen-submit" type="submit">
              {showRegistration ? "Create account" : "Sign in"}{" "}
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
            Profiles are stored locally for this MVP. GPS permission is
            requested after sign-in and tracked while the portal is open.
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
            <span className="citizen-card-label">SAVED LOCALLY</span>
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
          <span>Last saved locally from this browser</span>
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
                {localReports.length
                ? Math.round(
                  localReports.reduce(
                      (sum, report) => sum + report.intensity,
                      0,
                    ) / visibleReports.length,
                  )
                : 0}
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
              {localReports.length
                ? `${Math.round(localReports.reduce((sum, report) => sum + report.confidence, 0) / localReports.length)}%`
                : "0%"}
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
            <span className="citizen-map-count">{selectedReport.confidence}% confidence</span>
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
  notificationRevision,
}: {
  nearbyAlerts: Array<Report & { distance: number }>;
  location: CitizenLocation | null;
  locationStatus: string;
  onAction: (message: string) => void;
  profile: CitizenProfile | null;
  notificationRevision: number;
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
      <AlertDeliveryModule key={notificationRevision} profile={profile} onAction={onAction} />
    </div>
  );
}

function AlertDeliveryModule({
  profile,
  onAction,
}: {
  profile: CitizenProfile | null;
  onAction: (message: string) => void;
}) {
  const [sent, setSent] = useState({ portal: true, sms: true, email: true });
  const recentNotification = profile
    ? loadAlertNotifications().find((notification) => notification.email === profile.email)
    : undefined;
  const messageText = recentNotification
    ? `VAANKAN alert ${recentNotification.reportId}: verified weather event within ${recentNotification.distanceKm} km of your current location.`
    : "VAANKAN verified weather alerts";
  const channel = (key: keyof typeof sent, label: string) => {
    setSent((current) => ({ ...current, [key]: true }));
    onAction(`${label} alert delivery enabled.`);
  };
  return (
    <section className="alert-delivery-module">
      <div>
        <span className="citizen-card-label">ALERT DELIVERY</span>
        <h2>Three ways to reach you</h2>
        <p>Portal alerts stay active while GPS tracking is enabled.</p>
      </div>
      <div className="delivery-channels">
        <div><Bell size={17} /><span><strong>Portal</strong><small>{sent.portal ? "Active now" : "Paused"}</small></span><Check size={15} /></div>
        <div><MessageSquare size={17} /><span><strong>SMS</strong><small>{profile?.phone || "Add phone in profile"}</small></span>{profile?.phone ? <a className="delivery-action" href={`sms:${profile.phone}?body=${encodeURIComponent(messageText)}`}>Open</a> : <button onClick={() => channel("sms", "SMS")}>Add</button>}</div>
        <div>
          <Mail size={17} />
          <span>
            <strong>Email</strong>
            <small>{profile?.email || "Add email in profile"}</small>
          </span>
          {profile?.email ? (
            <span className="delivery-action">Automated (10 km)</span>
          ) : (
            <button onClick={() => channel("email", "Email")}>Add</button>
          )}
        </div>
      </div>
      {recentNotification && (
        <div className="delivery-confirmation">
          <Check size={15} /> Alert {recentNotification.reportId} queued {recentNotification.distanceKm} km from you via portal, email, and SMS.
        </div>
      )}
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
            period: "Last 24 hours",
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
      const radius = 18000 + report.intensity * 430;
      const color =
        report.status === "Suspicious"
          ? "#e26b5d"
          : report.status === "Review"
            ? "#c78c27"
            : "#2caeb7";
      L.circle([report.latitude, report.longitude], {
        radius,
        color,
        fillColor: color,
        fillOpacity: 0.13,
        weight: 1,
      }).addTo(map);
      L.circleMarker([report.latitude, report.longitude], {
        radius: 5 + report.intensity / 18,
        color,
        fillColor: color,
        fillOpacity: 0.9,
        weight: 2,
      })
        .bindPopup(
          `<strong>${report.title}</strong><br>${report.location}<br>Intensity: ${report.intensity}%`,
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
}: {
  filters: Filters;
  setFilters: (value: Filters) => void;
  visibleReports: Report[];
  onAction: (message: string) => void;
  onOpenAlert: (report: Report) => void;
}) {
  const average = visibleReports.length
    ? Math.round(
        visibleReports.reduce((sum, report) => sum + report.confidence, 0) /
          visibleReports.length,
      )
    : 0;
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
          <MapPin size={16} /> Submit observation
        </button>
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
          value={`${average}%`}
          detail="Filtered event average"
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
              <Database size={16} /> Sources connected
            </span>
            <strong>14 / 16</strong>
          </div>
          <div className="progress">
            <i style={{ width: "87.5%" }} />
          </div>
          <div className="mini-stat">
            <span>
              <Gauge size={16} /> Processing health
            </span>
            <strong>Good</strong>
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
}: {
  filters: Filters;
  setFilters: (value: Filters) => void;
  visibleReports: Report[];
  onAction: (message: string) => void;
  onOpenAlert: (report: Report) => void;
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
                  <i style={{ width: `${report.confidence}%` }} />
                </span>
                <small>{report.source}</small>
              </div>
              <strong className={`confidence ${report.tone}`}>
                {report.confidence}%
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
            setPeriod("Last 24 hours");
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
              <Database size={16} /> Sources connected
            </span>
            <strong>14 / 16</strong>
          </div>
          <div className="progress">
            <i style={{ width: "87.5%" }} />
          </div>
          <div className="mini-stat">
            <span>
              <Gauge size={16} /> Processing health
            </span>
            <strong>Good</strong>
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
        {reports.map((report, index) => (
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
                <i style={{ width: `${report.confidence}%` }} />
              </span>
              <small>{report.source}</small>
            </div>
            <strong className={`confidence ${report.tone}`}>
              {report.confidence}%
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
}: {
  report: Report;
  onBack: () => void;
  onAction: (message: string) => void;
  onVerify: (report: Report) => void;
}) {
  const [selectedStatus, setSelectedStatus] = useState<Status>(report.status);
  const [reason, setReason] = useState("Ground weather observation and radar consensus verified.");
  const [submitting, setSubmitting] = useState(false);
  const [lastSubmission, setLastSubmission] = useState<{
    submission_id: string;
    notified_count: number;
    email_status: string;
  } | null>(null);

  const eventDate = new Date(Date.UTC(2026, 8, 23, 14, 32 - Math.round(report.ageHours * 60)));
  const documents = report.evidence ?? [
    { name: `${report.id}-citizen-observations.csv`, type: "Ground reports", detail: `${report.reports} submitted observations` },
    { name: `weather-api-${report.id}.json`, type: "Weather feed", detail: `${report.source} signal payload` },
    { name: `${report.id}-model-summary.txt`, type: "Model explanation", detail: `${report.confidence}% confidence and anomaly notes` },
  ];

  const handleSubmitVerification = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/admin/reports/${report.id}/submit-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: selectedStatus.toUpperCase(),
          reason: reason,
          operator: "A. Sharma",
        }),
      });

      if (response.ok) {
        const data = await response.json() as {
          submission_id: string;
          notified_count: number;
          email_status: string;
        };
        setLastSubmission(data);
        onVerify({ ...report, status: selectedStatus });

        if (selectedStatus === "Verified") {
          onAction(`Committed #${data.submission_id} to DB! Automatically emailed ${data.notified_count} citizen(s) within 10 km radius!`);
        } else {
          onAction(`Committed #${data.submission_id} to DB with status ${selectedStatus}.`);
        }
      } else {
        onAction("Failed to submit verification to backend database.");
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
            <div><Gauge size={16} /><span><small>Model confidence</small><strong>{report.confidence}%</strong><em>Intensity {report.intensity}/100</em></span></div>
          </div>
          <div className="detail-map"><IndiaMap reports={[report]} /></div>
        </div>
        <aside className="verification-panel panel">
          <span className="section-kicker">HUMAN VERIFICATION & SUBMIT</span>
          <h2>Review & Submit Verification</h2>
          <p>Confirm the status, write operator notes, and click Submit. When confirmed as <strong>VERIFIED</strong>, the system will automatically email all citizens within a 10 km radius.</p>
          <form className="submit-verification-form" onSubmit={handleSubmitVerification}>
            <label>
              Select Status
              <div className="status-selector">
                <button
                  type="button"
                  className={`verified ${selectedStatus === "Verified" ? "selected" : ""}`}
                  onClick={() => setSelectedStatus("Verified")}
                >
                  <Check size={13} /> Verified
                </button>
                <button
                  type="button"
                  className={`review ${selectedStatus === "Review" ? "selected" : ""}`}
                  onClick={() => setSelectedStatus("Review")}
                >
                  <AlertTriangle size={13} /> Review
                </button>
                <button
                  type="button"
                  className={`suspicious ${selectedStatus === "Suspicious" ? "selected" : ""}`}
                  onClick={() => setSelectedStatus("Suspicious")}
                >
                  <AlertTriangle size={13} /> Suspicious
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
              {submitting ? "Submitting to DB..." : "Submit Verification & Auto-Dispatch Email"}
            </button>
          </form>

          {lastSubmission && (
            <div style={{ marginTop: "14px", padding: "10px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", fontSize: "11px", borderRadius: "4px" }}>
              <strong style={{ display: "block", marginBottom: "4px" }}>✓ Committed to DB ({lastSubmission.submission_id})</strong>
              Auto-dispatched email to {lastSubmission.notified_count} citizen(s) within 10 km radius (Status: {lastSubmission.email_status.toUpperCase()}).
            </div>
          )}

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
  location: string;
  event_type: string;
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
      const response = await fetch("http://127.0.0.1:8000/api/admin/submission-history");
      if (response.ok) {
        const data = await response.json() as SubmissionItem[];
        setSubmissions(data);
      }
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
          const response = await fetch("http://127.0.0.1:8000/api/admin/submission-history");
          if (!isMounted) {
            return;
          }
          if (response.ok) {
            const data = await response.json() as SubmissionItem[];
            setSubmissions(data);
          }
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
        item.location.toLowerCase().includes(q) ||
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
