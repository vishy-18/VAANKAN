# 🌦️ VAANKAN

### National Weather Big Data Analytics Platform for India

**VAANKAN** is a weather-intelligence platform that brings together meteorological observations, citizen reports, geospatial context, and accountable human review. It turns scattered signals into traceable, location-aware weather-event intelligence, and gives citizens a direct way to report conditions and receive relevant verified alerts.

> 🚀 **Prototype status:** This repository contains a working hackathon prototype that demonstrates the complete core workflow: **citizen report → database → Admin verification → verified ground observation → VAYU analysis**. It is powered by a PostgreSQL/PostGIS data layer, live Open-Meteo weather ingestion, three React portal experiences, and SMTP provider handoff. It is a strong foundation, not yet a production national warning system. Official/social feeds, trained verification models, production-grade identity, distributed streaming, and operational deployment are the planned next phases, and each is labeled clearly below.

---

## 📌 Executive Summary

India's weather information lives in many places: meteorological services, public datasets, web sources, and reports from people on the ground. Each differs in format, update cycle, trust level, location accuracy, and evidence quality. VAANKAN brings these together in one evidence-first system that normalizes signals, records provenance, supports human verification, correlates verified observations with weather measurements, and presents results through role-specific web portals.

The prototype is built around two complementary services:

- 🛡️ **VISTA — Verification Intelligence for Source Trust Assessment.** VISTA prepares and assesses incoming claims, tracks evidence, and supports human Admin decisions. It is a trust and review layer, not an official meteorological authority. *(No trained production VISTA classifier is included in this prototype.)*
- 🌬️ **VAYU — Weather Intelligence and Analytics Engine.** VAYU combines weather observations with verified ground observations to identify event candidates and provide explainable situational context. The current candidate path is deterministic/statistical, and calibrated ML severity and forecasting models are a planned enhancement.

PostgreSQL/PostGIS is the system of record. The Admin, Analyst, and Citizen portals all go through the FastAPI backend rather than querying the database directly. VAANKAN keeps a **report**, a **weather measurement**, a **verification decision**, an **event candidate**, and a **citizen alert** as distinct but linked records, so each carries its own level of trust.

---

## 🎯 Problem Statement and Objectives

The challenge is to design a scalable national weather big-data analytics platform that collects weather-related information from multiple internet sources (social platforms, public datasets, websites, APIs, and citizen reports). The platform should normalize metadata such as date/time, city/state, GPS, media, and event category; store it centrally; identify duplicate or misleading reports; categorize weather events; and give Admins monitoring and analytics with time, event, location, and verification filters.

VAANKAN answers this with six objectives:

1. 🔗 **Unify observations and reports.** Use consistent contracts for meteorological measurements and citizen/external claims while preserving source-specific provenance.
2. 🔍 **Make trust visible.** Keep unverified reports pending, attach supporting or contradicting evidence, record human decisions, and never present model scores as certainty.
3. 📍 **Treat location and time as first-class dimensions.** Use PostgreSQL/PostGIS for spatial queries, local alert radii, and event correlation.
4. 📝 **Build an auditable workflow.** Store state changes, reasons, operator identity, notification attempts, and activity history centrally.
5. 👥 **Serve distinct users.** Citizens get reporting and local awareness, Admins get review and governance, and Analysts get read-only event intelligence.
6. 📈 **Scale in phases.** Start with a modular API and PostgreSQL/PostGIS, then introduce queues, partitioning, object storage, and distributed processing as measured workload justifies them.

---

## ✨ Prototype Features

### 👤 Citizen Portal

- Backend-backed registration and sign-in endpoints.
- Weather-report submission with event type, description, incident location, time, severity, and optional evidence reference.
- PostgreSQL-backed report history scoped to the citizen.
- Browser GPS permission flow; coordinates are saved to the backend after permission, and new citizens are never assigned fabricated coordinates.
- Local event map, area analysis, location search, verified nearby alerts, profile editing, and a dedicated Activities view.
- Activities read persisted report and alert history from PostgreSQL.
- Clear validation messages on registration and sign-in (password minimum: eight characters).

### 🛠️ Admin Portal

- Report dashboard, review queue, evidence detail, verification decision form, submission history, source intelligence, and a unified database-record browser.
- Verification decisions and history persisted in PostgreSQL, with evidence and audit records.
- `VERIFIED` decisions create or refresh the verified ground-observation path, and VAYU consumes that database state automatically, with no separate manual submit step.
- Email is attempted only after verified decisions, and only for eligible profiles with saved locations within the configured 10 km radius. Provider outcomes are persisted in `notifications`.
- Database Records browser with table/row listing, pagination, redaction of sensitive-looking fields, and audited deletion for application tables (PostGIS/system tables are read-only).
- Admin login in the prototype is **demo-only** and will be replaced by production authentication and authorization.

