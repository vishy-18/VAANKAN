from __future__ import annotations

import os
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import delete, select, text

from .database import get_configured_engine, get_configured_session_factory
from .main import app
from .models import AdminAction, AuditLog, EventReport, Report, VerificationResult, WeatherEvent


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