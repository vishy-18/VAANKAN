# VAANKAN Progress Report

**Status date:** 26 September 2026

## Current Services

### Frontend

- Vite development server URL: `http://localhost:5173` (start with `npm run dev`).
- Admin portal route: `/admin`.
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
- One central weather-event record should join meteorological evidence, VISTA evidence, VAYU analysis, event lifecycle, provenance, and risk/impact data. This is the target contract, not yet the current in-memory/API schema.
- The intended production path is React service layer -> FastAPI -> repository layer -> PostgreSQL/PostGIS. Admin report list/detail/decision/history now use services with API-first/mock-offline behavior; other frontend views continue to use mock data. Backend memory mode remains the default, with PostgreSQL selectable by configuration.
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
- Responsive navigation, night mode, sign-out, and feedback notifications.

### Citizen Portal

- Citizen registration and login at `/citizen`.
- Registration collects personal/contact data and address; it does not request GPS.
- Continuous `watchPosition` GPS tracking starts after authentication and is cleared when the session ends.
- Current-location map, analysis, recent signals, and 10 km verified-alert radius.
- Google Maps-style current-location pin.
- Separate location search page that does not replace the live GPS view.
- Alert centre with portal, SMS, and email delivery states.
- Profile editing, browser `localStorage`, night mode, responsive layout, and sign-out.

### Analysis Dashboard

- Eight top-level groups with nested views: National Situation, Weather Events, VAYU Intelligence, VISTA Intelligence, Forecast, Historical / Climate, Warning & Risk, and Data Quality.
- National Situation uses an interactive Leaflet event map with togglable event and demo-observation layers, event detail selection, and a past-only cutoff over timestamps present in the selected dataset.
- VISTA Intelligence includes citizen ground-report status/type/region summaries and the verified-ground-evidence handoff view. Warning Center labels high-severity entries as VAANKAN demo detections, not official warnings.
- Risk & Impact shows only existing demo event radius/report counts and states that population/infrastructure exposure is not connected. Data Quality summarizes sample observation flags, not national source health.
- Forecast vs Actual displays `DEMO / NOT CONNECTED`; fabricated accuracy/variation values were removed. MAE/RMSE/Bias remain unavailable until aligned forecast/observation pairs exist.
- Includes event tables, distributions, severity/location summaries, and event detail inspection. Data remains mock/demo where no API source is configured.
- Ground Evidence Pipeline reads verified observations and correlated events from FastAPI when available and falls back to grouped mock citizen reports when the API is unavailable.
- Filters and analytic visuals operate on the current mock service/data layer; forecast, historical baselines, and model capability figures are illustrative and are not trained-model performance claims.
- The UI architecture remains frontend → mock data/service → complete interface, with real API, data, and ML integration as future work.

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

- `backend/models.py` defines UUID/timestamped tables for users/roles/profiles, reports/media/verification evidence, weather sources/stations/observations/events, ground observations, event links/clusters/timeline, alerts/notifications, model versions/metrics/predictions, and admin/audit actions.
- Report, profile, station, observation, event, and ground-observation locations use SRID-4326 PostGIS points/geometries. Geometry and geography GiST indexes are defined to support exact meter-based queries.
- `backend/database.py` selects memory or PostgreSQL by `STORAGE_BACKEND`, creates a pooled engine with `pool_pre_ping`, and provides one synchronous SQLAlchemy session per request. Mutating routes commit before returning; the dependency rolls back failures and always closes the session.
- `backend/repositories.py` and `backend/services.py` implement paginated report/event access, report status and audit persistence, VISTA result persistence, verified-ground-observation handoff, event correlation, nearest station, and PostGIS radius query paths.
- `backend/migrations/versions/0002_ground_observations_and_profile_location.py` is a forward-compatible migration for profile geometry, verified ground observations, and geography indexes. Offline SQL generation passes; it has not been applied to a live database here.
- `compose.yaml` defines separate local PostGIS development and test databases. Docker Compose config validation passes, but Docker Engine is stopped in this environment.
- PostgreSQL integration tests are gated on `TEST_DATABASE_URL` containing a database name with `test`; they were skipped because no isolated test PostGIS server is running.

### Source-Aware Ingestion Prototype

