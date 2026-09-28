# VAANKAN Progress Report

**Status date:** 26 September 2026

## Current Services

### Frontend

- Vite development server URL: `http://localhost:5173` (start with `npm run dev`).
- Admin portal route: `/admin`.
- Admin login route: `/admin/login` (shared VAANKAN login layout; restrained red accent).
- Admin history route: `/admin/history`.
- Admin Data Source Intelligence route: `/admin/data-sources`.
- Analyst login route: `/analyst/login` (the same login component/layout, with a fixed Analyst portal identity).
- Analyst portal routes: `/analyst/dashboard` and `/analyst/analysis`; unauthenticated analyst paths route to login, and `/analyst` redirects to Dashboard after demo sign-in.
- Citizen portal route: `/citizen`.
- The URLs above are local run targets, not a claim that the servers are currently running.

### Backend Demo Slice

- FastAPI server: `http://127.0.0.1:8000`
- Health endpoint: `GET /health`
- OpenAPI documentation: `http://127.0.0.1:8000/docs`
- Storage defaults to deterministic in-memory demo mode; set `STORAGE_BACKEND=postgres` and `DATABASE_URL` to select SQLAlchemy/PostgreSQL.
- PostgreSQL mode routes report lifecycle, citizen registration/login, verification decisions, VISTA demo results, audit records, verified ground observations, VAYU events, and nearby-report queries through SQLAlchemy repositories.
- PostgreSQL/PostGIS is not currently running/configured in this workspace; the application was smoke-tested in memory mode.
- Kafka, MinIO, live external feeds, and trained ML models remain unconnected.
- Source-aware demo ingestion adapters are available at `GET /api/ingestion/sources` and `POST /api/ingestion/demo-preview`; live IMD/MOSDAC/OGD providers are explicitly `NOT_CONFIGURED`.
- Provider dispatch endpoint: `POST /api/notifications/dispatch` with SMTP email and optional Twilio SMS adapters.
- Dispatch reports provider outcomes (`sent`, `failed`, `not_configured`, or no recipients in range); an API response alone does not prove inbox delivery.

### Engine Dashboards

- VISTA Streamlit model lab: `streamlit_vista.py`, intended for port `8501`.
- VAYU Streamlit analytics lab: `streamlit_vayu.py`, intended for port `8502`.
- Both dashboards show model cards, demo metrics, dataset summaries, charts, event categories, and pipeline-readiness notes.
- All displayed metrics are explicitly marked synthetic/demo until actual datasets and training/evaluation pipelines are connected.
- Both dashboards were launched and returned HTTP 200 during smoke testing.

## Target Architecture

The feature roadmap uses one evidence-to-event flow:

```text
Meteorological feeds -----------------------------+
												  |
Citizen / social / web reports -> validation -> VISTA verification
												  |
								   verified ground observations
												  |
												  v
						  VAYU analysis + event correlation
												  |
				event detection -> lifecycle -> severity / impact
												  |
								 admin and citizen decision support
```

- VISTA is the trust and verification gateway for untrusted external reports. It should return an explainable evidence package, not only a status label.
- Only sufficiently supported, VISTA-verified reports should enter VAYU as normalized ground observations; raw citizen claims remain distinguishable from official meteorological measurements.
- VAYU combines meteorological observations and verified ground observations to detect, correlate, and update weather events. Correlation is part of VAYU, not a separate AI engine.
- One central weather-event record should join meteorological evidence, VISTA evidence, VAYU analysis, event lifecycle, provenance, and risk/impact data. Current API/demo event contracts cover only part of that target.
- The intended production path is React service layer -> FastAPI -> repository layer -> PostgreSQL/PostGIS. Admin report listing, decisions, history, and notification dispatch use service-layer API calls with a mock report-list fallback; opening a report uses the already-loaded item. Analyst Dashboard/Analysis share an API-first dataset service for `/api/vayu/events` and `/api/reports`, with VAYU mock fallback. Citizen weather/event data remain mock-backed. Backend memory mode remains the default, with PostgreSQL selectable by configuration.
- The in-memory demo now has a `WeatherEvent` contract and an admin-verification-triggered ground-observation handoff; automated VISTA verification and production persistence are not connected.
- Alerts and maps are decision support, not official warnings. Live status, freshness, model metrics, and source health must only be shown when backed by real connected services.