### 📊 Analyst Portal

- Dashboard and event-analysis views powered by backend report, weather, and event data.
- Source/data mode and uncertainty shown openly rather than presenting uncalibrated forecasts.
- Read-only by design: Analysts never verify reports or modify the database.
- The legacy Admin Analysis module is being migrated to persisted APIs. Its mock fallbacks are already disabled, so it never shows invented event data as live intelligence.

### ⚙️ Backend and Data Capabilities

- FastAPI endpoints for health, citizen auth/profile, reports, citizen activities, Admin review/history, weather, event candidates, VISTA/VAYU contracts, email status/testing/dispatch, and source metadata.
- SQLAlchemy repositories/services, PostgreSQL/PostGIS persistence, Alembic migrations, and geospatial radius queries.
- Open-Meteo current and historical integrations with deterministic weather-candidate logic.
- Source-aware ingestion preview demonstrating normalization, validation, deduplication, and routing (preview fixtures, not a live IMD/social feed).
- SMTP configured through backend environment variables. A successful test means SMTP accepted the handoff; it does not by itself confirm inbox delivery.

---

## ✅ Problem-Statement Coverage

| Requirement | Prototype coverage | Next step for the national-scale target |
|---|---|---|
| Collect from internet weather sources | Open-Meteo current/historical adapters; source registry and status endpoints | Add authorized IMD, MOSDAC, public dataset, web/news, and other provider adapters with production scheduling and monitoring |
| Collect social posts using `#IMD` and relevant hashtags | Planned; not yet implemented | Obtain permitted API access; implement hashtag/query rules, platform terms, rate limits, deletion rules, privacy and abuse controls |
| Citizen reports with time, city/state, GPS, media, category | Citizen form/API, normalized report schema, optional evidence reference, PostgreSQL persistence | Secure media upload/object storage; stronger identity/consent; abuse-review hardening |
| Central database | PostgreSQL 16/PostGIS with SQLAlchemy and Alembic; canonical for active prototype flows | Managed production database, backups/PITR, high availability, retention, monitoring, tested restore |
| Big-data ingestion and processing | Modular FastAPI adapters and persistent weather observation tables at prototype scale | Add queues/streams as needed, workers, partitioning, object storage, backpressure, and load tests |
| Fake/misleading report detection | Schema/quality checks, deduplication preview, evidence capture, human Admin review | Labeled data, calibrated models, media analysis, reviewer feedback, bias/drift evaluation |
| Duplicate detection | Deterministic exact-hash deduplication in the ingestion preview | Persistent source-scoped idempotency keys and text/perceptual similarity at scale |
| Automatic event categorization | Controlled event taxonomy and deterministic mapping in API/UI contracts | Evaluate a multilingual text classifier on labeled Indian weather reports, with confidence and human correction |
| Required event classes | Rainfall, thunderstorm, flooding, heatwave, fog, dust storm, and strong winds in the contracts | Expand and consistently evaluate regional/cyclone/hail/lightning definitions |
| Date/event/location filters | Admin and Analyst filter controls; report endpoints accept filters; PostGIS proximity | Full parity across every view; pagination, load tests, shareable filter state |
| Verification-status tracking | `PENDING`, `VERIFIED`, `SUSPICIOUS`, `UNSUPPORTED` persisted with Admin decisions | Production RBAC, append-only audit controls, reviewer workflow, model/evidence lineage, retention |
| Real-time visualization and analytics | Interactive maps and dashboards; API polling; weather/event summaries | Add WebSocket/SSE or a stream processor once latency and availability requirements are defined |

> 🏆 **For judges:** VAANKAN demonstrates the end-to-end data model and the core human-in-the-loop workflow with real, working components. The social-media crawler, nationwide distributed data lake, and trained AI models are planned capabilities with clearly identified technical, access, data, and governance prerequisites.

---

## 🏗️ Architecture

