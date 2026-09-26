# VAANKAN Progress Report

**Status date:** 24 September 2026

## Current Services

### Frontend

- Vite development server: `http://localhost:5173`
- Admin portal: `http://localhost:5173/admin`
- Citizen portal: `http://localhost:5173/citizen`

### Backend Demo Slice

- FastAPI server: `http://127.0.0.1:8000`
- Health endpoint: `GET /health`
- OpenAPI documentation: `http://127.0.0.1:8000/docs`
- Storage mode: deterministic in-memory demo store
- The backend is a real API seam, but it is not yet connected to PostgreSQL, PostGIS, Kafka, MinIO, or trained ML models.
- Provider dispatch endpoint: `POST /api/notifications/dispatch` with optional SMTP email and Twilio SMS integration.

### Engine Dashboards

- VISTA Streamlit model lab: `streamlit_vista.py`, intended for port `8501`.
- VAYU Streamlit analytics lab: `streamlit_vayu.py`, intended for port `8502`.
- Both dashboards show model cards, demo metrics, dataset summaries, charts, event categories, and pipeline-readiness notes.
- All displayed metrics are explicitly marked synthetic/demo until actual datasets and training/evaluation pipelines are connected.
- Both dashboards were launched and returned HTTP 200 during smoke testing.

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
- `GET /api/reports/{report_id}`
- `POST /api/vista/verify`
- `GET /api/vayu/analytics`
- `POST /api/admin/reports/{report_id}/decision`
- `POST /api/admin/reports/{report_id}/verify`
- `POST /api/admin/reports/{report_id}/review`
- `POST /api/admin/reports/{report_id}/suspicious`
- `GET /api/admin/audit-logs`

Admin decisions update the demo store and create an audit action containing the report ID, previous status, new status, reason, and timestamp. Passwords are hashed in the demo store; this is not a production identity system.

## Testing Completed

### Automated

- Backend API tests: **5 passed** with pytest.
- VISTA Streamlit dashboard: **HTTP 200** on port `8501`.
- VAYU Streamlit dashboard: **HTTP 200** on port `8502`.
- Tests cover health, normalized report lifecycle, validation, registration/login, admin decision aliases, audit records, VISTA contract, and VAYU contract.
- React TypeScript/Vite production build: **passed**.
- ESLint: **passed**.
- Python backend compilation: **passed**.
- Documentation whitespace check: **passed** with `git diff --check`.

### Live Smoke Tests

- Vite root responded with HTTP 200.
- FastAPI `/health` responded with HTTP 200.
- FastAPI `/api/reports` responded with HTTP 200 and returned the normalized sample report.
- Temporary FastAPI smoke-test process was stopped after validation.

## Explicitly Not Implemented Yet

The full supplied architecture prompt is larger than the existing frontend and the current increment. These remain planned, not claimed as complete:

- PostgreSQL and PostGIS persistence.
- MinIO/S3 image and video storage.
- Kafka topics and consumers.
- PySpark jobs for large-scale processing.
- Real weather, social, website, and public-dataset adapters.
- 20,000-row VISTA and 100,000-row VAYU datasets.
- XLM-R/IndicBERT, Sentence-BERT, CLIP/ViT, FAISS, DBSCAN, XGBoost, Isolation Forest, LSTM, SHAP, and trained model artifacts.
- Real VISTA evidence fusion and evaluation metrics.
- Real VAYU anomaly, hotspot, trend, and severity models.
- WebSockets and live dashboard updates.
- Real media upload validation and retention.
- Real SMS, email, FCM, or Web Push delivery.
- SMTP/Twilio delivery is now implemented as an optional provider adapter, but no provider credentials are stored in the repository.
- Streamlit VISTA and VAYU engineering dashboards.
- Persistent JWT/Argon2 authentication, RBAC, consent, rate limiting, and production audit logging.
- Full React-to-FastAPI integration; the current UI still uses its existing mock frontend data.

## Next Implementation Order

1. Add SQLAlchemy migrations and PostgreSQL/PostGIS repositories while preserving the in-memory test store.
2. Connect React admin/citizen data loading to FastAPI with loading, stale, offline, and API-error states.
3. Add authenticated citizen report submission with image/video metadata and object-storage adapters.
4. Add replaceable weather, public-dataset, website, social, and citizen ingestion interfaces.
5. Add deterministic deduplication/event fingerprinting before introducing trained VISTA/VAYU models.
6. Add Kafka/WebSocket integration and source/processing health telemetry.
7. Generate validated synthetic VISTA/VAYU datasets and implement reproducible evaluation before displaying model metrics.
8. Add model registry, Streamlit observability dashboards, notifications, privacy controls, and end-to-end tests.
