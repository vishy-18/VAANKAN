# VAANKAN

VAANKAN is a weather-intelligence MVP for combining verified weather events, citizen observations, geospatial context, and evidence-led administrative review.

The current implementation is a frontend prototype. It uses a small mock event dataset, browser geolocation, browser `localStorage`, Leaflet, and OpenStreetMap tiles to demonstrate the main workflows before backend, database, and model services are connected.

## Run Locally

Requirements: Node.js, npm, and Python 3.12+ for the backend demo slice.

```bash
npm install
npm run dev
```

Open the development server at `http://localhost:5173/`.

Routes:

- `http://localhost:5173/admin` - admin login and operations workspace
- `http://localhost:5173/citizen` - citizen registration, sign-in, GPS view, alerts, and search

Useful commands:

```bash
npm run build   # TypeScript check and production build
npm run lint    # ESLint
npm run preview # Serve the production build locally
```

Backend setup and tests:

```bash
python -m pip install -r requirements.txt
python -m uvicorn backend.main:app --reload --port 8000
python -m pytest backend -q
```

The backend currently runs in deterministic in-memory demo mode. It exposes OpenAPI documentation at `http://127.0.0.1:8000/docs`.

The backend defaults to `STORAGE_BACKEND=memory`. To use local PostgreSQL/PostGIS, start it with `docker compose up -d postgis`, set `STORAGE_BACKEND=postgres` and `DATABASE_URL=postgresql+psycopg://vaankan:vaankan@localhost:5432/vaankan` in `.env`, then apply migrations before starting FastAPI. Compose credentials are development-only; never use them in deployment or commit a real database URL.

The source-aware ingestion preview is available at `GET /api/ingestion/sources` and `POST /api/ingestion/demo-preview`. It uses deterministic IMD-shaped and citizen demo fixtures to demonstrate normalization, quality validation, exact-hash deduplication with canonical provenance, and routing: structured meteorological records go to the VAYU path as `TRUSTED_SOURCE`; external reports remain `PENDING` for VISTA review. The IMD, MOSDAC, and Government Open Data entries are marked `NOT_CONFIGURED`; no live provider access or persistent ingestion is claimed.

With PostgreSQL mode configured, apply/check migrations:

```bash
alembic upgrade head
alembic current
```

Integration tests use a separate database on port `5433`. Start it with `docker compose up -d postgis-test`, set `TEST_DATABASE_URL=postgresql+psycopg://vaankan:vaankan@localhost:5433/vaankan_test`, and run `python -m pytest backend -q`. The PostgreSQL integration test refuses database names that do not contain `test`.

After migration, verify the extension with `SELECT PostGIS_Full_Version();`. In PostgreSQL mode, `GET /api/system/health` checks database and PostGIS readiness without exposing credentials; the existing `/health` response fields are unchanged.

Real email/SMS dispatch requires provider configuration. Copy `.env.example` to `.env`, replace the placeholder SMTP/Twilio values, and restart FastAPI. The backend loads `.env` automatically. Without those settings, `/api/notifications/dispatch` returns `not_configured` and no message is sent.

Engine dashboards:

```bash
streamlit run streamlit_vista.py --server.port 8501
streamlit run streamlit_vayu.py --server.port 8502
```

- VISTA model lab: `http://localhost:8501`
- VAYU analytics lab: `http://localhost:8502`

These dashboards currently show deterministic synthetic/demo metrics and explicitly identify the model adapters and datasets that still need real training runs.

## Admin Workspace

- Demo admin authentication with any non-empty password.
- Intelligence dashboard with KPIs, event filters, report velocity, source health, and processing health.
- Leaflet/OpenStreetMap event map with intensity overlays and popups.
- Consolidated event list with location, status, report count, and received time.
- Admin review queue with search, evidence signal, confidence, source, and verification actions.
- Clicking a dashboard event, attention notification, or review record opens a dedicated alert-detail page.
- Alert detail page includes:
  - location, coordinates, event date, event time, received time, confidence, and intensity;
  - model-predicted status displayed at the top right by default;
  - map context for the selected alert;
  - sample database evidence records for citizen observations, weather feeds, and model explanation;
  - human actions to verify, request review, or mark an alert suspicious.
- Responsive layout, mobile navigation, night mode, sign-out, and feedback notifications.

## Citizen Portal

- Separate citizen registration and sign-in experience at `/citizen`.
- Registration asks for name, phone, email, government ID, address, and password. Address is collected during registration; GPS is not requested there.
- GPS tracking starts after successful sign-in with `navigator.geolocation.watchPosition` and remains active while the portal is open.
- Current location is shown with a Google Maps-style pin and used as the source for local analysis.
- Home map, area analysis, recent signals, and alerts are scoped to reports near the current GPS location.
- Alerts show verified events within the 10 km notification radius.
- Separate location-search page for exploring another city, region, or event without changing the live GPS view.
- Three alert delivery modes in the alert centre:
  - Portal notification while the citizen portal is active;
  - SMS delivery state using the saved phone number;
  - Email delivery state using the saved email address.
- Citizen profile page for contact and address updates plus post-login GPS refresh.
- Citizen night mode, responsive layout, local profile persistence, and sign-out.

## Data and Integrations

The mock `Report` records currently include event ID, title, location, source, relative time, status, confidence, report count, category, region, age, latitude, longitude, and intensity.

Current browser/external integrations:

- Leaflet for interactive maps.
- OpenStreetMap tiles for map rendering.
- Browser Geolocation API for authenticated citizen GPS tracking.
- Browser `localStorage` for citizen profiles.

The repository now includes a FastAPI demo API for normalized reports, citizen authentication, VISTA/VAYU contracts, admin decisions, and audit records. It is not yet connected to a shared database, WebSocket, Kafka pipeline, production notification provider, or machine-learning service.

## Current Limitations

- Authentication is demo-only and does not provide production identity, session security, or role-based access control.
- Citizen profiles and alert delivery state are local to the browser.
- Alert documents and model statuses are representative sample data, not database records.
- Without provider configuration, SMS and email controls demonstrate UI state only; portal notifications remain local to the browser.
- Actual email and SMS delivery requires SMTP and Twilio provider configuration; the repository includes `.env.example` but no credentials.
- GPS requires browser permission, a supported browser, and a secure context such as `localhost`.
- OpenStreetMap tiles require internet access.
- The admin alert detail view is an in-app view state, not a persisted URL route.
- The FastAPI backend uses an in-memory store and is not yet wired into the existing React mock data.

## Next Steps

1. Add a FastAPI backend with admin and citizen authentication.
2. Move profiles, events, evidence documents, verification decisions, and notification preferences to PostgreSQL/PostGIS.
3. Replace mock reports with API responses and real event ingestion.
4. Persist verification actions, operator identity, reason codes, model version, and audit timestamps.
5. Connect real SMS, email, web push, or Firebase Cloud Messaging providers.
6. Add secure citizen media uploads and evidence inspection.
7. Add WebSocket updates and real last-sync information.
8. Add privacy, consent, rate limiting, and role-based access controls.
# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://npmx.dev/package/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://npmx.dev/package/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```