```mermaid
flowchart LR
    subgraph Sources[Input Sources]
        Citizen[Citizen reports]
        Weather[Open-Meteo current and historical]
        Official[IMD / MOSDAC feeds - planned]
        Public[Public datasets - planned]
        Social[Web / social / #IMD - planned, API terms permitting]
    end

    subgraph Portals[React Portals]
        CP[Citizen: report, local view, alerts, history, activities]
        AP[Admin: review, verify, audit/history, database browser]
        AN[Analyst: read-only events and weather analysis]
    end

    subgraph API[FastAPI Backend]
        REST[REST routes + Pydantic validation]
        ING[Source adapters, normalization, quality, dedupe]
        VISTA[VISTA: evidence assessment + human review]
        VAYU[VAYU: deterministic weather/event analysis]
        NOTIFY[SMTP/SMS adapters + delivery audit]
    end

    subgraph Store[Canonical Persistence]
        DB[(PostgreSQL 16)]
        GIS[(PostGIS: reports, stations, events, observations)]
        OBJ[Object storage for media - planned]
    end

    Citizen --> CP
    Weather --> ING
    Official -. future .-> ING
    Public -. future .-> ING
    Social -. future .-> ING
    CP <--> REST
    AP <--> REST
    AN <--> REST
    REST --> ING
    ING --> DB
    ING --> GIS
    ING -. metadata .-> OBJ
    DB --> VISTA
    GIS --> VISTA
    VISTA <--> AP
    VISTA --> DB
    DB --> VAYU
    GIS --> VAYU
    VAYU --> DB
    DB --> AN
    VISTA --> NOTIFY
    NOTIFY --> DB
    NOTIFY --> SMTP[SMTP provider]
    NOTIFY -. optional .-> SMS[SMS / push provider]
```

### 🔄 End-to-End Workflow

```mermaid
sequenceDiagram
    actor Citizen
    participant Portal as Citizen Portal
    participant API as FastAPI
    participant DB as PostgreSQL/PostGIS
    actor Admin
    participant VISTA as VISTA/Admin Review
    participant Mail as SMTP
    participant VAYU as VAYU
    actor Analyst

    Citizen->>Portal: Submit weather report with time, category, location, evidence
    Portal->>API: POST /api/reports
    API->>API: Validate request, normalize, assign/validate citizen identity
    API->>DB: Insert report + provenance + media metadata
    API->>DB: Insert citizen_activities: REPORT_SUBMITTED
    DB-->>Portal: record_id and PENDING status
    Admin->>VISTA: Review report and supporting evidence
    VISTA->>API: Submit reasoned decision
    API->>DB: Persist status, result, evidence, Admin action and audit log
    alt Status is VERIFIED
        API->>DB: Upsert ground observation and correlate VAYU event
        API->>DB: Find consented citizen profiles within 10 km
        API->>Mail: Attempt email and capture provider result
        Mail-->>API: Provider result per recipient
        API->>DB: Persist notification outcome and citizen activities
    else Status is not VERIFIED
        API->>DB: Persist decision and skip verified-alert email
    end
    Analyst->>API: Query persisted reports, observations and event candidates
    API->>DB: Read canonical state
    DB-->>Analyst: Evidence-linked event and data-quality context
```

**Decision rule:** Citizen submission → `PENDING` → Admin/VISTA decision. Only `VERIFIED` reports produce verified ground observations for VAYU. VAYU reads database state directly, so no separate manual action is needed. A candidate event or model output is decision support, not an official warning.

---

## 🗄️ Data and Database Design

### Database Technology

- **PostgreSQL 16** is the durable relational source of truth.
- **PostGIS** stores and queries location-aware data in WGS84 (`EPSG:4326`) with spatial indexes. Geography-based distances are used for meter/radius calculations, including the 10 km alert radius.
- **SQLAlchemy** separates ORM models, repositories, and application services; **Alembic** versions schema changes.
- Typed columns hold fields used for joins, filtering, indexing, and constraints. JSON/JSONB holds variable source provenance and model/evidence details.
- Timestamps are timezone-aware UTC; the UI converts only for display.
- Internal primary keys are UUIDs; stable external identifiers include `record_id`, `event_id`, `observation_id`, and provider record IDs.
- Media bytes are designed to move to object storage, with PostgreSQL keeping metadata, ownership, checksum, and storage key.

### Prototype Entities