## Implemented Frontend

### Admin Portal

- Demo admin login.
- Intelligence dashboard with KPI cards, date/event/region/status filters, report velocity, source health, and processing health.
- Leaflet/OpenStreetMap map with event intensity circles, markers, and popups.
- Admin review queue with search, evidence signal, source, confidence, and received time.
- Alert detail page opened from dashboard events, attention notifications, and review records.
- Alert detail includes event metadata, coordinates, date/time, model-predicted status, map context, sample evidence records, and verification controls.
- Verification actions: `Verified`, `Review`, and `Suspicious`.
- The Admin report list, decision submission, and history call FastAPI through report/notification services when available; report details are selected from the loaded list, not fetched individually. The report list falls back to bundled mock records when the API is unavailable. API-provided confidence/intensity remain unassessed.
- Admin navigation is limited to Admin Panel and History; verification and audit controls remain in the Admin experience.
- Responsive navigation, night mode, sign-out, and feedback notifications.
- Admin shell and login use the shared VAANKAN geometry and typography with a scoped, restrained red accent; this theme does not apply to Citizen pages.
- Admin navigation also includes Data Source Intelligence. Source records, contribution, report-status counts, event coverage, and observed geographic coverage are computed from paginated Report API records. Source confidence, reliability history, duplicate metrics, freshness latency, and source/ingestion health remain `N/A` because those fields and telemetry are not connected. Citizen source identifiers are aggregated under a non-identifying Citizen reports label.
- Legacy dashboard source-health claims have been removed; connected-source count and ingestion health are not presented as measured values.

### Citizen Portal

- Citizen registration and login at `/citizen`.
- Registration collects personal/contact data and address; it does not request GPS.
- Continuous `watchPosition` GPS tracking starts after authentication and is cleared when the session ends.
- Current-location map, analysis, recent signals, and 10 km verified-alert radius.
- Google Maps-style current-location pin.
- Separate location search page that does not replace the live GPS view.
- Alert centre with portal, SMS, and email delivery states.
- Profile editing, browser `localStorage`, night mode, responsive layout, and sign-out.

### Analyst Portal

- Dedicated analyst login and shell at `/analyst/login`, `/analyst/dashboard`, and `/analyst/analysis`; the analyst sidebar contains only Dashboard and Analysis. Analyst sign-out returns to its login route.
- Analyst login reuses the same VAANKAN login component and layout as Admin, without a role switch. The Analyst shell uses the shared VAANKAN paper/white surfaces and typography with navy/cyan accents, plus a portal-scoped dark mode.
- Analyst access uses sessionStorage demo state and accepts any non-empty password; this is not persistent authentication or production RBAC.
- Dashboard and Analysis consume the same `getAnalystDataset()` service. It requests existing FastAPI VAYU events and reports first and falls back to the existing VAYU mock service on request failure. API data is labeled `API DEMO`, not live; mock fallback is labeled `MOCK FALLBACK`.
- Dashboard includes four primary KPIs, a weather situation overview, Leaflet event map, event-type bars, severity distribution, refresh timestamp, read-only event detail, and only Report Event/Analysis quick actions. Source breakdown and source-analysis widgets are excluded. Verification Rate uses report status counts; unavailable API event severity is shown as unassessed rather than a measured zero.
- Analysis is weather-focused with event/severity/state/start-date/end-date/search filters, filtered weather KPIs, event-type chart, daily time series, geographic distribution map, top-states view, severity chart, ranked cities, event-type comparison, read-only detail, and filtered CSV export. Source and verification analytics and the implicit Last 30 days limit are removed; the data service now requests the full available date range.
- Data Source Intelligence is the sole source-quality workspace. Its filterable/exportable registry and source contribution, verification, event coverage, observed report geography, and date-bucket history use Report API data only. The page reports unavailable API data without substituting mock source metrics. Source-health/confidence/duplicate/freshness metrics and reliability trends remain unmeasured and display `N/A`/insufficient data.
- Analyst event detail is read-only; administrative verification actions remain in Admin. Unsupported reports remain `UNSUPPORTED` and are not counted as suspicious. Event counts/charts use weather-event records; citizen report statuses are separately used for VISTA indicators.
- Detection accuracy and unavailable/model-derived confidence are shown as `N/A` or DEMO. Report source types are mapped from API report metadata; the current event API does not expose full event source provenance, and event map source is conservatively shown as Citizen for admin-reviewed ground-observation events. Forecast metrics remain unavailable until measured forecast/actual pairs exist.

