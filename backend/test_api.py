from fastapi.testclient import TestClient

from . import main as main_module
from .main import app


client = TestClient(app)


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_system_health_is_explicitly_demo_mode(monkeypatch) -> None:
    monkeypatch.setenv("STORAGE_BACKEND", "memory")

    legacy_health = client.get("/health")
    assert set(legacy_health.json()) == {"status", "mode", "version"}
    assert legacy_health.json()["mode"] == "demo-memory"

    readiness = client.get("/api/system/health")
    assert readiness.status_code == 200
    assert readiness.json()["storage"] == "memory"
    assert readiness.json()["postgis"] == "not_configured"


def test_demo_ingestion_routes_trusted_sources_and_external_reports_correctly() -> None:
    sources = client.get("/api/ingestion/sources")
    assert sources.status_code == 200
    source_modes = {source["source_id"]: source["mode"] for source in sources.json()["sources"]}
    assert source_modes["demo-imd-station-delhi-001"] == "DEMO"
    assert source_modes["imd-api"] == "UNAVAILABLE"
    assert source_modes["mosdac"] == "UNAVAILABLE"

    response = client.post("/api/ingestion/demo-preview")
    assert response.status_code == 200
    batch = response.json()
    assert batch["mode"] == "DEMO"
    assert batch["received_count"] == 4
    assert batch["duplicate_count"] == 1
    assert batch["trusted_meteorological_count"] == 2
    assert batch["vista_pending_count"] == 1

    trusted = [receipt for receipt in batch["receipts"] if receipt["source_class"] == "AUTHORITATIVE_METEOROLOGICAL"]
    external = [receipt for receipt in batch["receipts"] if receipt["source_class"] == "UNTRUSTED_EXTERNAL_REPORT"]
    assert all(receipt["route"] == "VAYU_METEOROLOGY" for receipt in trusted)
    assert all(receipt["verification_status"] == "TRUSTED_SOURCE" for receipt in trusted)
    assert all(receipt["route"] == "VISTA_REVIEW" for receipt in external)
    assert all(receipt["verification_status"] == "PENDING" for receipt in external)
    duplicate = next(receipt for receipt in external if receipt["deduplication"] == "EXACT_DUPLICATE")
    assert duplicate["canonical_record_id"] == "DEMO-CIT-CHN-001"


def test_report_lifecycle_and_admin_decision() -> None:
    report = {
        "record_id": "TEST-001",
        "source_type": "citizen",
        "source_name": "Test citizen",
        "timestamp": "2026-09-24T14:30:00Z",
        "text": "Heavy rain has flooded the road.",
        "language": "en",
        "latitude": 11.75,
        "longitude": 79.76,
        "city": "Cuddalore",
        "district": "Cuddalore",
        "state": "Tamil Nadu",
        "event_type_claimed": "flooding",
        "verification_status": "PENDING",
    }
    created = client.post("/api/reports", json=report)
    assert created.status_code == 201
    assert created.json()["verification_status"] == "PENDING"

    decision = client.post("/api/admin/reports/TEST-001/decision", json={"status": "VERIFIED", "reason": "Supported by nearby weather evidence"})
    assert decision.status_code == 200
    assert decision.json()["verification_status"] == "VERIFIED"

    logs = client.get("/api/admin/audit-logs")
    assert logs.status_code == 200
    assert logs.json()[-1]["new_status"] == "VERIFIED"


def test_sample_events_seed_twelve_with_three_pending_near_requested_location(monkeypatch) -> None:
    monkeypatch.setenv("STORAGE_BACKEND", "memory")
    first = client.post("/api/admin/sample-events")
    assert first.status_code == 200
    payload = first.json()
    assert payload["created_count"] == 12
    assert payload["pending_review_count"] == 5
    assert payload["pending_near_target_count"] == 3

    reports = client.get("/api/admin/reports/review-queue", params={"status": "PENDING"}).json()
    samples = [report for report in reports if report["record_id"].startswith("VAANKAN-SAMPLE-20260929-")]
    assert len(samples) == 5
    near = client.get("/api/reports/nearby", params={
        "latitude": 12.8981,
        "longitude": 80.1576,
        "radius_km": 10,
        "verification_status": "PENDING",
    }).json()
    near_samples = [report for report in near if report["record_id"].startswith("VAANKAN-SAMPLE-20260929-")]
    assert len(near_samples) == 3
    assert all(not report["submitted"] for report in samples)

    second = client.post("/api/admin/sample-events")
    assert second.status_code == 200
    assert second.json()["created_count"] == 0
    assert second.json()["existing_count"] == 12


