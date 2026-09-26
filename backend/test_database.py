from sqlalchemy import Uuid, create_engine
from sqlalchemy.engine import Engine

from .database import create_database_engine, create_session_factory, get_database_url
from .models import Base, Report, WeatherEvent, WeatherObservation, WeatherStation
from .repositories import GroundObservationRepository, ReportRepository, WeatherStationRepository


def test_database_is_opt_in_for_demo_mode(monkeypatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)

    assert get_database_url() is None
    assert create_database_engine() is None


def test_database_url_normalizes_legacy_postgres_scheme(monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgres://demo:secret@localhost/vaankan")

    assert get_database_url() == "postgresql+psycopg://demo:secret@localhost/vaankan"


def test_database_engine_and_session_factory_are_configurable() -> None:
    engine = create_database_engine("sqlite+pysqlite:///:memory:")

    assert isinstance(engine, Engine)
    assert create_session_factory(engine).kw["bind"] is engine
    engine.dispose()


def test_schema_contains_platform_domains_and_spatial_fields() -> None:
    expected_tables = {
        "users", "roles", "citizen_profiles", "reports", "media",
        "verification_results", "verification_evidence", "weather_sources",
        "weather_stations", "weather_observations", "ground_observations", "weather_events", "event_reports",
        "event_clusters", "event_timeline", "alerts", "notifications",
        "model_versions", "model_metrics", "prediction_logs", "admin_actions", "audit_logs",
    }

    assert expected_tables <= set(Base.metadata.tables)
    assert isinstance(Report.__table__.c.id.type, Uuid)
    for model in (Report, WeatherStation, WeatherObservation, WeatherEvent):
        geometry_column = "geometry" if model is WeatherEvent else "location"
        spatial_type = model.__table__.c[geometry_column].type
        assert spatial_type.srid == 4326

    for table in Base.metadata.tables.values():
        index_names = [index.name for index in table.indexes]
        assert len(index_names) == len(set(index_names))
    assert "idx_reports_location_geography" in {index.name for index in Report.__table__.indexes}


def test_sqlite_engine_can_exercise_non_spatial_metadata() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.tables["roles"].create(engine)
    with engine.connect() as connection:
        assert engine.dialect.has_table(connection, "roles")
    engine.dispose()


def test_spatial_queries_are_compiled_for_postgis() -> None:
    from sqlalchemy.dialects import postgresql

    radius_query = ReportRepository.within_radius_statement(12.95, 80.14, 10_000)
    nearest_query = WeatherStationRepository.nearest_station_statement(12.95, 80.14)
    radius_sql = str(radius_query.compile(dialect=postgresql.dialect()))
    nearest_sql = str(nearest_query.compile(dialect=postgresql.dialect()))

    assert "ST_DWithin" in radius_sql
    assert "ST_MakePoint" in radius_sql
    assert "ST_Distance" in nearest_sql
    assert "LIMIT" in nearest_sql

    ground_query = GroundObservationRepository.nearby_statement(
        12.95, 80.14, 10_000, "flooding", "Chennai", "Tamil Nadu"
    )
    ground_sql = str(ground_query.compile(dialect=postgresql.dialect()))
    assert "ST_DWithin" in ground_sql
    assert "geography" in ground_sql.lower()