| Entity | Purpose |
|---|---|
| `users`, `roles`, `user_roles` | Accounts and role assignment. Production identity/RBAC is the next milestone; Admin/Analyst authentication is currently demo-only. |
| `citizen_profiles` | Contact/address, optional consented GPS point, and Government ID field. Raw Government ID is sensitive and will be minimized/tokenized/encrypted before production. |
| `reports` | Citizen/external report text, source, event category, UTC timestamp, location, status, and JSON provenance. Owner is currently carried in provenance/source metadata; a typed user FK is recommended. |
| `media` | Media metadata, object-storage key, MIME type, size, and hashes. Secure upload/object storage is planned. |
| `verification_results`, `verification_evidence` | Versioned VISTA/Admin assessments and supporting evidence explanations. |
| `admin_actions`, `audit_logs` | Human decision history, operator/reason, and audit context. Admin submission history is derived from persisted audit records. |
| `ground_observations` | Verified report representation that VAYU can consume, linked to the report and a spatial point. |
| `weather_sources`, `weather_stations`, `weather_observations` | Provider registry, station/location, normalized measurements, quality, provenance, and timing. Open-Meteo is the current active source. |
| `weather_events`, `event_reports`, `event_clusters`, `event_timeline` | VAYU event candidates/aggregates, supporting reports, spatial grouping, and event evolution. |
| `alerts`, `notifications` | Alert definitions and per-recipient/channel provider attempts and results. |
| `citizen_activities` | Durable citizen-facing activity stream: report submission, verified alert, and acknowledgement. |
| `model_versions`, `model_metrics`, `prediction_logs` | Model lineage, evaluation, and inference-audit framework, ready for future trained VISTA/VAYU models. |

### Data Integrity and Spatial Design

- Unique constraints cover user email, report IDs, event IDs, and source-scoped ingestion IDs.
- Foreign keys link reports to evidence, observations, events, alerts, and audit history.
- GiST spatial indexes support nearby queries for profiles, reports, stations, events, and ground observations.
- B-tree indexes support status/time/source/type/region queries, notification outcomes, and citizen activity timelines.
- Provider upserts use stable idempotency keys to avoid duplicates across retries.
- Alembic owns schema changes. Development resets are explicit and never remove PostGIS reference data or migration history.
- Production retention will be policy-based, since raw provider payloads, logs, and media may need different retention periods.

### 🧩 Database ER Model

```mermaid
erDiagram
    USERS ||--o| CITIZEN_PROFILES : has
    USERS }o--o{ ROLES : assigned
    USERS ||--o{ ADMIN_ACTIONS : performs
    USERS ||--o{ AUDIT_LOGS : acts
    USERS ||--o{ NOTIFICATIONS : receives
    USERS ||--o{ CITIZEN_ACTIVITIES : owns
    REPORTS ||--o{ MEDIA : includes
    REPORTS ||--o{ VERIFICATION_RESULTS : assessed_by
    VERIFICATION_RESULTS ||--o{ VERIFICATION_EVIDENCE : explains
    MODEL_VERSIONS ||--o{ VERIFICATION_RESULTS : versions
    MODEL_VERSIONS ||--o{ MODEL_METRICS : evaluated_by
    MODEL_VERSIONS ||--o{ PREDICTION_LOGS : emits
    REPORTS ||--o| GROUND_OBSERVATIONS : may_become
    REPORTS ||--o{ ADMIN_ACTIONS : reviewed_in
    WEATHER_SOURCES ||--o{ WEATHER_STATIONS : provides
    WEATHER_SOURCES ||--o{ WEATHER_OBSERVATIONS : provides
    WEATHER_STATIONS ||--o{ WEATHER_OBSERVATIONS : measures
    WEATHER_EVENTS ||--o{ EVENT_REPORTS : includes
    REPORTS ||--o{ EVENT_REPORTS : supports
    WEATHER_EVENTS ||--o{ EVENT_CLUSTERS : grouped_as
    WEATHER_EVENTS ||--o{ EVENT_TIMELINE : evolves
    WEATHER_EVENTS ||--o{ ALERTS : may_trigger
    ALERTS ||--o{ NOTIFICATIONS : dispatches
    REPORTS ||--o{ CITIZEN_ACTIVITIES : creates
```

---

## 🛡️ VISTA: Verification Intelligence

VISTA makes incoming claims reviewable and explainable. It complements the meteorological service and never automatically declares a public safety warning.

### VISTA Processing Stages