## Implemented Backend Demo Slice

### Common Data Contract

`backend/schemas.py` validates normalized records with:

- record ID, source type/name, timestamp, text, language;
- latitude/longitude, city, district, and state;
- all seven required event categories;
- optional image/video URLs;
- `PENDING`, `VERIFIED`, `SUSPICIOUS`, and `UNSUPPORTED` statuses.

### FastAPI Endpoints

- `GET /health`
- `POST /api/auth/citizen/register`
- `POST /api/auth/citizen/login`
- `POST /api/reports`
- `GET /api/reports`
- `GET /api/reports/nearby` (latitude/longitude, radius in km, optional verification/event filters, bounded pagination)
- `GET /api/reports/{report_id}`
- `POST /api/vista/verify`
- `GET /api/vayu/analytics`
- `GET /api/vayu/ground-observations`
- `GET /api/vayu/events`
- `GET /api/system/health` (database/PostGIS readiness without exposing connection details)
- `GET /api/ingestion/sources`
- `POST /api/ingestion/demo-preview`
- `POST /api/admin/reports/{report_id}/decision`
- `POST /api/admin/reports/{report_id}/verify`
- `POST /api/admin/reports/{report_id}/review`
- `POST /api/admin/reports/{report_id}/suspicious`
- `GET /api/admin/audit-logs`

Admin decisions update the selected memory or PostgreSQL store and create an audit action containing the report ID, previous status, new status, reason, and timestamp. Passwords are hashed in the demo store/database; authentication remains a demo identity system.

### Optional Persistence Foundation

- `backend/models.py` defines UUID/timestamped tables for users/roles/profiles, reports/media/verification evidence, weather sources/stations/observations/events, ground observations, event links/clusters/timeline, alerts/notifications, model versions/metrics/predictions, and admin/audit actions. Several tables are schema groundwork and are not yet read/written by API workflows.
- Report, profile, station, observation, event, and ground-observation locations use SRID-4326 PostGIS points/geometries. Geometry and geography GiST indexes are defined to support exact meter-based queries.
- `backend/database.py` selects memory or PostgreSQL by `STORAGE_BACKEND`, creates a pooled engine with `pool_pre_ping`, and provides one synchronous SQLAlchemy session per request. Mutating routes commit before returning; the dependency rolls back failures and always closes the session.
- `backend/repositories.py` and `backend/services.py` implement paginated report/event access, report status and audit persistence, VISTA result persistence, verified-ground-observation handoff, event correlation, nearest station, and PostGIS radius query paths.
- `backend/migrations/versions/0002_ground_observations_and_profile_location.py` adds profile geometry, verified ground observations, and geography indexes. Offline SQL generation passes; it has not been applied to a live database here. The initial revision builds from current ORM metadata, so migration history should be frozen/reviewed before relying on repeatable production upgrades.
- `compose.yaml` defines separate local PostGIS development and test databases. Docker Compose config validation passes, but Docker Engine is stopped in this environment.
- PostgreSQL integration tests are gated on `TEST_DATABASE_URL` containing a database name with `test`; they were skipped because no isolated test PostGIS server is running.

