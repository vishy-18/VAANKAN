import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import L from 'leaflet'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Check,
  ChevronDown,
  CloudRain,
  Database,
  FileCheck2,
  Filter,
  Gauge,
  Globe2,
  Home,
  Bell,
  LocateFixed,
  LogOut,
  Navigation,
  UserPlus,
  LayoutDashboard,
  MapPin,
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
} from 'lucide-react'
import './App.css'
import 'leaflet/dist/leaflet.css'

type View = 'dashboard' | 'review'
type Status = 'Verified' | 'Review' | 'Suspicious'
type Role = 'admin' | 'citizen'
type Filters = { period: string; event: string; region: string; status: string }

type Report = {
  id: string
  title: string
  location: string
  source: string
  time: string
  status: Status
  confidence: number
  reports: number
  tone: 'blue' | 'coral' | 'amber'
  category: string
  region: string
  ageHours: number
  latitude: number
  longitude: number
  intensity: number
}

const reports: Report[] = [
  { id: 'WV-2026-0147', title: 'Flash flooding', location: 'Cuddalore, Tamil Nadu', source: 'Citizen + IMD', time: '12 min ago', status: 'Verified', confidence: 94, reports: 18, tone: 'blue', category: 'Flooding', region: 'Tamil Nadu', ageHours: .2, latitude: 11.75, longitude: 79.77, intensity: 94 },
  { id: 'WV-2026-0146', title: 'Heavy rainfall', location: 'Chennai, Tamil Nadu', source: 'Weather API', time: '24 min ago', status: 'Verified', confidence: 91, reports: 11, tone: 'blue', category: 'Rainfall', region: 'Tamil Nadu', ageHours: .4, latitude: 13.08, longitude: 80.27, intensity: 78 },
  { id: 'WV-2026-0145', title: 'Strong winds', location: 'Puducherry', source: 'Social media', time: '38 min ago', status: 'Review', confidence: 67, reports: 6, tone: 'amber', category: 'Strong winds', region: 'Puducherry', ageHours: .7, latitude: 11.91, longitude: 79.81, intensity: 67 },
  { id: 'WV-2026-0144', title: 'Dust storm', location: 'Jodhpur, Rajasthan', source: 'Citizen portal', time: '52 min ago', status: 'Suspicious', confidence: 31, reports: 3, tone: 'coral', category: 'Dust storm', region: 'Rajasthan', ageHours: .9, latitude: 26.24, longitude: 73.02, intensity: 31 },
  { id: 'WV-2026-0143', title: 'Thunderstorm', location: 'Kolkata, West Bengal', source: 'Weather API', time: '1 hr ago', status: 'Verified', confidence: 84, reports: 14, tone: 'blue', category: 'Thunderstorm', region: 'West Bengal', ageHours: 1, latitude: 22.57, longitude: 88.36, intensity: 84 },
  { id: 'WV-2026-0142', title: 'Flash flooding', location: 'Kozhikode, Kerala', source: 'Citizen + social', time: '2 hrs ago', status: 'Review', confidence: 72, reports: 9, tone: 'amber', category: 'Flooding', region: 'Kerala', ageHours: 2, latitude: 11.26, longitude: 75.78, intensity: 72 },
  { id: 'WV-2026-0141', title: 'Heatwave', location: 'Nagpur, Maharashtra', source: 'Weather API', time: '4 hrs ago', status: 'Verified', confidence: 89, reports: 8, tone: 'blue', category: 'Heatwave', region: 'Maharashtra', ageHours: 4, latitude: 21.15, longitude: 79.09, intensity: 89 },
  { id: 'WV-2026-0140', title: 'Fog', location: 'Amritsar, Punjab', source: 'Citizen portal', time: '7 hrs ago', status: 'Verified', confidence: 81, reports: 7, tone: 'blue', category: 'Fog', region: 'Punjab', ageHours: 7, latitude: 31.63, longitude: 74.87, intensity: 81 },
  { id: 'WV-2026-0139', title: 'Heavy rainfall', location: 'Guwahati, Assam', source: 'Social media', time: '13 hrs ago', status: 'Review', confidence: 64, reports: 5, tone: 'amber', category: 'Rainfall', region: 'Assam', ageHours: 13, latitude: 26.14, longitude: 91.73, intensity: 64 },
  { id: 'WV-2026-0138', title: 'Strong winds', location: 'Visakhapatnam, Andhra Pradesh', source: 'Citizen + IMD', time: '21 hrs ago', status: 'Verified', confidence: 86, reports: 10, tone: 'blue', category: 'Strong winds', region: 'Andhra Pradesh', ageHours: 21, latitude: 17.69, longitude: 83.22, intensity: 86 },
  { id: 'WV-2026-0137', title: 'Dust storm', location: 'Jaipur, Rajasthan', source: 'Web report', time: '2 days ago', status: 'Suspicious', confidence: 38, reports: 4, tone: 'coral', category: 'Dust storm', region: 'Rajasthan', ageHours: 36, latitude: 26.91, longitude: 75.79, intensity: 38 },
  { id: 'WV-2026-0136', title: 'Thunderstorm', location: 'Bhopal, Madhya Pradesh', source: 'Citizen portal', time: '5 days ago', status: 'Verified', confidence: 77, reports: 6, tone: 'blue', category: 'Thunderstorm', region: 'Madhya Pradesh', ageHours: 120, latitude: 23.26, longitude: 77.41, intensity: 77 },
]

const navItems = [
  { label: 'Intelligence', icon: LayoutDashboard, view: 'dashboard' as View },
  { label: 'Admin review', icon: FileCheck2, view: 'review' as View, count: 12 },
]

function StatusPill({ status }: { status: Status }) {
  return <span className={`status-pill ${status.toLowerCase()}`}><span />{status}</span>
}