1. 📥 **Ingest:** accept a citizen report or supported external record with source/time/location/category/provenance.
2. 🧹 **Normalize:** map categories to a controlled taxonomy; normalize UTC timestamps, coordinate reference, and units; preserve original source values.
3. ✔️ **Validate:** check required fields, coordinate bounds, timestamps, media references, and provider/source metadata.
4. 🔁 **Deduplicate:** exact-hash deduplication in the demo preview; source-scoped IDs and text/perceptual similarity for near-duplicates next.
5. 🔎 **Retrieve evidence:** nearby weather measurements, verified ground observations, provider products, temporal/spatial corroboration, and provenance.
6. 🧮 **Assess:** deterministic checks and evidence contracts today; future ML can rank review priority with explanations and calibrated uncertainty.
7. 🧑‍⚖️ **Human decision:** the Admin verifies, requests review, marks suspicious, or marks unsupported, and records the reason.
8. 💾 **Persist:** assessment, evidence, action, and audit records are stored, and the report status is updated.
9. 🚦 **Gate:** only `VERIFIED` can create or update a verified ground observation for VAYU.

### Models and Methods

The prototype uses transparent, deterministic checks. The feasible model roadmap is:

- Start with transparent rules for location plausibility, time consistency, duplicate signals, source class, nearby weather agreement, and evidence completeness.
- Compare TF-IDF + Logistic Regression as an interpretable text baseline, adding a compact multilingual transformer if labeled data and compute are available.
- Use perceptual hashes and metadata consistency for media triage before considering image classification. Models require curated, consented, correctly labeled data.
- An optional backend-only language model may summarize stored evidence with references to evidence IDs. It never decides verification status and is not presented as a fact verifier.
- Store model version, evidence references, score/threshold, explanation, evaluation set, and reviewer outcome.
- Evaluate class precision/recall, false-positive rate, calibration, geography/language performance, and drift. Human review remains the decision gate.

---

## 🌬️ VAYU: Weather Intelligence and Analytics

VAYU turns time- and location-aligned weather measurements plus verified ground observations into traceable event candidates and Analyst context.

### Implemented Prototype

- Open-Meteo current and historical provider adapters.
- Weather observations persisted to PostgreSQL, including provider/source and location metadata.
- Deterministic event-candidate generation and a PostGIS-backed verified-ground-observation/event path.
- VAYU API routes for candidates, observations, ground observations, and event/analytics contracts.
- Severity and confidence shown as unassessed until a validated model exists.

### Proposed Analysis Methods and Models

- 📉 **Anomaly baseline:** seasonal quantiles or robust median/MAD by region and lead time, with the baseline period/source persisted.
- 🌳 **Event/severity model:** gradient-boosted trees such as XGBoost/LightGBM on tabular features, once quality-labeled historical events are available, with time- and region-separated evaluation sets.
- 🗺️ **Spatial grouping:** begin with PostGIS proximity and deterministic time windows; evaluate DBSCAN/HDBSCAN if measured cluster quality improves.
- 🔮 **Forecasting:** compare persistence/seasonal baselines before neural time-series models, and release forecasts or severity claims only with validation and uncertainty.
- Version feature definitions, thresholds, training-data references, evaluation metrics, and predictions.

VAYU outputs are decision support. Provider measurements, citizen reports, verified ground observations, and candidate events each keep their own provenance and trust label. A VAYU candidate is not an official warning.

---

## 📡 Input Sources and Trust Classes

| Source | Prototype status | Handling and future integration |
|---|---|---|
| Citizen report form | ✅ Implemented and stored through backend/PostgreSQL | Untrusted until reviewed; capture consent, source, UTC time, category, location, and impact. |
| Open-Meteo | ✅ Current/historical integration implemented | Record provider, fetched/valid time, units, freshness, and quality. |
| IMD | 🔜 Registry/architecture reference; live ingestion not yet configured | Integrate via permitted feeds/APIs; preserve product ID and distinguish official warnings from VAANKAN analysis. |
| MOSDAC / satellite | 🔜 Planned | Authorized products; preserve footprint, acquisition time, resolution, and product lineage. |
| Public datasets | 🧪 Demo ingestion shape exists | Add adapters per dataset with license, attribution, date range, and schema version. |
| Websites/news/RSS | 🔜 Planned | Use permitted feeds/APIs; store source link/publication time; deduplicate and moderate. |
| Social platforms / `#IMD` hashtags | 🔜 Planned | Requires platform-approved API access, terms/rate compliance, query policy, deletion handling, privacy, and abuse controls. |

An ingestion receipt records source ID/type, external record ID, ingestion/observation timestamps, coordinates, canonical category, payload checksum, schema version, quality flags, deduplication outcome, provenance, and processing status. Raw payload retention is access-controlled and policy-based.

---

## 🧭 Portals and User Workflows

### 👤 Citizen Portal