### Source-Aware Ingestion Prototype

- `backend/ingestion/` defines a common adapter protocol (`fetch`, `normalize`, `validate`, `get_metadata`), a normalized preview-record schema with coordinate/physical-range validation, source class, provenance, quality flag, and content hash, plus deterministic IMD-shaped and citizen report fixtures.
- Authoritative/approved meteorological records bypass VISTA and route to VAYU as `TRUSTED_SOURCE`. Citizen/external reports route to VISTA review as `PENDING`; this does not claim automated verification.
- Exact content-hash duplicates in the preview are retained in the receipt with `EXACT_DUPLICATE` and a canonical record ID; the preview does not silently delete reports. Semantic, URL/source-ID, and perceptual-media deduplication are not implemented.
- Preview output records validation/normalization/exact-hash dedup/source-routing steps. It is stateless and DEMO-only; it does not persist records, call providers, run full meteorological quality/freshness checks, or publish Kafka messages.
- IMD, MOSDAC, and Government Open Data source entries are `NOT_CONFIGURED`; no live provider credentials or approved datasets are available in this workspace.

## Testing Completed

### Automated

- Backend API, email-provider, persistence metadata, PostGIS SQL compilation, memory-mode nearby, and source-aware ingestion tests: **24 passed, 1 skipped** with `pytest backend -q` (current verified run); the skipped test is the opt-in live PostgreSQL/PostGIS integration test.
- VISTA Streamlit dashboard: **HTTP 200** on port `8501`.
- VAYU Streamlit dashboard: **HTTP 200** on port `8502`.
- Tests cover health, normalized report lifecycle, validation, registration/login, admin decision aliases, audit records, VISTA/VAYU demo contracts, source-class routing, and exact duplicate canonical linkage. Live persistence/restart/PostGIS tests remain gated and were not run.
- React TypeScript/Vite production build and ESLint: **passed** after Admin Data Source Intelligence and weather-only Analyst updates.
- Current portal validation: all seven direct routes (`/admin/login`, `/admin`, `/admin/history`, `/analyst/login`, `/analyst/dashboard`, `/analyst/analysis`, `/citizen`) returned HTTP 200 from Vite; interactive demo Analyst sign-in reached `/analyst/dashboard` successfully.
- Vite reported a non-blocking large JavaScript chunk warning; the production build completed successfully.
- Python backend imports and model metadata checks: **passed**.
- Alembic offline SQL generation: **passed** through `0002_ground_observations`; live upgrade/current revision remains unverified.
- `docker compose config --quiet`: **passed**.

### Live Smoke Tests

- Vite root responded with HTTP 200.
- `/admin/login`, `/admin`, `/admin/history`, `/admin/data-sources`, `/analyst/login`, `/analyst/dashboard`, `/analyst/analysis`, and `/citizen` each returned HTTP 200 in SPA route smoke checks. Interactive Analyst login reached Dashboard; Admin navigation opened Data Source Intelligence.
- Browser verification showed the Report API unavailable from the current workspace session. Analyst correctly used its labeled mock fallback; Data Source Intelligence showed unavailable/`N/A` values and did not substitute synthetic source metrics. Recheck populated source analytics with the backend running; current FastAPI CORS middleware allows the active development origin.
- FastAPI `/health` responded with HTTP 200.
- FastAPI `/api/reports` responded with HTTP 200 and returned the normalized sample report.
- `/api/ingestion/demo-preview` was covered by tests for meteorological-to-VAYU routing, external-report-to-VISTA routing, unavailable provider labels, and exact duplicate canonical linkage.
- Updated FastAPI memory-mode HTTP smoke: report create/list/detail, nearby query, admin verification, VAYU ground-observation, and audit endpoints all passed.
- Temporary FastAPI smoke-test process was stopped after validation.