function AdminApp() {
  const [view, setView] = useState<View>('dashboard')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [role, setRole] = useState<Role>('admin')
  const [darkMode, setDarkMode] = useState(false)
  const [filters, setFilters] = useState<Filters>({ period: 'Last 24 hours', event: 'All events', region: 'All India', status: 'All statuses' })
  const [mobileNav, setMobileNav] = useState(false)
  const [notice, setNotice] = useState('')
  const visibleReports = useMemo(() => reports.filter((report) => {
    const periodHours = filters.period === 'Today' ? 24 : filters.period === 'Last 7 days' ? 168 : 24
    return (filters.event === 'All events' || report.category === filters.event) && (filters.region === 'All India' || report.region === filters.region) && (filters.status === 'All statuses' || report.status === filters.status) && report.ageHours <= periodHours
  }), [filters])

  const showNotice = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2600)
  }

  if (!isAuthenticated) {
    return <LoginPage onLogin={(selectedRole) => { setRole(selectedRole); setIsAuthenticated(true) }} onAction={showNotice} notice={notice} darkMode={darkMode} setDarkMode={setDarkMode} />
  }

  return (
    <div className={`app-shell ${darkMode ? 'night-mode' : ''}`}>
      <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
        <div className="brand"><span className="brand-mark"><CloudRain size={18} /></span><span>VAANKAN</span><small>v0.1 / DEMO</small></div>
        <div className="network-status"><span className="pulse" /> Live network <strong>98.4%</strong></div>
        <nav>
          <p className="nav-label">Operations</p>
          {navItems.map(({ label, icon: Icon, view: itemView, count }) => <button key={label} className={`nav-item ${view === itemView ? 'active' : ''}`} onClick={() => { setView(itemView); setMobileNav(false) }}><Icon size={17} />{label}{count && <b>{count}</b>}</button>)}
          <p className="nav-label nav-spacer">System</p>
          <button className="nav-item" onClick={() => showNotice('Source monitor is coming with the ingestion layer.')}><Radio size={17} />Source monitor</button>
          <button className="nav-item" onClick={() => showNotice('Analytics are being prepared for the next release.')}><Activity size={17} />Analytics</button>
        </nav>
        <div className="sidebar-bottom"><div className="operator"><span className="avatar">AS</span><span><strong>A. Sharma</strong><small>National control room</small></span><MoreHorizontal size={17} /></div><button className="help-link" onClick={() => showNotice('VAANKAN MVP: evidence-first weather intelligence.')}>About this build <ArrowUpRight size={14} /></button></div>
      </aside>

      <main className="main-content">
        <header className="topbar"><button className="icon-button mobile-menu" onClick={() => setMobileNav(!mobileNav)} aria-label="Toggle navigation"><Menu size={20} /></button><div className="breadcrumb"><span>National operations</span><span>/</span><strong>{view === 'dashboard' ? 'Intelligence dashboard' : 'Admin review queue'}</strong></div><div className="top-actions"><span className="last-sync"><RefreshCw size={14} /> Synced 42 sec ago</span><button className="icon-button" onClick={() => setDarkMode(!darkMode)} aria-label="Toggle night mode">{darkMode ? <Sun size={18} /> : <Moon size={18} />}</button><button className="user-button" onClick={() => showNotice(`${role === 'admin' ? 'Admin' : 'Citizen'} profile is active.`)}><UserRound size={16} /> {role === 'admin' ? 'A. Sharma' : 'Citizen observer'} <ChevronDown size={15} /></button><button className="signout-button" onClick={() => { setIsAuthenticated(false); setView('dashboard') }}><ArrowUpRight size={14} /> Sign out</button></div></header>
        {view === 'dashboard' ? <DashboardEnhanced filters={filters} setFilters={setFilters} visibleReports={visibleReports} onAction={showNotice} /> : <ReviewQueueEnhanced filters={filters} setFilters={setFilters} visibleReports={visibleReports} onAction={showNotice} />}
        <footer><span><span className="footer-dot" /> All systems nominal</span><span>VAANKAN intelligence layer <strong>•</strong> 23 Sep 2026, 14:32 IST</span></footer>
      </main>
      {notice && <div className="toast"><Check size={16} />{notice}</div>}
    </div>
  )
}

function App() {
  return window.location.pathname.startsWith('/citizen') ? <CitizenPortal /> : <AdminApp />
}

function LoginPage({ onLogin, onAction, notice, darkMode, setDarkMode }: { onLogin: (role: Role) => void; onAction: (message: string) => void; notice: string; darkMode: boolean; setDarkMode: (value: boolean) => void }) {
  const [email, setEmail] = useState('operator@vaankan.gov.in')
  const [password, setPassword] = useState('')
  const [loginRole, setLoginRole] = useState<Role>('admin')

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!password) {
      onAction('Enter your password to continue.')
      return
    }
    onLogin(loginRole)
  }

  return <div className={`login-page ${darkMode ? 'night-mode' : ''}`}><section className="login-story"><div className="login-brand"><span className="brand-mark"><CloudRain size={18} /></span><span>VAANKAN</span></div><div className="login-story-copy"><p className="eyebrow">NATIONAL WEATHER INTELLIGENCE</p><h1>From sky to ground truth.</h1><p>One secure control room for verified weather events, citizen observations, and evidence-led decisions.</p><div className="login-signals"><span><span className="pulse" /> Live network</span><span><ShieldCheck size={14} /> Evidence-first</span></div></div><small className="login-version">VAANKAN INTELLIGENCE LAYER / v0.1 DEMO</small></section><section className="login-panel"><div className="login-card"><div className="login-theme-toggle"><button className="icon-button" onClick={() => setDarkMode(!darkMode)} aria-label="Toggle night mode">{darkMode ? <Sun size={17} /> : <Moon size={17} />}</button></div><div className="mobile-login-brand"><span className="brand-mark"><CloudRain size={17} /></span><span>VAANKAN</span></div><p className="eyebrow">SECURE ACCESS</p><h2>Welcome back.</h2><p className="login-intro">Sign in to open your workspace.</p><div className="role-tabs"><button className={loginRole === 'admin' ? 'active' : ''} onClick={() => setLoginRole('admin')}><ShieldCheck size={15} /> Admin panel</button><button className={loginRole === 'citizen' ? 'active' : ''} onClick={() => setLoginRole('citizen')}><UsersRound size={15} /> Citizen portal</button></div><form onSubmit={submit}><label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" /></label><div className="login-options"><label className="remember"><input type="checkbox" defaultChecked /> Remember this device</label><button type="button" onClick={() => onAction('Password reset will be connected to the identity service.')}>Forgot password?</button></div><button className="login-submit" type="submit"><ShieldCheck size={16} /> Sign in as {loginRole === 'admin' ? 'admin' : 'citizen'} <ArrowUpRight size={15} /></button></form><p className="login-help">Demo access accepts any non-empty password.<br /><button type="button" onClick={() => onAction('Contact administration is coming with the identity service.')}>Need access? Contact administration <ArrowUpRight size={13} /></button></p></div></section>{notice && <div className="toast"><Check size={16} />{notice}</div>}</div>
}