- Register and sign in against backend identity APIs; passwords are never stored in browser storage.
- Submit event type, description, event time, severity, location, impact, and optional evidence reference.
- See server-backed report history and persisted Activities (report submitted, verified alert, acknowledgement).
- Use browser GPS only after permission and save approved coordinates to the database, with no fabricated coordinates or default homes.
- See local reports and verified alerts, with explicit empty/loading/unavailable states.

### 🛠️ Admin Portal

- Monitor the database-backed report queue; inspect location, source, and evidence.
- Verify, request review, or mark reports suspicious/unsupported, with operator and reason.
- Inspect persistent submission history and per-recipient email attempts.
- Use the database browser for maintenance. Destructive operations are audited, and PostGIS/system tables are read-only.
- **Authentication is demo-only for now**; production will use server-enforced RBAC and privileged identity controls.

### 📊 Analyst Portal

- Read-only view of reports, observations, verified ground observations, and VAYU candidate data.
- Filter by time, event class, location, source, data quality, and verification status.
- Display source, freshness, uncertainty, and data mode, with no Admin decision mutations.
- The deep Analysis module is being migrated to live PostgreSQL-backed VAYU APIs; local fixture data is disabled in the meantime.

---

## 🌟 Technical Benefits and Expected Impact

### Technical Benefits

- 🗃️ **One canonical store:** reduces conflicting copies and supports repeatable portal views.
- 📍 **Spatial-first design:** PostGIS powers nearby queries and event correlation in the data layer.
- 🧵 **Evidence lineage:** report, verification, ground observation, event, notification, and audit are traceable by stable IDs.
- 🤝 **Human-in-the-loop trust:** uncertain or adversarial inputs stay reviewable instead of becoming automatic alerts.
- 🔌 **Provider abstraction:** adapters normalize provider-specific formats and make new integrations additive.
- 📈 **Incremental scale path:** PostgreSQL/PostGIS can add workers, object storage, queues, and partitioning as measured workload justifies.
- 🔎 **Operational transparency:** source status and SMTP outcomes are explicit. Configured is not the same as delivered, and a candidate is not an official warning.

### Expected Impact

- Give citizens a structured way to contribute localized observations.
- Help reviewers prioritize reports with nearby measurements and provenance in a single workspace.
- Help Analysts compare provider measurements with verified ground observations and spot evidence gaps.
- Enable relevant, opt-in, location-based notifications with recorded provider outcomes.
- Support post-event analysis through persisted event and decision history.

These are intended benefits that the pilot will measure: report-to-review time, verification precision/recall, duplicate reduction, location coverage, notification handoff success, and Analyst task completion, all against a documented baseline.

---

## 💡 Novelty: Differentiating Contributions

1. 🚦 **Verification-gated event intelligence:** citizen observations become VAYU inputs only after a persisted evidence review and human decision.
2. 🧬 **Two evidence streams, one geospatial model:** weather-provider measurements and human reports keep separate trust classes but correlate spatially and temporally in PostGIS.
3. 🔗 **Traceable event lifecycle:** report ID → VISTA/Admin decision → ground-observation ID → VAYU event → notification attempt, with audit records at key transitions.
4. 🔍 **Honest uncertainty and provenance:** provider, freshness, quality, and model status are explicit, and uncalibrated outputs stay labeled as unassessed.
5. 📬 **Notification outcome as data:** every recipient/channel attempt is persisted and diagnosable, instead of a generic "sent" flag.
6. 🎭 **Role-separated workflows:** citizen contribution, Admin adjudication, and Analyst interpretation each have distinct capabilities.
7. 🪜 **Scale without premature infrastructure:** start with PostgreSQL/PostGIS and adapters, and add queues and distributed processing when throughput measurements call for them.

These are design contributions and workflow differentiators rather than claims of a validated scientific discovery or a novel trained model.

---

## 🧪 Feasibility and Viability

### Feasibility

- The pilot uses proven open-source tools: FastAPI, React, PostgreSQL/PostGIS, SQLAlchemy/Alembic, Open-Meteo, Leaflet, and SMTP.
- The prototype already demonstrates report creation/history, Admin decision/audit, nearby spatial lookup, persisted activities, deterministic VAYU candidate contracts, and provider email testing.
- A credible pilot can start in one region with a small number of authorized sources, human-reviewed reports, and measured evaluation metrics.
- Social-media ingestion depends on platform access and terms, and ML depends on labeled, representative, consented data. Both are planned as the pilot secures those prerequisites.

### Viability and Scale Path