## Roadmap Status

### Present in the demo

- Separate Admin, Analyst, and Citizen portal route shells are implemented. Admin contains Admin Panel, History, and Data Source Intelligence; Analyst contains only Dashboard/Analysis; Citizen remains on its existing route/component.
- FastAPI defaults to the in-memory report lifecycle but now supports PostgreSQL mode through the same report/admin/VAYU route contracts; demo VISTA/VAYU behavior and optional SMTP/Twilio providers remain.
- A source-aware, deterministic ingestion preview now demonstrates adapter normalization, physical/geographic schema validation, source-class routing, and exact-hash duplicate provenance. It is not a live or persistent ingestion pipeline.
- `POST /api/reports`, `GET /api/reports`, and `GET /api/reports/{report_id}` use repositories in PostgreSQL mode; report listing is bounded/paginated. `GET /api/reports/nearby` uses PostGIS geography `ST_DWithin` and `ST_Distance` in PostgreSQL mode and the existing haversine helper in memory mode. PostgreSQL execution has not been verified against a live server.
- Admin decisions persist status, a verification result/evidence record, audit/admin actions, ground-observation changes, and updated VAYU demo event correlation in one request transaction in PostgreSQL mode.
- VISTA demo results are persisted when the referenced report exists; their score remains explicitly illustrative and the decision stays `PENDING`.
- Admin UI report list/detail/decision/history calls now use `src/services/reportService.ts`; notification dispatch uses `src/services/notificationService.ts`. Only the Admin list/detail/decision/history slices are API wired; other Admin/Citizen weather surfaces remain mock/local-storage based. API report confidence/intensity remain unassessed; the bundled Admin list is used when the API is unavailable.
- Explicit admin verification now creates a normalized `ADMIN_REVIEW` ground observation. Reopening a report for review or changing it to another status removes that observation; automated VISTA verification is not connected.
- The VAYU demo event engine groups verified observations of the same event type and district/state within 10 km. It returns event membership, location centroid, timestamps, and verified media/report counts.
- A dedicated Analysis tab displays this handoff and event grouping. It prefers the FastAPI endpoints and uses clearly labeled mock fallback data when the backend is unreachable.
- Meteorological measurements, verification confidence, event confidence, anomaly scores, and severity scores are left null/unassessed; this slice does not invent model results.
- Analyst Dashboard/Analysis use one shared API-first VAYU/report data service with labeled mock fallback. Analysis includes functional date/state/event/severity/search filtering and CSV export over the loaded records. Live radar/satellite imagery, meteorological overlays, playback animation, nowcast, official warning feeds, and population/infrastructure exposure data are not connected.
- Email dispatch can report provider outcomes, but that is not proof of inbox delivery. SMS requires valid Twilio configuration. Neither channel is described as operational until real-recipient delivery is verified.

### Planned implementation phases

1. **Contracts and React service layer:** Admin report list/decision/history and notification dispatch are behind `reportService` and `notificationService`; Analyst Dashboard/Analysis share an API-first VAYU event/report service with mock fallback. The report service defines create/detail/nearby methods, but Citizen report submission and those operations are not yet connected to UI workflows; the remaining auth/weather/VISTA/event/analytics/system services also need integration.
2. **Persistence and spatial queries:** PostgreSQL mode now routes the core report, auth, decision, audit, VISTA result, verified observation, and VAYU event paths through repositories; PostGIS nearby reports/profiles and event clustering are implemented in code. Still start/configure PostgreSQL/PostGIS, apply and inspect migrations, run the gated integration workflow, and test district containment/intersection/boundary queries. Consider MinIO/S3 for validated media storage.
3. **VISTA verification and evidence explorer:** build validation, media handling, language/text analysis, duplicate checks, location/time/weather consistency, spatial corroboration, and evidence fusion. Return explainable evidence for text, location, time, media, weather, and corroboration, with supporting reports, station matches, duplicate candidates, sources, and traceable verification results.