- `backend/ingestion/` defines a common adapter protocol (`fetch`, `normalize`, `validate`, `get_metadata`), a normalized record schema with coordinate/physical-range validation, source class, provenance, quality flag, and content hash, plus deterministic IMD-shaped and citizen report fixtures.
- Authoritative/approved meteorological records bypass VISTA and route to VAYU as `TRUSTED_SOURCE`. Citizen/external reports route to VISTA review as `PENDING`; this does not claim automated verification.
- Exact content duplicates are retained in the ingestion receipt with `EXACT_DUPLICATE` and a canonical record ID; the demo preview does not silently delete reports.
- Preview output records the validation/normalization/dedup/source-routing steps. It is stateless and DEMO-only; it does not persist records, call providers, or publish Kafka messages.
- IMD, MOSDAC, and Government Open Data source entries are `NOT_CONFIGURED`; no live provider credentials or approved datasets are available in this workspace.

## Testing Completed

### Automated

- Backend API, email-provider, persistence metadata, PostGIS SQL compilation, memory-mode nearby, and source-aware ingestion tests: **24 passed, 1 skipped** with `pytest backend -q`; the skipped test is the opt-in live PostgreSQL/PostGIS integration test.
- VISTA Streamlit dashboard: **HTTP 200** on port `8501`.
- VAYU Streamlit dashboard: **HTTP 200** on port `8502`.
- Tests cover health, normalized report lifecycle, validation, registration/login, admin decision aliases, audit records, VISTA contract, and VAYU contract.
- React TypeScript/Vite production build: **passed** on 26 September 2026 after grouped Analysis navigation and intelligence views.
- ESLint: **passed** on 26 September 2026 after grouped Analysis navigation and intelligence views.
- Vite reported a non-blocking large JavaScript chunk warning; the production build completed successfully.
- Python backend imports and model metadata checks: **passed**.
- Alembic offline SQL generation: **passed** through `0002_ground_observations`; live upgrade/current revision remains unverified.
- `docker compose config --quiet`: **passed**.

### Live Smoke Tests

- Vite root responded with HTTP 200.
- FastAPI `/health` responded with HTTP 200.
- FastAPI `/api/reports` responded with HTTP 200 and returned the normalized sample report.
- `/api/ingestion/demo-preview` was covered by tests for meteorological-to-VAYU routing, external-report-to-VISTA routing, unavailable provider labels, and exact duplicate canonical linkage.
- Updated FastAPI memory-mode HTTP smoke: report create/list/detail, nearby query, admin verification, VAYU ground-observation, and audit endpoints all passed.
- Temporary FastAPI smoke-test process was stopped after validation.

## Roadmap Status

### Present in the demo

- React admin and citizen portals, mock-data Analysis sections, basic Leaflet event visualization, and the two Streamlit VISTA/VAYU demo labs are implemented.
- FastAPI defaults to the in-memory report lifecycle but now supports PostgreSQL mode through the same report/admin/VAYU route contracts; demo VISTA/VAYU behavior and optional SMTP/Twilio providers remain.
- A source-aware, deterministic ingestion preview now demonstrates adapter normalization, physical/geographic schema validation, source-class routing, and exact-hash duplicate provenance. It is not a live or persistent ingestion pipeline.
- `POST /api/reports`, `GET /api/reports`, and `GET /api/reports/{report_id}` use repositories in PostgreSQL mode; report listing is bounded/paginated. `GET /api/reports/nearby` uses PostGIS geography `ST_DWithin` and `ST_Distance` in PostgreSQL mode and the existing haversine helper in memory mode.
- Admin decisions persist status, a verification result/evidence record, audit/admin actions, ground-observation changes, and updated VAYU demo event correlation in one request transaction in PostgreSQL mode.
- VISTA demo results are persisted when the referenced report exists; their score remains explicitly illustrative and the decision stays `PENDING`.
- Admin UI report list/detail/decision/history calls now use `src/services/reportService.ts`; notification dispatch uses `src/services/notificationService.ts`. API report confidence/intensity remain unassessed in the UI; the prior mock list is used when the API is unavailable.
- Explicit admin verification now creates a normalized `ADMIN_REVIEW` ground observation. Reopening a report for review or changing it to another status removes that observation; automated VISTA verification is not connected.
- The VAYU demo event engine groups verified observations of the same event type and district/state within 10 km. It returns event membership, location centroid, timestamps, and verified media/report counts.
- A dedicated Analysis tab displays this handoff and event grouping. It prefers the FastAPI endpoints and uses clearly labeled mock fallback data when the backend is unreachable.
- Meteorological measurements, verification confidence, event confidence, anomaly scores, and severity scores are left null/unassessed; this slice does not invent model results.
- The Analysis page has grouped navigation, Leaflet event/observation layers, and a past-only dataset timestamp cutoff. Live radar/satellite imagery, meteorological overlays, playback animation, nowcast, official warning feeds, and population/infrastructure exposure data are not connected.
- Email dispatch can report provider outcomes, but that is not proof of inbox delivery. SMS requires valid Twilio configuration. Neither channel is described as operational until real-recipient delivery is verified.