def test_verified_submission_sends_once_and_only_after_submit(monkeypatch) -> None:
    monkeypatch.setenv("STORAGE_BACKEND", "memory")
    delivered: list[str] = []
    monkeypatch.setattr(main_module, "send_email_service", lambda **kwargs: (delivered.append(kwargs["recipient"]) or "sent", None))
    store = main_module.store
    account = store.add_user(
        "nearby-submit-test@example.com",
        "test-password",
        name="Nearby Test Citizen",
        phone="+919999000000",
        address="Medavakkam, Chennai",
        latitude=12.8981,
        longitude=80.1576,
    )
    report = {
        "record_id": "SUBMIT-ALERT-TEST-001",
        "source_type": "citizen",
        "source_name": "Submission test",
        "timestamp": "2026-09-29T10:00:00Z",
        "text": "Flooding reported beside the test road.",
        "language": "en",
        "latitude": 12.8981,
        "longitude": 80.1576,
        "city": "Chennai",
        "district": "Chennai",
        "state": "Tamil Nadu",
        "event_type_claimed": "flooding",
        "verification_status": "PENDING",
    }
    try:
        assert client.post("/api/reports", json=report).status_code == 201
        verified = client.post("/api/admin/reports/SUBMIT-ALERT-TEST-001/verify", json={"status": "VERIFIED", "reason": "Test evidence confirmed"})
        assert verified.status_code == 200
        assert verified.json()["submitted"] is False
        assert delivered == []

        submitted = client.post("/api/admin/reports/SUBMIT-ALERT-TEST-001/submit-to-vayu")
        assert submitted.status_code == 200
        assert submitted.json()["status"] == "VERIFIED"
        assert submitted.json()["submitted"] is True
        assert submitted.json()["notified_count"] >= 1
        assert "nearby-submit-test@example.com" in delivered

        stored = client.get("/api/reports/SUBMIT-ALERT-TEST-001").json()
        assert stored["verification_status"] == "VERIFIED"
        assert stored["submitted"] is True
        alerts = client.get("/api/citizen/alerts", params={"citizen_id": account["user_id"]}).json()
        assert any(alert["report_id"] == "SUBMIT-ALERT-TEST-001" for alert in alerts)
        client.get("/api/citizen/alerts", params={"citizen_id": account["user_id"]})
        assert delivered.count("nearby-submit-test@example.com") == 1

        retry = client.post("/api/admin/reports/SUBMIT-ALERT-TEST-001/submit-to-vayu")
        assert retry.status_code == 409
        assert delivered.count("nearby-submit-test@example.com") == 1
    finally:
        store.users.pop("nearby-submit-test@example.com", None)
        store.reports.pop("SUBMIT-ALERT-TEST-001", None)
        store.ground_observations = {key: value for key, value in store.ground_observations.items() if value.report_id != "SUBMIT-ALERT-TEST-001"}
        for alert_id, alert in list(store.alerts.items()):
            if alert["report_id"] == "SUBMIT-ALERT-TEST-001":
                store.alerts.pop(alert_id, None)
                store.notifications = [item for item in store.notifications if item["alert_id"] != alert_id]
        store._rebuild_weather_events()