| Stage | Architecture | Exit criteria |
|---|---|---|
| 🧱 Hackathon prototype | FastAPI + PostgreSQL/PostGIS + synchronous adapters + three portals | End-to-end report/decision/audit/alert demonstrated; tests pass; source modes truthful |
| 🏙️ Regional pilot | Managed PostgreSQL, worker/outbox, S3-compatible evidence storage, RBAC, monitoring, authorized regional feeds | Load test, restore test, privacy/security review, labeled evaluation set |
| 🇮🇳 Multi-region service | Partitioning, queue/stream where justified, horizontal workers, cache/read replicas when needed, disaster recovery | SLOs, capacity plan, provider agreements, operational staffing, incident response |

At hackathon scale, a PostgreSQL outbox and background worker are sufficient. Kafka/Redis is a later option rather than a prerequisite, and scale claims will follow load tests and observed ingestion rates.

---

## 🚀 Run the Prototype Locally

### Prerequisites

- Windows 10/11 or another supported OS
- Node.js and npm
- Python 3.12+
- Docker Desktop using Linux containers for the included PostgreSQL/PostGIS service

### 🐘 Set Up PostgreSQL/PostGIS

Create a private `.env` from `.env.example` if one does not already exist. Set the following local-development values, keep `.env` out of Git, and use different credentials outside local development:

```dotenv
STORAGE_BACKEND=postgres
DATABASE_URL=postgresql+psycopg://vaankan:vaankan@localhost:5432/vaankan
VAANKAN_ADMIN_DATABASE_KEY=<strong-random-private-value>
```

Start the local database, install Python dependencies in the project virtual environment, and apply the Alembic migrations:

```powershell
docker compose up -d postgis
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m alembic current
```

### ▶️ Run Backend and Frontend

Run the backend in one terminal:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8001
```

Run the frontend in a second terminal:

```powershell
npm install
npm run dev
```

The Vite app calls FastAPI at `http://127.0.0.1:8001` by default. Confirm the backend at `/health`, `/api/system/health`, and `/docs` before testing portal workflows. In PostgreSQL mode, the app never silently falls back to in-memory writes if the database is unavailable.

### 🔗 Useful URLs

- Admin workspace: `http://localhost:5173/admin`
- Admin database records: `http://localhost:5173/admin/database`
- Citizen portal: `http://localhost:5173/citizen`
- Citizen report form: `http://localhost:5173/citizen/report`
- Analyst portal: `http://localhost:5173/analyst`
- FastAPI OpenAPI docs: `http://127.0.0.1:8001/docs`
- PostgreSQL/PostGIS readiness: `http://127.0.0.1:8001/api/system/health`

The database browser requires the backend `VAANKAN_ADMIN_DATABASE_KEY`, which is entered after Admin login and kept in page memory only. Admin and Analyst login are demo-only for now.

### 🧰 Build and Tests

```powershell
npm run build
npm run lint
.\.venv\Scripts\python.exe -m pytest backend -q
```

PostgreSQL integration tests use the separate `postgis-test` service on port `5433` and a test database name containing `test`. Never point destructive tests at the application database.

### 📁 Project Structure

```text
src/
    App.tsx                       Portal routing and shared React workflows
    services/                     Typed API clients
    pages/admin/                  Admin source, database and analysis views
    pages/analyst/                Analyst dashboard and read-only analysis
backend/
    main.py                       FastAPI endpoints and orchestration
    schemas.py                    Pydantic API contracts
    models.py                     SQLAlchemy/PostGIS schema
    repositories.py               Database queries and persistence
    services.py                   Application/use-case services
    ingestion/                    Normalization and source pipeline contracts
    sources/                      Open-Meteo and weather intelligence
    migrations/                   Alembic schema versions
```

---

## 🏁 Current Prototype: What Is Done

- ✅ React/TypeScript Citizen, Admin, and Analyst portal experiences.
- ✅ FastAPI REST API with citizen auth/profile, reports, citizen activities, Admin review/history, weather, VAYU contracts, SMTP status/test/dispatch, and source metadata.
- ✅ PostgreSQL/PostGIS schema, Alembic migrations, SQLAlchemy models/repositories/services, report ownership/history, Admin audit, verified ground observations, weather tables, notification outcomes, and activities.
- ✅ Open-Meteo current/historical integrations and deterministic weather candidate logic.
- ✅ SMTP configuration and test-email endpoint; verified decisions attempt mail for eligible saved profiles and record provider outcomes.
- ✅ Admin database records dashboard with table browsing, pagination, redaction, and guarded/audited application-row deletion.
- ✅ Browser-held citizen records, report history, and local verification fallbacks removed from the active Citizen/Admin data path; legacy `vaankan-*` browser keys are cleared on app load.
- ✅ Admin sample report fixtures and Analyst fallback datasets disabled/removed from active display paths.
- ✅ Focused automated tests covering registration, report ownership/history, Admin decision lifecycle, email configuration, and database-browser safeguards.