type CitizenLocation = { latitude: number; longitude: number; label: string }
type CitizenProfile = { name: string; phone: string; email: string; id: string; address: string; latitude: string; longitude: string; password: string; createdAt: string }

const citizenDatabaseKey = 'vaankan-citizen-profiles'

function loadCitizenProfiles(): CitizenProfile[] {
  try {
    const stored = window.localStorage.getItem(citizenDatabaseKey)
    return stored ? JSON.parse(stored) as CitizenProfile[] : []
  } catch {
    return []
  }
}

function saveCitizenProfiles(profiles: CitizenProfile[]) {
  window.localStorage.setItem(citizenDatabaseKey, JSON.stringify(profiles))
}

function distanceInKm(first: { latitude: number; longitude: number }, second: { latitude: number; longitude: number }) {
  const earthRadius = 6371
  const latitudeDelta = (second.latitude - first.latitude) * Math.PI / 180
  const longitudeDelta = (second.longitude - first.longitude) * Math.PI / 180
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(first.latitude * Math.PI / 180) * Math.cos(second.latitude * Math.PI / 180) * Math.sin(longitudeDelta / 2) ** 2
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function CitizenPortal() {
  const [authenticated, setAuthenticated] = useState(false)
  const [profiles, setProfiles] = useState<CitizenProfile[]>(loadCitizenProfiles)
  const [activeProfile, setActiveProfile] = useState<CitizenProfile | null>(null)
  const [showRegistration, setShowRegistration] = useState(false)
  const [citizenView, setCitizenView] = useState<'home' | 'alerts' | 'profile'>('home')
  const [filters, setFilters] = useState<Filters>({ period: 'Last 24 hours', event: 'All events', region: 'All India', status: 'All statuses' })
  const [location, setLocation] = useState<CitizenLocation | null>(null)
  const [locationStatus, setLocationStatus] = useState('Location not shared')
  const [notice, setNotice] = useState('')
  const [nightMode, setNightMode] = useState(false)
  const showNotice = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 2800) }
  const requestLocation = () => {
    if (!navigator.geolocation) { setLocationStatus('GPS is not available in this browser'); return }
    setLocationStatus('Requesting GPS location...')
    navigator.geolocation.getCurrentPosition((position) => {
      const nextLocation = { latitude: position.coords.latitude, longitude: position.coords.longitude, label: `${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}` }
      setLocation(nextLocation)
      if (activeProfile) {
        const updatedProfile = { ...activeProfile, latitude: String(nextLocation.latitude), longitude: String(nextLocation.longitude) }
        setActiveProfile(updatedProfile)
        const updatedProfiles = profiles.map((profile) => profile.email === updatedProfile.email ? updatedProfile : profile)
        setProfiles(updatedProfiles)
        saveCitizenProfiles(updatedProfiles)
      }
      setLocationStatus('GPS location updated')
    }, () => setLocationStatus('Location permission declined'), { enableHighAccuracy: true, timeout: 10000 })
  }
  const completeLogin = (profile: CitizenProfile) => { setActiveProfile(profile); setAuthenticated(true); requestLocation() }
  const persistProfile = (profile: CitizenProfile) => {
    const updatedProfiles = profiles.some((item) => item.email === profile.email) ? profiles.map((item) => item.email === profile.email ? profile : item) : [...profiles, profile]
    setProfiles(updatedProfiles)
    setActiveProfile(profile)
    saveCitizenProfiles(updatedProfiles)
    setAuthenticated(true)
    setCitizenView('profile')
    showNotice('Your citizen profile was saved.')
  }
  const logout = () => { setAuthenticated(false); setActiveProfile(null); setCitizenView('home') }
  const visibleReports = useMemo(() => reports.filter((report) => {
    const periodHours = filters.period === 'Today' ? 24 : filters.period === 'Last 7 days' ? 168 : 24
    return (filters.event === 'All events' || report.category === filters.event) && (filters.region === 'All India' || report.region === filters.region) && report.ageHours <= periodHours
  }), [filters])
  const nearbyAlerts = useMemo(() => location ? visibleReports.map((report) => ({ ...report, distance: distanceInKm(location, report) })).filter((report) => report.distance <= 10 && report.status !== 'Suspicious') : [], [location, visibleReports])

  if (!authenticated) return <CitizenLoginDatabase showRegistration={showRegistration} setShowRegistration={setShowRegistration} profiles={profiles} onLogin={completeLogin} onRegister={persistProfile} locationStatus={locationStatus} location={location} requestLocation={requestLocation} notice={notice} />

  return <div className={`citizen-shell ${nightMode ? 'citizen-night' : ''}`}><header className="citizen-header"><button className="citizen-logo" onClick={() => setCitizenView('home')}><span className="citizen-logo-mark"><CloudRain size={18} /></span>VAANKAN <small>CITIZEN</small></button><nav><button className={citizenView === 'home' ? 'active' : ''} onClick={() => setCitizenView('home')}><Home size={16} /> Home</button><button className={citizenView === 'alerts' ? 'active' : ''} onClick={() => setCitizenView('alerts')}><Bell size={16} /> Alerts {nearbyAlerts.length > 0 && <b>{nearbyAlerts.length}</b>}</button><button className={citizenView === 'profile' ? 'active' : ''} onClick={() => setCitizenView('profile')}><UserRound size={16} /> Profile</button></nav><div className="citizen-header-actions"><button className="citizen-icon-button" onClick={() => setNightMode(!nightMode)} aria-label="Toggle night mode">{nightMode ? <Sun size={17} /> : <Moon size={17} />}</button><button className="citizen-signout" onClick={logout}><LogOut size={15} /> Sign out</button></div></header><main className="citizen-main">{citizenView === 'home' ? <CitizenHome filters={filters} setFilters={setFilters} visibleReports={visibleReports} nearbyAlerts={nearbyAlerts} location={location} locationStatus={locationStatus} requestLocation={requestLocation} onAction={showNotice} /> : citizenView === 'alerts' ? <CitizenAlerts nearbyAlerts={nearbyAlerts} location={location} locationStatus={locationStatus} onAction={showNotice} /> : <CitizenProfileEditor key={`${activeProfile?.email}-${activeProfile?.latitude}-${activeProfile?.longitude}`} profile={activeProfile} onSave={persistProfile} requestLocation={requestLocation} />}</main>{notice && <div className="citizen-toast"><Check size={16} />{notice}</div>}</div>
}