def test_citizen_report_history_returns_only_owned_reports() -> None:
    report = {
        "record_id": "CIT-HISTORY-001",
        "source_type": "citizen",
        "source_name": "citizen@example.com",
        "timestamp": "2026-09-28T10:00:00Z",
        "text": "Heavy rain - Water is collecting near the road.",
        "language": "en",
        "latitude": 12.95,
        "longitude": 80.14,
        "city": "Chennai",
        "district": "Chennai",
        "state": "Tamil Nadu",
        "event_type_claimed": "rainfall",
        "verification_status": "PENDING",
        "citizen_id": "citizen@example.com",
        "description": "Water is collecting near the road.",
        "locality": "Medavakkam",
    }
    created = client.post("/api/reports", json=report)
    assert created.status_code == 201

    legacy_report = {
        **report,
        "record_id": "CIT-HISTORY-LEGACY-001",
        "source_name": "Citizen • citizen@example.com",
        "timestamp": "2026-09-27T10:00:00Z",
    }
    legacy_report.pop("citizen_id")
    legacy_created = client.post("/api/reports", json=legacy_report)
    assert legacy_created.status_code == 201

    history = client.get("/api/citizen/reports", params={"citizen_id": "citizen@example.com"})
    assert history.status_code == 200
    assert {item["record_id"] for item in history.json()} == {"CIT-HISTORY-001", "CIT-HISTORY-LEGACY-001"}
    current_report = next(item for item in history.json() if item["record_id"] == "CIT-HISTORY-001")
    assert current_report["description"] == "Water is collecting near the road."

    other_citizen_history = client.get("/api/citizen/reports", params={"citizen_id": "other@example.com"})
    assert other_citizen_history.status_code == 200
    assert not {"CIT-HISTORY-001", "CIT-HISTORY-LEGACY-001"} & {item["record_id"] for item in other_citizen_history.json()}


def test_admin_decision_aliases() -> None:
    response = client.post("/api/admin/reports/R10234/review", json={"status": "PENDING", "reason": "Needs additional evidence"})
    assert response.status_code == 200
    assert response.json()["verification_status"] == "PENDING"

    response = client.post("/api/admin/reports/R10234/suspicious", json={"status": "SUSPICIOUS", "reason": "Media reuse suspected"})
    assert response.status_code == 200
    assert response.json()["verification_status"] == "SUSPICIOUS"

    response = client.post("/api/admin/reports/R10234/verify", json={"status": "VERIFIED", "reason": "Independent evidence supports report"})
    assert response.status_code == 200
    assert response.json()["verification_status"] == "VERIFIED"


def test_verified_reports_become_vayu_ground_observations_and_events() -> None:
    report = {
        "record_id": "PIPELINE-001",
        "source_type": "citizen",
        "source_name": "Pipeline test",
        "timestamp": "2026-09-26T10:00:00Z",
        "text": "Flooding reported near the river road.",
        "language": "en",
        "latitude": 11.75,
        "longitude": 79.76,
        "city": "Cuddalore",
        "district": "Cuddalore",
        "state": "Tamil Nadu",
        "event_type_claimed": "flooding",
        "verification_status": "PENDING",
    }
    created = client.post("/api/reports", json=report)
    assert created.status_code == 201
    assert all(item["report_id"] != "PIPELINE-001" for item in client.get("/api/vayu/ground-observations").json())

    verified = client.post("/api/admin/reports/PIPELINE-001/verify", json={"status": "VERIFIED", "reason": "Independent evidence supports report"})
    assert verified.status_code == 200
    assert verified.json()["verification_status"] == "VERIFIED"

    submission = client.post("/api/admin/reports/PIPELINE-001/submit-to-vayu")
    assert submission.status_code == 200
    payload = submission.json()
    assert payload["status"] == "VERIFIED"
    assert payload["submitted"] is True
    assert payload["vayu_status"] == "SUBMITTED"
    assert "citizen portal alerts were created" in payload["message"]

    duplicate = client.post("/api/admin/reports/PIPELINE-001/submit-to-vayu")
    assert duplicate.status_code == 409

    suspicious = client.post("/api/admin/reports/R10234/suspicious", json={"status": "SUSPICIOUS", "reason": "Media reuse suspected"})
    assert suspicious.status_code == 200
    blocked = client.post("/api/admin/reports/R10234/submit-to-vayu")
    assert blocked.status_code == 400