---

## 🗺️ Roadmap: What Comes Next

### Toward Full Problem-Statement Coverage

1. 🌐 Authorized live IMD, MOSDAC, public-dataset, web/news, and social adapters. `#IMD`/weather-hashtag collection needs approved access, terms compliance, privacy, rate limiting, and deletion handling.
2. 🔐 Production identity for all roles, server-side RBAC, citizen ownership enforcement, privileged MFA, secure sessions/tokens, throttling, and abuse protection.
3. 🖼️ Secure image/video upload, object storage, validation/scanning, signed URLs, retention, and evidence review.
4. 🔧 Complete migration of the legacy Admin Analysis metrics/stations/events/reports to persisted VAYU APIs.
5. 🏷️ Labeled multilingual data, deduplication evaluation, and calibrated VISTA assessment.
6. 📚 Persistent VAYU event history/evolution and validated severity/impact/forecast models.
7. 📬 Notification consent/preferences, outbox worker, retries, bounce handling, SMS/push provider, and inbox-level monitoring. (SMTP `sent` currently means provider handoff.)
8. ⚡ Near-real-time updates, scheduled ingestion, backpressure, monitoring, backups/restore, load testing, and production deployment.
9. 🔒 Privacy review for precise location and Government ID, with minimized/tokenized identifiers and restricted access before production.

### 🧭 Suggested Hackathon Work Order

1. Stabilize the single-region PostgreSQL/PostGIS demo and remove demo login shortcuts from the judged path.
2. Demonstrate one report ID end-to-end: submit → pending → Admin evidence review → verified → ground observation → VAYU query → notification outcome → Citizen Activities/Admin History.
3. Add one permitted official/public source beyond Open-Meteo and show provenance, freshness, and quality.
4. Build a small labeled evaluation set; compare transparent VISTA rules to one lightweight text baseline and report metrics and limitations.
5. Add secure media storage and a durable notification outbox/retry worker.
6. Complete security, accessibility, reliability, backup/restore, and load-test evidence before calling the platform production-ready or national-scale.

---

## 📚 Research and References

These references support the technology and integration plan. Verify provider terms, API availability, and dataset licenses before use.

1. India Meteorological Department, [official website](https://mausam.imd.gov.in/). Use authorized products/APIs and distinguish official warnings from platform analysis.
2. MOSDAC, [Meteorological and Oceanographic Satellite Data Archival Centre](https://mosdac.gov.in/). Confirm access and product terms for selected feeds.
3. Government of India, [Open Government Data Platform](https://data.gov.in/). Record dataset license, update cadence, and attribution.
4. Open-Meteo, [API documentation](https://open-meteo.com/en/docs) and [historical weather API](https://open-meteo.com/en/docs/historical-weather-api). Review terms for production use.
5. World Meteorological Organization, [WIS 2.0](https://wmo.int/activities/wis/wis2-0), a future reference for interoperable weather-data exchange.
6. [PostgreSQL documentation](https://www.postgresql.org/docs/) and [PostGIS documentation](https://postgis.net/documentation/); see also [`ST_DWithin`](https://postgis.net/docs/ST_DWithin.html).
7. Open Geospatial Consortium, [OGC API — Features](https://www.ogc.org/standard/ogcapi-features/).
8. [FastAPI documentation](https://fastapi.tiangolo.com/).
9. NIST, [AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework), for governance, evaluation, transparency, and monitoring.
10. OWASP, [Application Security Verification Standard](https://owasp.org/www-project-application-security-verification-standard/) and [File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).
11. Social platforms: integrate only through official developer documentation and terms after access is approved, and claim hashtag coverage only once a functioning authorized adapter exists.

---

## 🌈 Closing Pitch

VAANKAN is built around a practical trust boundary: incoming weather claims and meteorological measurements are different kinds of evidence. It gives each a source trail, stores them centrally, lets a human reviewer make an auditable decision, and lets VAYU query verified ground observations alongside weather data. The prototype already proves this workflow end to end. The next step is to validate it in one region with authorized sources, then grow ingestion and models on the back of measured performance and privacy-safe operations. ⛈️🇮🇳