function CitizenLoginDatabase({ showRegistration, setShowRegistration, profiles, onLogin, onRegister, locationStatus, location, requestLocation, notice }: { showRegistration: boolean; setShowRegistration: (value: boolean) => void; profiles: CitizenProfile[]; onLogin: (profile: CitizenProfile) => void; onRegister: (profile: CitizenProfile) => void; locationStatus: string; location: CitizenLocation | null; requestLocation: () => void; notice: string }) {
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({ name: '', phone: '', email: '', id: '', address: '', latitude: '', longitude: '' })
  const update = (key: keyof typeof form, value: string) => setForm({ ...form, [key]: value })
  const useLocation = () => requestLocation()
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage('')
    if (!password || !form.email) { setMessage('Email and password are required.'); return }
    if (showRegistration) {
      if (!form.name || !form.phone || !form.id || (!form.address && (!form.latitude || !form.longitude))) { setMessage('Add your personal details and either GPS location or a typed address.'); return }
      if (profiles.some((profile) => profile.email.toLowerCase() === form.email.toLowerCase())) { setMessage('An account with this email already exists.'); return }
      onRegister({ ...form, password, createdAt: new Date().toISOString() })
      return
    }
    const profile = profiles.find((item) => item.email.toLowerCase() === form.email.toLowerCase() && item.password === password)
    if (!profile) { setMessage('No matching citizen account found. Register first or check your password.'); return }
    onLogin(profile)
  }
  return <div className="citizen-login"><div className="citizen-login-art"><div className="citizen-logo"><span className="citizen-logo-mark"><CloudRain size={18} /></span>VAANKAN <small>CITIZEN</small></div><div><p className="eyebrow citizen-eyebrow">GROUND OBSERVATION NETWORK</p><h1>Weather intelligence, from where you stand.</h1><p>Receive verified local alerts and help your community see what is happening on the ground.</p></div><div className="citizen-login-foot"><span><span className="pulse" /> Local alerts within 10 km</span><span><Navigation size={14} /> GPS-assisted</span></div></div><div className="citizen-login-panel"><div className="citizen-login-card"><div className="citizen-login-top"><span className="eyebrow citizen-eyebrow">CITIZEN PORTAL</span><button className="citizen-icon-button" onClick={() => setShowRegistration(!showRegistration)} aria-label="Switch login mode"><UserPlus size={17} /></button></div><h2>{showRegistration ? 'Create your observer profile.' : 'Welcome back.'}</h2><p className="citizen-intro">{showRegistration ? 'Your details help us route relevant local alerts.' : 'Sign in to see weather intelligence around you.'}</p><div className="citizen-location-status"><LocateFixed size={15} /><span>{location ? `Location ready: ${location.label}` : locationStatus}</span><button type="button" onClick={useLocation}>Use GPS</button></div><form onSubmit={submit}>{showRegistration && <><label>Full name<input value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="Your name" /></label><div className="citizen-form-row"><label>Phone number<input value={form.phone} onChange={(event) => update('phone', event.target.value)} placeholder="+91" /></label><label>Government ID<input value={form.id} onChange={(event) => update('id', event.target.value)} placeholder="ID number" /></label></div><label>Address<input value={form.address} onChange={(event) => update('address', event.target.value)} placeholder="Type your address" /></label></>}<label>Email address<input type="email" value={form.email} onChange={(event) => update('email', event.target.value)} placeholder="you@example.com" /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" /></label>{showRegistration && <div className="citizen-form-row"><label>Latitude<input value={form.latitude || (location ? String(location.latitude) : '')} onChange={(event) => update('latitude', event.target.value)} placeholder="Editable GPS latitude" /></label><label>Longitude<input value={form.longitude || (location ? String(location.longitude) : '')} onChange={(event) => update('longitude', event.target.value)} placeholder="Editable GPS longitude" /></label></div>}<button className="citizen-submit" type="submit">{showRegistration ? 'Create account' : 'Sign in'} <ArrowUpRight size={15} /></button></form><button className="citizen-switch" onClick={() => setShowRegistration(!showRegistration)}>{showRegistration ? 'Already registered? Sign in' : 'New here? Create a citizen profile'}</button><small className="citizen-demo-note">Profiles are stored locally for this MVP. GPS permission is requested on every sign-in.</small>{(notice || message) && <div className="citizen-inline-notice">{notice || message}</div>}</div></div></div>
}