def test_nearby_reports_endpoint_validates_radius_and_filters() -> None:
    response = client.get(
        "/api/reports/nearby",
        params={"latitude": 11.75, "longitude": 79.76, "radius_km": 10, "limit": 20},
    )
    assert response.status_code == 200
    assert all(
        abs(report["latitude"] - 11.75) < 1 and abs(report["longitude"] - 79.76) < 1
        for report in response.json()
    )

    invalid_radius = client.get(
        "/api/reports/nearby",
        params={"latitude": 11.75, "longitude": 79.76, "radius_km": 0},
    )
    assert invalid_radius.status_code == 422

    invalid_coordinates = client.get(
        "/api/reports/nearby",
        params={"latitude": 91, "longitude": 79.76, "radius_km": 10},
    )
    assert invalid_coordinates.status_code == 422

    verified = client.post(
        "/api/admin/reports/PIPELINE-001/verify",
        json={"status": "VERIFIED", "reason": "Admin reviewed supporting evidence"},
    )
    assert verified.status_code == 200

    observations = client.get("/api/vayu/ground-observations").json()
    observation = next(item for item in observations if item["report_id"] == "PIPELINE-001")
    assert observation["source"] == "ADMIN_REVIEW"
    assert observation["verification_status"] == "VERIFIED"
    assert observation["verification_confidence"] is None

    events = client.get("/api/vayu/events", params={"region": "Cuddalore"}).json()
    event = next(item for item in events if "GO-PIPELINE-001" in item["observation_ids"])
    assert event["verified_report_count"] == len(event["observation_ids"])
    assert event["verified_report_count"] >= 1
    assert event["status"] in {"DETECTED", "CORRELATED"}
    assert event["severity"] == "UNASSESSED"
    assert event["vayu_analysis"]["event_confidence"] is None

    reviewed = client.post(
        "/api/admin/reports/PIPELINE-001/review",
        json={"status": "PENDING", "reason": "Reopened for additional evidence"},
    )
    assert reviewed.status_code == 200
    assert all(item["report_id"] != "PIPELINE-001" for item in client.get("/api/vayu/ground-observations").json())


def test_registration_requires_secure_password_and_login() -> None:
    invalid = client.post("/api/auth/citizen/register", json={"name": "Test User", "email": "test@example.com", "password": "short", "address": "Cuddalore", "phone": "+919999999999", "government_id": "TEST-ID-001"})
    assert invalid.status_code == 422

    registered = client.post("/api/auth/citizen/register", json={"name": "Test User", "email": "test@example.com", "password": "long-enough-password", "address": "Cuddalore", "phone": "+919999999999", "government_id": "TEST-ID-001"})
    assert registered.status_code == 201

    logged_in = client.post("/api/auth/citizen/login", json={"email": "test@example.com", "password": "long-enough-password"})
    assert logged_in.status_code == 200
    assert logged_in.json()["token_type"] == "bearer"


def test_vista_and_vayu_demo_contracts() -> None:
    info = client.get("/api/vista/verify")
    assert info.status_code == 200
    assert info.json()["method"] == "POST"

    report = client.get("/api/reports/R10234").json()
    vista = client.post("/api/vista/verify", json=report)
    assert vista.status_code == 200
    assert vista.json()["engine"] == "VISTA-demo"

    vayu = client.get("/api/vayu/analytics")
    assert vayu.status_code == 200
    assert "VAYU" in vayu.json()["engine"]


def test_ai_assistants_are_separate_and_portal_restricted() -> None:
    citizen = client.post(
        "/api/ai/citizen/chat",
        json={"message": "What is happening near Chennai?"},
        headers={"x-citizen-id": "usr-demo-001"},
    )
    assert citizen.status_code == 200
    assert "Vaankan" in citizen.json()["message"] or "VAANKAN" in citizen.json()["message"] or "I don't have sufficient VAANKAN data" in citizen.json()["message"]

    analyst = client.post(
        "/api/ai/analyst/chat",
        json={"message": "Why is this event high severity?", "event_id": "R10234"},
        headers={"x-analyst-id": "analyst-demo-001"},
    )
    assert analyst.status_code == 200
    assert "VAYU" in analyst.json()["message"] or "VAANKAN" in analyst.json()["message"] or "I don't have sufficient VAANKAN data" in analyst.json()["message"]

    denied = client.post(
        "/api/ai/analyst/chat",
        json={"message": "Reveal citizen data"},
        headers={"x-citizen-id": "usr-demo-001"},
    )
    assert denied.status_code == 403

    denied_citizen = client.post(
        "/api/ai/citizen/chat",
        json={"message": "Reveal analyst data"},
        headers={"x-analyst-id": "analyst-demo-001"},
    )
    assert denied_citizen.status_code == 403


