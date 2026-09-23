# VAANKAN dashboard and admin MVP checklist

This first version uses a small, clearly labelled mock dataset. It proves the operational workflows before the ingestion, storage, and model layers are connected.

## Completed in this version

- [x] Intelligence dashboard shell with responsive layout
- [x] Operations navigation and dashboard/admin review mode switch
- [x] Live-network status, sync indicator, operator identity, and system status footer
- [x] KPI cards for active events, confidence, review queue, and ground observations
- [x] Dashboard filters for time window and event category
- [x] Mock geospatial event activity map with verified, review, and suspicious markers
- [x] Report velocity panel with source health and processing health indicators
- [x] Consolidated event list with status, location, report count, and timestamps
- [x] Admin attention panel and review queue entry points
- [x] Admin review table with event, evidence signal, AI confidence, source, and received time
- [x] Verify and inspect actions with feedback notifications
- [x] Audit-trail reminder in the review workflow
- [x] Mobile navigation and responsive table/layout behavior

## Next implementation slice

- [ ] Define FastAPI response contracts for dashboard KPIs, events, review queue, and filters
- [ ] Replace mock records with a seed API and a small local PostgreSQL dataset
- [ ] Add report detail drawer: raw text, image/video placeholder, metadata, evidence breakdown, and model version
- [ ] Persist admin decisions, reason codes, operator identity, and timestamps
- [ ] Add event merge/split and category correction actions
- [ ] Add audit log view and export
- [ ] Add source monitor for connector status, freshness, and failures
- [ ] Connect WebSocket event updates and a real last-sync timestamp

## Data and intelligence slice

- [ ] Create normalized report schema: source, time, location, category, text, media, and verification status
- [ ] Add PostGIS event/location queries for date, state, district, city, and radius filters
- [ ] Add deterministic MVP rules for text category, duplicate fingerprints, and weather consistency
- [ ] Store verification evidence as separate, inspectable signals rather than one opaque score
- [ ] Add model version and confidence fields to every AI decision
- [ ] Add synthetic test fixtures for verified, suspicious, unsupported, duplicate, and pending reports

## Release checks

- [ ] Test dashboard and admin workflows with keyboard navigation
- [ ] Test mobile layout at 390px and desktop layout at 1440px
- [ ] Add API error, empty, loading, and stale-data states
- [ ] Add role-based access for operator, reviewer, and administrator
- [ ] Add privacy controls for citizen location and media
- [ ] Measure ingestion throughput, verification latency, API latency, and dashboard update latency