### Planned implementation phases

1. **Contracts and React service layer:** report list/detail/decision/history and notification dispatch are behind `reportService` and `notificationService`; Admin list falls back to mock records when FastAPI is unavailable. Citizen report submission and the remaining auth/weather/VISTA/VAYU/event/analytics/system services still need integration.
2. **Persistence and spatial queries:** PostgreSQL mode now routes the core report, auth, decision, audit, VISTA result, verified observation, and VAYU event paths through repositories; PostGIS nearby reports/profiles and event clustering are implemented in code. Still start/configure PostgreSQL/PostGIS, apply and inspect migrations, run the gated integration workflow, and test district containment/intersection/boundary queries. Consider MinIO/S3 for validated media storage.
3. **VISTA verification and evidence explorer:** build validation, media handling, language/text analysis, duplicate checks, location/time/weather consistency, spatial corroboration, and evidence fusion. Return explainable evidence for text, location, time, media, weather, and corroboration, with supporting reports, station matches, duplicate candidates, sources, and traceable verification results.
4. **Verified observation handoff and VAYU event engine:** an initial demo slice now normalizes only admin-verified reports into ground observations and groups nearby same-type observations into VAYU events. Still implement actual VISTA evidence gating/confidence, meteorological analysis (rainfall accumulation, temperature/feels-like, humidity, wind/gust/direction, pressure, cloud cover, visibility, dew point, and historical normals), anomaly features, calibrated event detection, lifecycle transitions, trajectory, severity, and event timeline.
5. **National and regional intelligence experience:** grouped Analysis navigation, national Leaflet event/observation layers, and a past-only dataset cutoff are implemented. Still add connected meteorological layers, actual playback frames, sourced India -> state -> district -> city -> event drilldown, and live data. Forecast comparison stays `DEMO / NOT CONNECTED` until real forecast/observation pairs exist.
6. **Explainability, citizen intelligence, and decision support:** add dedicated ground-report trends and verification breakdowns, VISTA-to-VAYU correlation views, evidence-based severity explanations, and risk/exposure summaries with clear data limits. Expand review outcomes to verified, suspicious, unsupported, and needs-more-evidence, recording admin, timestamp, prior/new status, reason, notes, and audit history. Clearly distinguish citizen ground observations from meteorological measurements and label outputs as decision support, not official warnings.
7. **Operational data and live system health:** the adapter protocol and deterministic meteorological/citizen fixtures are implemented. Still integrate approved real weather, radar, satellite, public, citizen, social, and web sources as available, marking disconnected layers `DEMO DATA / NOT LIVE`; persist provenance/quality/freshness, add ingestion and processing telemetry, and configure Kafka/WebSockets only when providers and infrastructure are available.
8. **Model labs, demo scenario, and security:** connect reproducible datasets and evaluation to VISTA/VAYU labs; show precision/recall/F1 and weather-error metrics only after measured evaluation. Add a controlled Chennai-flood walkthrough across ingestion, verification, VAYU correlation, event severity, risk analysis, and notification. Before production, add RBAC, secure password/token handling, rate limiting, GPS consent, PII minimization, retention, secure media validation/storage, privacy controls, and end-to-end tests.

### Explicitly not production-ready

- Live PostgreSQL/PostGIS is not running/configured in this workspace. The runtime/repository/migration/Compose code exists, but migration application, database persistence across a real process restart, and actual PostGIS execution remain unverified. IMD/MOSDAC/OGD providers, Kafka, MinIO/S3, PySpark, social/news collectors, live radar/satellite, WebSockets, and live map playback are also not connected.
- There are no trained VISTA/VAYU models or production evaluation metrics. The current correlation is deterministic demo grouping by event type, administrative area, and 10 km proximity, not a trained model. Proposed XLM-R/IndicBERT, Sentence-BERT, CLIP/ViT, FAISS, DBSCAN, XGBoost, Isolation Forest, LSTM, and SHAP components remain options for later, evaluated work, not current dependencies or capabilities.
- Persistent production authentication/RBAC, consent and retention controls, production audit operations, full React-to-FastAPI data integration, and verified real-recipient email/SMS delivery remain outstanding.
