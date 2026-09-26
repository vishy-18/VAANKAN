from fastapi.testclient import TestClient

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
    invalid = client.post("/api/auth/citizen/register", json={"name": "Test User", "email": "test@example.com", "password": "short", "address": "Cuddalore", "phone": "+919999999999"})
    assert invalid.status_code == 422

    registered = client.post("/api/auth/citizen/register", json={"name": "Test User", "email": "test@example.com", "password": "long-enough-password", "address": "Cuddalore", "phone": "+919999999999"})
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
