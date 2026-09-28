from __future__ import annotations

import os
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import delete, select, text

from . import main as main_module
from .database import get_configured_engine, get_configured_session_factory
from .main import app
from .models import AdminAction, Alert, AuditLog, CitizenActivity, EventReport, Notification, Report, User, VerificationResult, WeatherEvent


TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not TEST_DATABASE_URL, reason="Set TEST_DATABASE_URL to run PostgreSQL/PostGIS integration tests")


@pytest.fixture
def postgres_client(monkeypatch):
    if not TEST_DATABASE_URL or "test" not in TEST_DATABASE_URL.rsplit("/", 1)[-1].casefold():
        pytest.skip("TEST_DATABASE_URL must point to a database whose name includes 'test'")

    monkeypatch.setenv("STORAGE_BACKEND", "postgres")
    monkeypatch.setenv("DATABASE_URL", TEST_DATABASE_URL)
    get_configured_session_factory.cache_clear()
    get_configured_engine.cache_clear()

    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.upgrade(config, "head")
    engine = get_configured_engine()
    with engine.connect() as connection:
        assert connection.execute(text("SELECT PostGIS_Full_Version()")).scalar_one()

    with TestClient(app) as test_client:
        yield test_client

    get_configured_session_factory.cache_clear()
    configured_engine = get_configured_engine()
    if configured_engine:
        configured_engine.dispose()
    get_configured_engine.cache_clear()


def test_postgres_report_decision_audit_and_postgis_nearby(postgres_client: TestClient) -> None:
    record_id = f"PGTEST-{uuid4().hex}"
    district = f"Integration-{uuid4().hex}"
    report_payload = {
        "record_id": record_id,
        "source_type": "citizen",
        "source_name": "Isolated PostgreSQL integration test",
        "timestamp": "2026-09-26T10:00:00Z",
        "text": "Flooded street reported near Cuddalore.",
        "language": "en",
        "latitude": 11.75,
        "longitude": 79.76,
        "city": district,
        "district": district,
        "state": "Test Region",
        "event_type_claimed": "flooding",
        "verification_status": "PENDING",
    }
    try:
        created = postgres_client.post("/api/reports", json=report_payload)
        assert created.status_code == 201
        assert postgres_client.get(f"/api/reports/{record_id}").json()["record_id"] == record_id

        vista = postgres_client.post("/api/vista/verify", json=report_payload)
        assert vista.status_code == 200
        session_factory = get_configured_session_factory()
        with session_factory() as db_session:
            verification_engines = list(
                db_session.scalars(
                    select(VerificationResult.engine).join(Report).where(Report.record_id == record_id)
                )
            )
        assert "VISTA-demo" in verification_engines

        verified = postgres_client.post(
            f"/api/admin/reports/{record_id}/verify",
            json={"status": "VERIFIED", "reason": "Integration test admin decision"},
        )
        assert verified.status_code == 200
        assert verified.json()["verification_status"] == "VERIFIED"

        nearby = postgres_client.get(
            "/api/reports/nearby",
            params={"latitude": 11.75, "longitude": 79.76, "radius_km": 10, "verification_status": "VERIFIED"},
        )
        assert any(report["record_id"] == record_id for report in nearby.json())
        assert any(item["report_id"] == record_id for item in postgres_client.get("/api/vayu/ground-observations").json())
        assert any(item["report_id"] == record_id for item in postgres_client.get("/api/admin/audit-logs").json())

        with TestClient(app) as restarted_client:
            persisted = restarted_client.get(f"/api/reports/{record_id}")
            assert persisted.status_code == 200
            assert persisted.json()["verification_status"] == "VERIFIED"

    finally:
        engine = get_configured_engine()
        if engine:
            with engine.begin() as connection:
                report_id = connection.execute(select(Report.id).where(Report.record_id == record_id)).scalar_one_or_none()
                if report_id:
                    connection.execute(delete(AuditLog).where(AuditLog.entity_id == record_id))
                    connection.execute(delete(AdminAction).where(AdminAction.report_id == report_id))
                    connection.execute(delete(EventReport).where(EventReport.report_id == report_id))
                    connection.execute(delete(Report).where(Report.id == report_id))
                connection.execute(delete(WeatherEvent).where(WeatherEvent.event_id == f"EVT-{record_id}"))