function CitizenProfileEditor({ profile, onSave, requestLocation }: { profile: CitizenProfile | null; onSave: (profile: CitizenProfile) => void; requestLocation: () => void }) {
  const [form, setForm] = useState<CitizenProfile | null>(profile)
  if (!form) return <div className="no-alerts"><h2>Profile unavailable.</h2><p>Sign out and register or sign in again.</p></div>
  const update = (key: keyof CitizenProfile, value: string) => setForm({ ...form, [key]: value })
  return <div className="citizen-page"><div className="citizen-welcome"><div><p className="eyebrow citizen-eyebrow">PERSONAL DETAILS</p><h1>Your observer profile.</h1><p>Keep your contact and location details current for relevant local alerts.</p></div></div><section className="profile-editor"><div className="profile-editor-heading"><div className="citizen-location-icon"><UserRound size={20} /></div><div><span className="citizen-card-label">SAVED LOCALLY</span><h2>Edit your details</h2></div></div><div className="profile-form-grid"><label>Full name<input value={form.name} onChange={(event) => update('name', event.target.value)} /></label><label>Phone number<input value={form.phone} onChange={(event) => update('phone', event.target.value)} /></label><label>Email address<input type="email" value={form.email} onChange={(event) => update('email', event.target.value)} /></label><label>Government ID<input value={form.id} onChange={(event) => update('id', event.target.value)} /></label><label className="profile-address">Address<input value={form.address} onChange={(event) => update('address', event.target.value)} placeholder="Type your address" /></label><div className="profile-location-block"><div className="profile-location-title"><span><LocateFixed size={15} /> GPS coordinates</span><button type="button" onClick={requestLocation}>Refresh GPS</button></div><div className="citizen-form-row"><label>Latitude<input value={form.latitude} onChange={(event) => update('latitude', event.target.value)} /></label><label>Longitude<input value={form.longitude} onChange={(event) => update('longitude', event.target.value)} /></label></div><small>Coordinates are editable if GPS is unavailable or inaccurate.</small></div></div><div className="profile-editor-actions"><span>Last saved locally from this browser</span><button className="citizen-submit" onClick={() => onSave(form)}>Save profile <Check size={15} /></button></div></section></div>
}

function CitizenHome({ filters, setFilters, visibleReports, nearbyAlerts, location, locationStatus, requestLocation, onAction }: { filters: Filters; setFilters: (value: Filters) => void; visibleReports: Report[]; nearbyAlerts: Array<Report & { distance: number }>; location: CitizenLocation | null; locationStatus: string; requestLocation: () => void; onAction: (message: string) => void }) {
  return <div className="citizen-page"><div className="citizen-welcome"><div><p className="eyebrow citizen-eyebrow">YOUR WEATHER VIEW</p><h1>Stay aware, stay ready.</h1><p>Local conditions and verified reports, shaped around your location.</p></div><div className={`local-alert-badge ${nearbyAlerts.length ? 'has-alert' : ''}`}><span className="alert-badge-icon"><Bell size={16} /></span><span><strong>{nearbyAlerts.length ? `${nearbyAlerts.length} nearby alert${nearbyAlerts.length > 1 ? 's' : ''}` : 'No nearby alerts'}</strong><small>{nearbyAlerts.length ? 'Within 10 km of you' : 'We will notify you if one appears'}</small></span></div></div><section className="citizen-location-card"><div className="citizen-location-icon"><LocateFixed size={20} /></div><div><span className="citizen-card-label">YOUR LOCATION</span><strong>{location ? location.label : 'Location not set'}</strong><small>{location ? 'GPS captured and editable from your profile' : locationStatus}</small></div><button onClick={requestLocation}>{location ? 'Refresh GPS' : 'Use my location'} <Navigation size={14} /></button></section><FilterControls filters={filters} setFilters={setFilters} /><section className="citizen-dashboard-grid"><div className="citizen-map-card"><div className="citizen-card-heading"><div><span className="citizen-card-label">LOCAL EVENT MAP</span><h2>What is happening around India</h2></div><span className="citizen-map-count">{visibleReports.length} signals</span></div><IndiaMap reports={visibleReports} userLocation={location} /></div><div className="area-analysis"><span className="citizen-card-label">AREA ANALYSIS</span><h2>{location ? 'Your local picture' : 'Set your location'}</h2><div className="analysis-score"><strong>{visibleReports.length ? Math.round(visibleReports.reduce((sum, report) => sum + report.intensity, 0) / visibleReports.length) : 0}</strong><span>/ 100<br />signal intensity</span></div><p>{nearbyAlerts.length ? 'Verified weather activity is close to your location. Keep alerts enabled.' : 'No verified disaster alert is currently within your 10 km notification radius.'}</p><div className="analysis-line"><span>Reports in selected window</span><strong>{visibleReports.reduce((sum, report) => sum + report.reports, 0)}</strong></div><div className="analysis-line"><span>Average confidence</span><strong>{visibleReports.length ? `${Math.round(visibleReports.reduce((sum, report) => sum + report.confidence, 0) / visibleReports.length)}%` : '0%'}</strong></div></div></section><section className="citizen-event-strip"><div><span className="citizen-card-label">FILTERED INTELLIGENCE</span><h2>Recent verified signals</h2></div><div className="citizen-mini-events">{visibleReports.slice(0, 3).map((report) => <div key={report.id}><span className={`citizen-event-dot ${report.status.toLowerCase()}`} /><span><strong>{report.title}</strong><small>{report.location} · {report.time}</small></span></div>)}</div><button onClick={() => onAction('Filtered citizen intelligence is current.')}>View all <ArrowUpRight size={14} /></button></section></div>
}

function CitizenAlerts({ nearbyAlerts, location, locationStatus, onAction }: { nearbyAlerts: Array<Report & { distance: number }>; location: CitizenLocation | null; locationStatus: string; onAction: (message: string) => void }) {
  return <div className="citizen-page"><div className="citizen-welcome"><div><p className="eyebrow citizen-eyebrow">ALERT CENTRE</p><h1>Local alerts.</h1><p>Only high-signal weather events within 10 km of your shared location appear here.</p></div></div>{!location && <section className="citizen-location-card"><div className="citizen-location-icon"><LocateFixed size={20} /></div><div><strong>Share your location to activate local alerts</strong><small>{locationStatus}</small></div><button onClick={() => onAction('Return to Home and use GPS to activate alerts.')}>Go to location <ArrowUpRight size={14} /></button></section>}<section className="alerts-list">{nearbyAlerts.length ? nearbyAlerts.map((alert) => <article className="citizen-alert-card" key={alert.id}><div className="alert-card-top"><span className="alert-severity">VERIFIED EVENT</span><span>{alert.distance.toFixed(1)} km away</span></div><h2>{alert.title}</h2><p>{alert.location} · {alert.time}</p><div className="alert-evidence"><span><ShieldCheck size={15} /> {alert.confidence}% confidence</span><span><UsersRound size={15} /> {alert.reports} ground reports</span></div><button onClick={() => onAction(`Opened details for ${alert.id}.`)}>View event evidence <ArrowUpRight size={14} /></button></article>) : <div className="no-alerts"><span><Bell size={22} /></span><h2>No disaster alerts nearby.</h2><p>We will show an alert here only when a verified event is detected within 10 km of your location.</p><button onClick={() => onAction('Location-based notifications are enabled for this session.')}>Notifications enabled</button></div>}</section></div>
}