## Remaining limitations

- Real IMD, OpenWeather, MOSDAC, radar, satellite, and social-source feeds remain intentionally disconnected unless a real provider is configured and audited.
- Open-Meteo is treated as a meteorological model/data provider and not as universal ground truth or an official warning source.
- VAYU candidate generation is deterministic and evidence-based; it does not claim trained ML accuracy or operational forecasting skill.
- Admin and Analyst dashboards remain decision-support surfaces and do not present authoritative official alerts.
- PostgreSQL/PostGIS execution remains environment-dependent and must be configured with credentials before production reliability claims are made.
- Live SMS/email dispatch remains provider-gated and is only described as configured when the relevant credentials are actually active.
4. **Verified observation handoff and VAYU event engine:** an initial demo slice now normalizes only admin-verified reports into ground observations and groups nearby same-type observations into VAYU events. Still implement actual VISTA evidence gating/confidence, meteorological analysis (rainfall accumulation, temperature/feels-like, humidity, wind/gust/direction, pressure, cloud cover, visibility, dew point, and historical normals), anomaly features, calibrated event detection, lifecycle transitions, trajectory, severity, and event timeline.
5. **National and regional intelligence experience:** separate Analyst Dashboard and Analysis routes with shared mock-backed data, requested filterable analytics, and read-only event detail are implemented. Still connect API-backed analyst data, official meteorological layers, sourced regional drilldown, and real forecast/observation pairs. Forecast comparison remains `DEMO / NOT CONNECTED`.
6. **Explainability, citizen intelligence, and decision support:** add dedicated ground-report trends and verification breakdowns, VISTA-to-VAYU correlation views, evidence-based severity explanations, and risk/exposure summaries with clear data limits. Expand review outcomes to verified, suspicious, unsupported, and needs-more-evidence, recording admin, timestamp, prior/new status, reason, notes, and audit history. Clearly distinguish citizen ground observations from meteorological measurements and label outputs as decision support, not official warnings.
7. **Operational data and live system health:** the adapter protocol and deterministic meteorological/citizen fixtures are implemented. Still integrate approved real weather, radar, satellite, public, citizen, social, and web sources as available, marking disconnected layers `DEMO DATA / NOT LIVE`; persist provenance/quality/freshness, add ingestion and processing telemetry, and configure Kafka/WebSockets only when providers and infrastructure are available.
8. **Model labs, demo scenario, and security:** connect reproducible datasets and evaluation to VISTA/VAYU labs; show precision/recall/F1 and weather-error metrics only after measured evaluation. Add a controlled Chennai-flood walkthrough across ingestion, verification, VAYU correlation, event severity, risk analysis, and notification. Before production, add RBAC, secure password/token handling, rate limiting, GPS consent, PII minimization, retention, secure media validation/storage, privacy controls, and end-to-end tests.

### Explicitly not production-ready

- Live PostgreSQL/PostGIS is not running/configured in this workspace. The runtime/repository/migration/Compose code exists, but migration application, database persistence across a real process restart, and actual PostGIS execution remain unverified. The ingestion preview is not connected to persistence or queueing. IMD/MOSDAC/OGD providers, Kafka, MinIO/S3, PySpark, social/news collectors, live radar/satellite, WebSockets, and live map playback are also not connected.
- There are no trained VISTA/VAYU models or production evaluation metrics. The current correlation is deterministic demo grouping by event type, administrative area, and 10 km proximity, not a trained model. Proposed XLM-R/IndicBERT, Sentence-BERT, CLIP/ViT, FAISS, DBSCAN, XGBoost, Isolation Forest, LSTM, and SHAP components remain options for later, evaluated work, not current dependencies or capabilities.
- Persistent production authentication/RBAC, consent and retention controls, production audit operations, Citizen-to-FastAPI weather/report integration, API-backed Analyst PostgreSQL analytics, event-level source provenance in the API, and verified real-recipient email/SMS delivery remain outstanding.
