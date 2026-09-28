from collections.abc import Generator

from fastapi.testclient import TestClient
from sqlalchemy import Column, MetaData, String, Table, create_engine, insert, select
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import Session

from .database import get_database_session
from .main import app


def test_admin_database_table_read_redacts_secrets_and_deletes_rows(monkeypatch) -> None:
    monkeypatch.setenv("STORAGE_BACKEND", "postgres")
    monkeypatch.setenv("VAANKAN_ADMIN_DATABASE_KEY", "test-database-key")
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    metadata = MetaData()
    records = Table(
        "roles",
        metadata,
        Column("id", String, primary_key=True),
        Column("label", String),
        Column("password_hash", String),
    )
    metadata.create_all(engine)
    with engine.begin() as connection:
        connection.execute(insert(records), {"id": "record-1", "label": "example", "password_hash": "never-return-this"})

    def override_session() -> Generator[Session, None, None]:
        session = Session(engine)
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    app.dependency_overrides[get_database_session] = override_session
    client = TestClient(app)
    headers = {"x-admin-database-key": "test-database-key"}
    try:
        denied = client.get("/api/admin/database/tables")
        assert denied.status_code == 401

        tables = client.get("/api/admin/database/tables", headers=headers)
        assert tables.status_code == 200
        assert any(table["name"] == records.name for table in tables.json()["tables"])

        rows = client.get(f"/api/admin/database/tables/{records.name}/rows", headers=headers)
        assert rows.status_code == 200
        assert rows.json()["rows"][0]["label"] == "example"
        assert rows.json()["rows"][0]["password_hash"] == "[REDACTED]"

        deleted = client.request(
            "DELETE",
            f"/api/admin/database/tables/{records.name}/rows",
            headers=headers,
            json={"id": "record-1"},
        )
        assert deleted.status_code == 200
        with engine.connect() as connection:
            assert connection.scalar(select(records.c.id)) is None
    finally:
        app.dependency_overrides.pop(get_database_session, None)
        engine.dispose()