function FilterControls({ filters, setFilters }: { filters: Filters; setFilters: (value: Filters) => void }) {
  const update = (key: keyof Filters, value: string) => setFilters({ ...filters, [key]: value })
  return <section className="filterbar"><div className="filter-title"><SlidersHorizontal size={16} /> View filters</div><label><span>Window</span><select value={filters.period} onChange={(event) => update('period', event.target.value)}><option>Last 24 hours</option><option>Today</option><option>Last 7 days</option></select></label><label><span>Event type</span><select value={filters.event} onChange={(event) => update('event', event.target.value)}><option>All events</option><option>Flooding</option><option>Rainfall</option><option>Thunderstorm</option><option>Heatwave</option><option>Fog</option><option>Dust storm</option><option>Strong winds</option></select></label><label><span>Region</span><select value={filters.region} onChange={(event) => update('region', event.target.value)}><option>All India</option><option>Tamil Nadu</option><option>Rajasthan</option><option>Puducherry</option><option>West Bengal</option><option>Kerala</option><option>Maharashtra</option><option>Punjab</option><option>Assam</option><option>Andhra Pradesh</option><option>Madhya Pradesh</option></select></label><label><span>Status</span><select value={filters.status} onChange={(event) => update('status', event.target.value)}><option>All statuses</option><option>Verified</option><option>Review</option><option>Suspicious</option></select></label><button className="filter-reset" onClick={() => setFilters({ period: 'Last 24 hours', event: 'All events', region: 'All India', status: 'All statuses' })}><RefreshCw size={14} /> Reset</button></section>
}

function IndiaMap({ reports: mapReports, userLocation }: { reports: Report[]; userLocation?: { latitude: number; longitude: number } | null }) {
  const mapElement = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!mapElement.current) return
    const map = L.map(mapElement.current, { zoomControl: false, attributionControl: true }).setView([22.5, 80.2], 4.5)
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(map)
    mapReports.forEach((report) => {
      const radius = 18000 + report.intensity * 430
      const color = report.status === 'Suspicious' ? '#e26b5d' : report.status === 'Review' ? '#c78c27' : '#2caeb7'
      L.circle([report.latitude, report.longitude], { radius, color, fillColor: color, fillOpacity: .13, weight: 1 }).addTo(map)
      L.circleMarker([report.latitude, report.longitude], { radius: 5 + report.intensity / 18, color, fillColor: color, fillOpacity: .9, weight: 2 }).bindPopup(`<strong>${report.title}</strong><br>${report.location}<br>Intensity: ${report.intensity}%`).addTo(map)
    })
    if (userLocation) {
      L.circleMarker([userLocation.latitude, userLocation.longitude], { radius: 8, color: '#f08a4b', fillColor: '#f08a4b', fillOpacity: 1, weight: 3 }).bindPopup('<strong>Your location</strong>').addTo(map)
    }
    return () => { map.remove() }
  }, [mapReports, userLocation])
  return <div className="real-map-wrap"><div ref={mapElement} className="real-map" /><div className="map-overlay-legend"><span><i className="legend-dot blue" /> Verified</span><span><i className="legend-dot amber" /> Review</span><span><i className="legend-dot coral" /> Suspicious</span><small>Circle size = intensity</small></div></div>
}

