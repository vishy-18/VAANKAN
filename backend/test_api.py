from fastapi.testclient import TestClient

from .main import app


client = TestClient(app)


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


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
