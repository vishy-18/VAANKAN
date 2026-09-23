# VAANKAN Progress Report

**Status date:** 23 September 2026

## Running Application

Both interfaces are served by the same Vite development server:

- **Port:** `5173`
- **Admin login:** http://localhost:5173/admin
- **Citizen login:** http://localhost:5173/citizen

There are currently no separate backend ports. The frontend is using mock data and browser APIs.

## Completed

### Admin Workspace

- Admin login screen at `/admin`
- Intelligence dashboard
- Admin review queue
- Date/time, event, region, and verification filters
- Functional mock event filtering
- Admin review search
- India map using Leaflet and OpenStreetMap
- Event intensity overlays and map popups
- Night mode
- Sign-out flow
- Dashboard KPIs and report activity panels

### Citizen Workspace

- Separate citizen login screen at `/citizen`
- Citizen registration flow
- Registration fields for name, phone, email, and government ID
- GPS permission request during sign-in
- GPS autofill for latitude and longitude
- Editable latitude and longitude fields
- Browser permission behavior supports previously allowed GPS access
- Citizen Home page
- Separate Alerts page
- Citizen-specific forest, mint, and saffron theme
- Citizen sign-out flow
- Citizen night mode
- India map with filtered event intensity overlays
- Citizen location marker on the map
- Shared date, event, region, and status filters
- Area analysis based on filtered mock weather events
- Nearby alerts limited to verified events within a 10 km radius
- Local citizen profile database using browser `localStorage`
- Citizen login validates saved email and password records
- Registration requires personal details plus GPS coordinates or a typed address
- GPS coordinates are autofilled when available and remain editable
- Citizen Profile page supports editing and saving name, phone, email, government ID, address, and coordinates

### Mock Data

- Multiple Indian regions and cities
- Flooding
- Rainfall
- Thunderstorms
- Heatwaves
- Fog
- Dust storms
- Strong winds
- Verified, review, and suspicious statuses
- Coordinates, confidence, intensity, report counts, sources, and event age

## Validation Completed

- `npm run build` passed
- `npm run lint` passed
- Admin route browser checked
- Citizen route browser checked
- Citizen registration fields browser checked
- Citizen Home and Alerts navigation browser checked
- Shared filters browser checked
- Sign-out browser checked
- Leaflet map rendering browser checked

## Current Limitations

- Authentication is demo-only; any non-empty password is accepted.
- Citizen profiles are persisted locally in the browser only; they are not yet stored in a shared backend database.
- Mock data is stored in the frontend.
- GPS requires browser permission and a supported secure context such as `localhost`.
- OpenStreetMap tiles require internet access.
- Nearby alerts are calculated from mock event coordinates.
- No backend API, database, WebSocket, Kafka, or ML model is connected yet.

## Next Recommended Work

1. Create a FastAPI backend with separate admin and citizen authentication.
2. Move citizen profiles from browser `localStorage` to PostgreSQL with password hashing and email uniqueness checks.
3. Replace frontend mock data with API responses.
4. Add PostgreSQL/PostGIS for spatial and 10 km alert queries.
5. Add secure media upload for citizen photos and videos.
6. Add admin evidence detail, approve/reject, merge, and duplicate workflows.
7. Add WebSocket updates for live events and alerts.
8. Add real weather API and authorized source adapters.
9. Add notification delivery for web push or Firebase Cloud Messaging.
10. Add privacy, consent, rate limiting, and role-based access controls.