function DashboardEnhanced({ filters, setFilters, visibleReports, onAction }: { filters: Filters; setFilters: (value: Filters) => void; visibleReports: Report[]; onAction: (message: string) => void }) {
  const average = visibleReports.length ? Math.round(visibleReports.reduce((sum, report) => sum + report.confidence, 0) / visibleReports.length) : 0
  return <div className="page-wrap"><div className="page-heading"><div><p className="eyebrow">REAL-TIME WEATHER INTELLIGENCE</p><h1>Ground truth, at a glance.</h1><p className="subheading">A live view of verified weather events across the network.</p></div><button className="outline-button" onClick={() => onAction('Report intake is available from the Citizen Portal.')}><MapPin size={16} /> Submit observation</button></div><FilterControls filters={filters} setFilters={setFilters} /><section className="stat-grid"><Stat icon={Globe2} label="Events in view" value={String(visibleReports.length)} detail="Responding to filters" /><Stat icon={ShieldCheck} label="Verified confidence" value={`${average}%`} detail="Filtered event average" /><Stat icon={AlertTriangle} label="Needs review" value={String(visibleReports.filter((report) => report.status !== 'Verified').length)} detail="In current view" tone="coral" /><Stat icon={UsersRound} label="Ground observations" value={String(visibleReports.reduce((sum, report) => sum + report.reports, 0))} detail="Reports in current view" trend="up" /></section><section className="primary-grid"><div className="map-panel panel"><div className="panel-heading"><div><span className="section-kicker"><span className="live-dot" /> LIVE INDIA MAP</span><h2>Event intensity</h2></div><span className="metric-tag">{visibleReports.length} EVENTS</span></div><IndiaMap reports={visibleReports} /><div className="map-footer"><span><MapPin size={14} /> India / filtered view</span><span>Intensity overlay active</span></div></div><div className="signal-panel panel"><div className="panel-heading"><div><span className="section-kicker">NETWORK SIGNAL</span><h2>Report velocity</h2></div><span className="metric-tag">LIVE</span></div><div className="signal-value">{visibleReports.reduce((sum, report) => sum + report.reports, 0)} <small>reports in view</small></div><div className="bars">{[42, 55, 38, 62, 50, 76, 64, 88, 71, 92, 80, 96].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div><div className="signal-foot"><span><span className="trend-up">+18%</span> vs previous window</span><span>{filters.period}</span></div><div className="signal-divider" /><div className="mini-stat"><span><Database size={16} /> Sources connected</span><strong>14 / 16</strong></div><div className="progress"><i style={{ width: '87.5%' }} /></div><div className="mini-stat"><span><Gauge size={16} /> Processing health</span><strong>Good</strong></div></div></section><section className="lower-grid"><div className="events-panel panel"><div className="panel-heading"><div><span className="section-kicker">CONSOLIDATED EVENTS</span><h2>Recent intelligence</h2></div><span className="queue-count">{visibleReports.length}</span></div><div className="event-list">{visibleReports.length ? visibleReports.map((report) => <EventRow key={report.id} report={report} onAction={onAction} />) : <div className="empty-state">No events match the current filters.</div>}</div></div><div className="review-panel panel"><div className="panel-heading"><div><span className="section-kicker">ADMIN QUEUE</span><h2>Needs attention</h2></div><span className="queue-count">{visibleReports.filter((report) => report.status !== 'Verified').length}</span></div><div className="attention-item"><span className="priority-dot coral" /><div><strong>Recycled image detected</strong><small>Review suspicious source evidence</small></div><button onClick={() => onAction('Review opened for the selected event.')} aria-label="Review selected event"><ArrowUpRight size={15} /></button></div><button className="queue-button" onClick={() => onAction('Admin review queue opened.')}>Open review queue <ArrowUpRight size={14} /></button></div></section></div>
}

function ReviewQueueEnhanced({ filters, setFilters, visibleReports, onAction }: { filters: Filters; setFilters: (value: Filters) => void; visibleReports: Report[]; onAction: (message: string) => void }) {
  const [query, setQuery] = useState('')
  const searchedReports = visibleReports.filter((report) => `${report.id} ${report.location} ${report.source} ${report.title}`.toLowerCase().includes(query.toLowerCase()))
  return <div className="page-wrap"><div className="page-heading"><div><p className="eyebrow">ADMINISTRATION / VERIFICATION</p><h1>Review queue.</h1><p className="subheading">The same filters now narrow the evidence queue and map context.</p></div><div className="queue-summary"><strong>{searchedReports.length}</strong><span>events in view</span></div></div><FilterControls filters={filters} setFilters={setFilters} /><section className="review-toolbar"><div className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search event ID, location or source" /></div><span className="filter-result">{searchedReports.length} matching events</span></section><section className="review-table panel"><div className="table-header"><span>Event / location</span><span>Evidence signal</span><span>AI confidence</span><span>Received</span><span>Action</span></div>{searchedReports.length ? searchedReports.map((report, index) => <div className="table-row" key={report.id}><div className="event-cell"><span className={`event-icon ${report.tone}`}><CloudRain size={16} /></span><span><strong>{report.title}</strong><small>{report.id} · {report.location}</small></span></div><div className="evidence-cell"><span className="evidence-line"><i style={{ width: `${report.confidence}%` }} /></span><small>{report.source}</small></div><strong className={`confidence ${report.tone}`}>{report.confidence}%</strong><span className="muted-text">{report.time}</span><div className="row-actions">{index === 0 ? <button className="approve-button" onClick={() => onAction(`${report.id} marked as verified.`)}><Check size={14} /> Verify</button> : <button className="review-action" onClick={() => onAction(`Evidence drawer opened for ${report.id}.`)}>Inspect <ArrowUpRight size={14} /></button>}</div></div>) : <div className="empty-state">No review records match the current filters.</div>}</section></div>
}

function Dashboard({ period, setPeriod, eventFilter, setEventFilter, visibleReports, onAction }: { period: string; setPeriod: (value: string) => void; eventFilter: string; setEventFilter: (value: string) => void; visibleReports: Report[]; onAction: (message: string) => void }) {
  return <div className="page-wrap"><div className="page-heading"><div><p className="eyebrow">REAL-TIME WEATHER INTELLIGENCE</p><h1>Ground truth, at a glance.</h1><p className="subheading">A live view of verified weather events across the network.</p></div><button className="outline-button" onClick={() => onAction('Report intake is available from the Citizen Portal.')}> <MapPin size={16} /> Submit observation</button></div>
    <section className="filterbar"><div className="filter-title"><SlidersHorizontal size={16} /> View filters</div><label><span>Window</span><select value={period} onChange={(event) => setPeriod(event.target.value)}><option>Last 24 hours</option><option>Last 7 days</option><option>Today</option></select></label><label><span>Event type</span><select value={eventFilter} onChange={(event) => setEventFilter(event.target.value)}><option>All events</option><option>Flooding</option><option>Rainfall</option><option>Strong winds</option><option>Dust storm</option></select></label><label><span>Region</span><select defaultValue="All India"><option>All India</option><option>Tamil Nadu</option><option>Rajasthan</option><option>Puducherry</option></select></label><button className="filter-reset" onClick={() => { setPeriod('Last 24 hours'); setEventFilter('All events') }}><RefreshCw size={14} /> Reset</button></section>
    <section className="stat-grid"><Stat icon={Globe2} label="Active events" value="28" detail="+6 since yesterday" trend="up" /><Stat icon={ShieldCheck} label="Verified confidence" value="86.2%" detail="Across all reports" /><Stat icon={AlertTriangle} label="Needs review" value="12" detail="4 high priority" tone="coral" /><Stat icon={UsersRound} label="Ground observations" value="1,284" detail="+18.4% this week" trend="up" /></section>
    <section className="primary-grid"><div className="map-panel panel"><div className="panel-heading"><div><span className="section-kicker"><span className="live-dot" /> LIVE MAP</span><h2>Event activity</h2></div><button className="icon-button" onClick={() => onAction('Map layers are configured for the live geospatial service.')} aria-label="Map options"><MoreHorizontal size={19} /></button></div><div className="map-canvas"><div className="map-grid" /><div className="map-label label-north">NORTH INDIA</div><div className="map-label label-south">SOUTH INDIA</div><div className="map-route route-one" /><div className="map-route route-two" /><MapMarker className="marker-one" color="blue" label="18" /><MapMarker className="marker-two" color="coral" label="6" /><MapMarker className="marker-three" color="blue" label="11" /><MapMarker className="marker-four" color="amber" label="3" /><div className="map-legend"><span><i className="legend-dot blue" /> Verified</span><span><i className="legend-dot amber" /> Review</span><span><i className="legend-dot coral" /> Suspicious</span></div></div><div className="map-footer"><span><MapPin size={14} /> 28 events in view</span><button onClick={() => onAction('Map view expanded to full screen.')}>Expand map <ArrowUpRight size={14} /></button></div></div><div className="signal-panel panel"><div className="panel-heading"><div><span className="section-kicker">NETWORK SIGNAL</span><h2>Report velocity</h2></div><span className="metric-tag">LIVE</span></div><div className="signal-value">42 <small>reports / hr</small></div><div className="bars">{[42, 55, 38, 62, 50, 76, 64, 88, 71, 92, 80, 96].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div><div className="signal-foot"><span><span className="trend-up">+18%</span> vs previous window</span><span>12:00 — 14:00</span></div><div className="signal-divider" /><div className="mini-stat"><span><Database size={16} /> Sources connected</span><strong>14 / 16</strong></div><div className="progress"><i style={{ width: '87.5%' }} /></div><div className="mini-stat"><span><Gauge size={16} /> Processing health</span><strong>Good</strong></div></div></section>
    <section className="lower-grid"><div className="events-panel panel"><div className="panel-heading"><div><span className="section-kicker">CONSOLIDATED EVENTS</span><h2>Recent intelligence</h2></div><button className="text-button" onClick={() => onAction('Showing all consolidated events.')}>View all <ArrowUpRight size={14} /></button></div><div className="event-list">{visibleReports.length ? visibleReports.map((report) => <EventRow key={report.id} report={report} onAction={onAction} />) : <div className="empty-state">No events match this filter.</div>}</div></div><div className="review-panel panel"><div className="panel-heading"><div><span className="section-kicker">ADMIN QUEUE</span><h2>Needs attention</h2></div><span className="queue-count">12</span></div><div className="attention-item"><span className="priority-dot coral" /><div><strong>Recycled image detected</strong><small>WV-2026-0144 · Jodhpur</small></div><button onClick={() => onAction('Review opened for WV-2026-0144.')} aria-label="Review recycled image"><ArrowUpRight size={15} /></button></div><div className="attention-item"><span className="priority-dot amber" /><div><strong>Low location confidence</strong><small>WV-2026-0142 · Kozhikode</small></div><button onClick={() => onAction('Review opened for WV-2026-0142.')} aria-label="Review location confidence"><ArrowUpRight size={15} /></button></div><button className="queue-button" onClick={() => onAction('Admin review queue opened.')}>Open review queue <ArrowUpRight size={14} /></button></div></section>
  </div>
}

function ReviewQueue({ onAction }: { onAction: (message: string) => void }) {
  return <div className="page-wrap"><div className="page-heading"><div><p className="eyebrow">ADMINISTRATION / VERIFICATION</p><h1>Review queue.</h1><p className="subheading">Inspect the evidence behind AI decisions and keep the record accountable.</p></div><div className="queue-summary"><strong>12</strong><span>open reviews</span></div></div><section className="review-toolbar"><div className="search-field"><Search size={16} /><input placeholder="Search event ID, location or source" /></div><button className="outline-button"><Filter size={16} /> Filters <span className="filter-count">2</span></button><button className="icon-button" aria-label="More review options"><MoreHorizontal size={19} /></button></section><section className="review-table panel"><div className="table-header"><span>Event / location</span><span>Evidence signal</span><span>AI confidence</span><span>Received</span><span>Action</span></div>{reports.map((report, index) => <div className="table-row" key={report.id}><div className="event-cell"><span className={`event-icon ${report.tone}`}><CloudRain size={16} /></span><span><strong>{report.title}</strong><small>{report.id} · {report.location}</small></span></div><div className="evidence-cell"><span className="evidence-line"><i style={{ width: `${report.confidence}%` }} /></span><small>{report.source}</small></div><strong className={`confidence ${report.tone}`}>{report.confidence}%</strong><span className="muted-text">{report.time}</span><div className="row-actions">{index === 0 ? <button className="approve-button" onClick={() => onAction(`${report.id} marked as verified.`)}><Check size={14} /> Verify</button> : <button className="review-action" onClick={() => onAction(`Evidence drawer opened for ${report.id}.`)}>Inspect <ArrowUpRight size={14} /></button>}<button className="icon-button" onClick={() => onAction(`More actions for ${report.id}.`)} aria-label="More actions"><MoreHorizontal size={17} /></button></div></div>)}</section><div className="review-note"><ShieldCheck size={17} /><span>Every decision keeps its evidence trail, model version, and operator action for audit.</span><button onClick={() => onAction('Audit log is ready for the backend integration.')}>Audit log <ArrowUpRight size={14} /></button></div></div>
}

function Stat({ icon: Icon, label, value, detail, trend, tone }: { icon: typeof Globe2; label: string; value: string; detail: string; trend?: string; tone?: string }) { return <div className={`stat-card ${tone ?? ''}`}><div className="stat-icon"><Icon size={17} /></div><span className="stat-label">{label}</span><strong>{value}</strong><small>{trend && <span className="trend-up">{trend === 'up' ? '↑' : ''}</span>} {detail}</small></div> }
function MapMarker({ className, color, label }: { className: string; color: string; label: string }) { return <div className={`map-marker ${className} ${color}`}><span>{label}</span><i /></div> }
function EventRow({ report, onAction }: { report: Report; onAction: (message: string) => void }) { return <div className="event-row"><span className={`event-icon ${report.tone}`}><CloudRain size={16} /></span><div className="event-info"><strong>{report.title}</strong><small><MapPin size={12} /> {report.location}</small></div><div className="event-meta"><StatusPill status={report.status} /><small>{report.reports} reports · {report.time}</small></div><button className="row-arrow" onClick={() => onAction(`Opened intelligence record ${report.id}.`)} aria-label={`Open ${report.id}`}><ArrowUpRight size={16} /></button></div> }

void Dashboard
void ReviewQueue

export default App