def test_postgres_seed_creates_twelve_events_with_three_pending_near_target(postgres_client: TestClient) -> None:
    prefix = "VAANKAN-SAMPLE-20260929-"
    try:
        seeded = postgres_client.post("/api/admin/sample-events")
        assert seeded.status_code == 200
        assert seeded.json()["created_count"] == 12

        reports = postgres_client.get("/api/reports", params={"limit": 500}).json()
        samples = [report for report in reports if report["record_id"].startswith(prefix)]
        assert len(samples) == 12
        pending = [report for report in samples if report["verification_status"] == "PENDING"]
        assert len(pending) == 5
        assert all(not report["submitted"] for report in samples)

        nearby = postgres_client.get("/api/reports/nearby", params={
            "latitude": 12.8981,
            "longitude": 80.1576,
            "radius_km": 10,
            "verification_status": "PENDING",
        }).json()
        assert len([report for report in nearby if report["record_id"].startswith(prefix)]) == 3

        retried = postgres_client.post("/api/admin/sample-events")
        assert retried.status_code == 200
        assert retried.json()["created_count"] == 0
        assert retried.json()["existing_count"] == 12
    finally:
        engine = get_configured_engine()
        if engine:
            record_ids = [f"{prefix}{index:02d}" for index in range(1, 13)]
            with engine.begin() as connection:
                report_ids = list(connection.scalars(select(Report.id).where(Report.record_id.in_(record_ids))))
                if report_ids:
                    connection.execute(delete(Report).where(Report.id.in_(report_ids)))


def test_postgres_submit_creates_one_alert_and_sends_after_verification_only(postgres_client: TestClient, monkeypatch) -> None:
    email = f"submit-{uuid4().hex}@example.test"
    record_id = f"PGSUBMIT-{uuid4().hex}"
    delivered: list[str] = []
    monkeypatch.setattr(main_module, "send_email_service", lambda **kwargs: (delivered.append(kwargs["recipient"]) or "sent", None))
    try:
        registered = postgres_client.post("/api/auth/citizen/register", json={
            "name": "Nearby Integration Citizen",
            "email": email,
            "password": "test-password-123",
            "address": "Medavakkam, Chennai",
            "phone": "+919999000001",
            "government_id": f"PG-{uuid4().hex[:24]}",
        })
        assert registered.status_code == 201
        delivered.clear()
        profile = postgres_client.patch(
            "/api/citizen/profile",
            headers={"X-Citizen-Id": email},
            json={"latitude": 12.8981, "longitude": 80.1576},
        )
        assert profile.status_code == 200

        created = postgres_client.post("/api/reports", json={
            "record_id": record_id,
            "source_type": "citizen",
            "source_name": email,
            "citizen_id": email,
            "timestamp": "2026-09-29T10:00:00Z",
            "text": "Flooding reported near the integration test location.",
            "language": "en",
            "latitude": 12.8981,
            "longitude": 80.1576,
            "city": "Chennai",
            "district": "Chennai",
            "state": "Tamil Nadu",
            "event_type_claimed": "flooding",
            "verification_status": "PENDING",
        })
        assert created.status_code == 201

        verified = postgres_client.post(f"/api/admin/reports/{record_id}/verify", json={"status": "VERIFIED", "reason": "PostGIS integration test verified"})
        assert verified.status_code == 200
        assert verified.json()["submitted"] is False
        assert delivered == []

        submitted = postgres_client.post(f"/api/admin/reports/{record_id}/submit-to-vayu")
        assert submitted.status_code == 200
        result = submitted.json()
        assert result["status"] == "VERIFIED"
        assert result["submitted"] is True
        assert result["notified_count"] == 1
        assert delivered == [email]

        stored = postgres_client.get(f"/api/reports/{record_id}").json()
        assert stored["verification_status"] == "VERIFIED"
        assert stored["submitted"] is True
        citizen_alerts = postgres_client.get("/api/citizen/alerts", params={"citizen_id": email}).json()
        assert any(alert["report_id"] == record_id for alert in citizen_alerts)
        postgres_client.get("/api/citizen/alerts", params={"citizen_id": email})
        assert delivered == [email]
        retry = postgres_client.post(f"/api/admin/reports/{record_id}/submit-to-vayu")
        assert retry.status_code == 409
        assert delivered == [email]
    finally:
        engine = get_configured_engine()
        if engine:
            with engine.begin() as connection:
                report_id = connection.execute(select(Report.id).where(Report.record_id == record_id)).scalar_one_or_none()
                user_id = connection.execute(select(User.id).where(User.email == email)).scalar_one_or_none()
                if report_id:
                    alert_ids = list(connection.scalars(select(Alert.id).where(Alert.source_report_id == report_id)))
                    if alert_ids:
                        connection.execute(delete(Notification).where(Notification.alert_id.in_(alert_ids)))
                        connection.execute(delete(CitizenActivity).where(CitizenActivity.related_id.in_([str(alert_id) for alert_id in alert_ids])))
                        connection.execute(delete(Alert).where(Alert.id.in_(alert_ids)))
                    connection.execute(delete(AdminAction).where(AdminAction.report_id == report_id))
                    connection.execute(delete(AuditLog).where(AuditLog.entity_id == record_id))
                    connection.execute(delete(Report).where(Report.id == report_id))
                if user_id:
                    connection.execute(delete(Notification).where(Notification.user_id == user_id))
                    connection.execute(delete(CitizenActivity).where(CitizenActivity.citizen_id.in_([str(user_id), email])))
                    connection.execute(delete(User).where(User.id == user_id))