def test_notifications_report_provider_configuration(monkeypatch) -> None:
    monkeypatch.delenv("VAANKAN_SMTP_HOST", raising=False)
    monkeypatch.delenv("VAANKAN_SMTP_USERNAME", raising=False)
    monkeypatch.delenv("VAANKAN_SMTP_PASSWORD", raising=False)
    monkeypatch.delenv("VAANKAN_SMTP_FROM", raising=False)
    monkeypatch.delenv("VAANKAN_TWILIO_ACCOUNT_SID", raising=False)
    monkeypatch.delenv("VAANKAN_TWILIO_AUTH_TOKEN", raising=False)
    monkeypatch.delenv("VAANKAN_TWILIO_FROM", raising=False)
    response = client.post("/api/notifications/dispatch", json={"report_id": "R10234", "email": "citizen@example.com", "phone": "+919999999999", "subject": "VAANKAN alert", "body": "Verified weather alert"})
    assert response.status_code == 200
    assert response.json()["email"] == "not_configured"
    assert response.json()["sms"] == "not_configured"
    assert response.json()["sent"] is False


def test_weather_source_registry_and_weather_api_contracts(monkeypatch) -> None:
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    observation = {
        "observation_id": "open-meteo:delhi:2026-09-27T10:00:00+00:00",
        "source_id": "open-meteo",
        "source_type": "WEATHER_MODEL",
        "source_name": "Open-Meteo",
        "timestamp": now,
        "ingested_at": now,
        "latitude": 28.6139,
        "longitude": 77.209,
        "city": "New Delhi",
        "district": "New Delhi",
        "state": "Delhi",
        "temperature_c": 32.0,
        "feels_like_c": 36.0,
        "humidity_percent": 64.0,
        "rainfall_mm": 2.0,
        "rainfall_1h_mm": 2.0,
        "historical_rainfall_avg_mm": 0.5,
        "historical_rainfall_daily_avg_mm": 12.0,
        "rainfall_anomaly_mm": 1.5,
        "rainfall_anomaly_ratio": 4.0,
        "weather_anomaly_score": 75.0,
        "anomaly_components": {"method": "deterministic"},
        "data_quality_flag": "PROVIDER_REPORTED",
        "freshness_status": "FRESH",
        "data_mode": "LIVE",
    }

    async def fake_current(*, refresh=False):
        return {
            "data_mode": "LIVE",
            "source": {"source_id": "open-meteo", "status": "LIVE"},
            "historical_source": {"source_id": "open-meteo-archive", "status": "CONNECTED"},
            "observations": [observation],
            "hourly": [],
            "event_candidates": [{
                "candidate_id": "heavy-rain-candidate:delhi",
                "event_type": "HEAVY_RAIN_CANDIDATE",
                "status": "DETECTED",
                "severity": "UNASSESSED",
                "confidence": None,
                "locations": ["delhi", "gurugram", "noida"],
                "states": ["Delhi", "Haryana", "Uttar Pradesh"],
                "trigger_reason": "Repeated anomaly and nearby corroboration.",
                "data_mode": "LIVE",
                "timeline": [],
            }],
            "failed_location_count": 0,
            "historical_failed_location_count": 0,
        }

    monkeypatch.setenv("STORAGE_BACKEND", "memory")
    monkeypatch.setattr(main_module.weather_intelligence, "current", fake_current)

    current = client.get("/api/weather/current", params={"state": "Delhi"})
    assert current.status_code == 200
    payload = current.json()
    assert payload["data_mode"] == "LIVE"
    assert len(payload["observations"]) == 1
    assert "not universal ground truth" in payload["ground_truth_note"]

    observations = client.get("/api/weather/observations", params={"city": "New Delhi"})
    assert observations.status_code == 200
    assert observations.json()[0]["rainfall_anomaly_ratio"] == 4.0
    assert observations.json()[0]["pressure_hpa"] is None

    sources = client.get("/api/sources").json()["sources"]
    statuses = {source["source_id"]: source["status"] for source in sources}
    assert statuses["open-meteo"] == "READY"
    assert statuses["openweather"] == "NOT_CONFIGURED"
    assert statuses["imd"] == "NOT_CONNECTED"
    assert client.get("/api/sources/openweather/health").json()["latency_ms"] is None

    events = client.get("/api/events").json()
    assert events["events"][0]["severity"] == "UNASSESSED"
    detail = client.get("/api/events/heavy-rain-candidate:delhi")
    assert detail.status_code == 200
    timeline = client.get("/api/events/heavy-rain-candidate:delhi/timeline")
    assert timeline.status_code == 200
    assert timeline.json()["timeline_status"] == "INSUFFICIENT_PERSISTENT_HISTORY"
