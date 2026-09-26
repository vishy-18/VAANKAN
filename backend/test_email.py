from unittest.mock import patch
from fastapi.testclient import TestClient

from .email_service import get_smtp_config, render_weather_alert_html, render_welcome_html, send_email_service
from .main import app
from .store import haversine_distance_km, store

client = TestClient(app)


def test_get_smtp_config(monkeypatch) -> None:
    monkeypatch.setenv("VAANKAN_SMTP_HOST", "smtp.test.com")
    monkeypatch.setenv("VAANKAN_SMTP_USERNAME", "test@test.com")
    monkeypatch.setenv("VAANKAN_SMTP_PASSWORD", "secret")
    monkeypatch.setenv("VAANKAN_SMTP_FROM", "test@test.com")
    config = get_smtp_config()
    assert config["configured"] is True
    assert config["host"] == "smtp.test.com"


def test_haversine_distance_calculation() -> None:
    # Cuddalore (11.75, 79.76) to nearby point (11.755, 79.765) is approx 0.77 km
    dist = haversine_distance_km(11.75, 79.76, 11.755, 79.765)
    assert 0.5 < dist < 1.0

    # Cuddalore to Chennai (13.08, 80.27) is ~150 km
    dist_chennai = haversine_distance_km(11.75, 79.76, 13.0827, 80.2707)
    assert dist_chennai > 100.0


def test_find_users_within_10km_radius() -> None:
    users_in_range = store.find_users_within_radius(11.75, 79.76, radius_km=10.0)
    emails = [u["email"] for u in users_in_range]
    assert "skyware2025@gmail.com" in emails
    assert "citizen.cuddalore@vaankan.gov.in" in emails
    assert "chennai.observer@example.com" not in emails


def test_render_weather_alert_html() -> None:
    html = render_weather_alert_html(
        title="Severe Flood Warning",
        location="Cuddalore",
        event_type="flooding",
        severity="High",
        distance_km=4.5,
        report_id="R10234",
    )
    assert "Severe Flood Warning" in html
    assert "Cuddalore" in html
    assert "R10234" in html
    assert "4.5 km away" in html


def test_render_welcome_html() -> None:
    html = render_welcome_html(name="Vishaal", email="user@example.com", address="Tamil Nadu")
    assert "Vishaal" in html
    assert "user@example.com" in html
    assert "Welcome to Citizen Weather Intelligence" in html


def test_send_email_service_unconfigured(monkeypatch) -> None:
    monkeypatch.delenv("VAANKAN_SMTP_HOST", raising=False)
    status_str, err = send_email_service("recipient@example.com", "Test", "Body")
    assert status_str == "not_configured"
    assert err is not None


def test_api_submit_verification_auto_email(monkeypatch) -> None:
    monkeypatch.delenv("VAANKAN_SMTP_HOST", raising=False)
    payload = {
        "status": "VERIFIED",
        "reason": "Confirmed by radar and 2 ground reports",
        "operator": "A. Sharma (Senior Officer)",
    }
    response = client.post("/api/admin/reports/R10234/submit-verification", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["new_status"] == "VERIFIED"
    assert data["report_id"] == "R10234"
    assert data["operator"] == "A. Sharma (Senior Officer)"
    assert data["notified_count"] >= 2  # Users within 10 km
    assert data["email_status"] == "not_configured"


def test_api_submission_history_endpoint() -> None:
    response = client.get("/api/admin/submission-history")
    assert response.status_code == 200
    history = response.json()
    assert isinstance(history, list)
    assert len(history) > 0
    assert "submission_id" in history[0]
    assert "new_status" in history[0]
