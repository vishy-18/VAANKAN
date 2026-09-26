from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from geoalchemy2 import Geometry
from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Table,
    Text,
    Uuid,
    Column,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


JSON_DOCUMENT = JSON().with_variant(JSONB, "postgresql")


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


user_roles = Table(
    "user_roles",
    Base.metadata,
    Column("user_id", Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("role_id", Uuid(as_uuid=True), ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
)


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(160))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    roles: Mapped[list[Role]] = relationship(secondary=user_roles, back_populates="users")
    citizen_profile: Mapped[CitizenProfile | None] = relationship(back_populates="user", uselist=False)


class Role(TimestampMixin, Base):
    __tablename__ = "roles"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(64), unique=True)
    users: Mapped[list[User]] = relationship(secondary=user_roles, back_populates="roles")


class CitizenProfile(TimestampMixin, Base):
    __tablename__ = "citizen_profiles"
    __table_args__ = (
        Index("idx_citizen_profiles_location_geography", text("(location::geography)"), postgresql_using="gist"),
    )

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    phone: Mapped[str | None] = mapped_column(String(32))
    address: Mapped[str | None] = mapped_column(Text)
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    location: Mapped[Any | None] = mapped_column(Geometry("POINT", srid=4326, spatial_index=True))
    gps_consent: Mapped[bool] = mapped_column(Boolean, default=False)
    user: Mapped[User] = relationship(back_populates="citizen_profile")


class Report(TimestampMixin, Base):
    __tablename__ = "reports"
    __table_args__ = (
        Index("ix_reports_source_type_timestamp", "source_type", "source_timestamp"),
        Index("ix_reports_status_timestamp", "verification_status", "source_timestamp"),
        Index("idx_reports_location_geography", text("(location::geography)"), postgresql_using="gist"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    record_id: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    source_type: Mapped[str] = mapped_column(String(48), index=True)
    source_name: Mapped[str] = mapped_column(String(160))
    source_id: Mapped[str | None] = mapped_column(String(255))
    source_url: Mapped[str | None] = mapped_column(Text)
    source_timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    text: Mapped[str] = mapped_column(Text)
    language: Mapped[str] = mapped_column(String(16))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    location: Mapped[Any | None] = mapped_column(Geometry("POINT", srid=4326, spatial_index=True))
    city: Mapped[str] = mapped_column(String(120))
    district: Mapped[str] = mapped_column(String(120), index=True)
    state: Mapped[str] = mapped_column(String(120), index=True)
    event_type_claimed: Mapped[str] = mapped_column(String(48), index=True)
    verification_status: Mapped[str] = mapped_column(String(32), default="PENDING", index=True)
    content_hash: Mapped[str | None] = mapped_column(String(64), index=True)
    provenance: Mapped[dict[str, Any]] = mapped_column(JSON_DOCUMENT, default=dict)


class Media(TimestampMixin, Base):
    __tablename__ = "media"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    report_id: Mapped[UUID] = mapped_column(ForeignKey("reports.id", ondelete="CASCADE"), index=True)
    media_type: Mapped[str] = mapped_column(String(16))
    storage_key: Mapped[str] = mapped_column(Text)
    mime_type: Mapped[str] = mapped_column(String(120))
    size_bytes: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    perceptual_hash: Mapped[str | None] = mapped_column(String(128), index=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON_DOCUMENT, default=dict)


class VerificationResult(TimestampMixin, Base):
    __tablename__ = "verification_results"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    report_id: Mapped[UUID] = mapped_column(ForeignKey("reports.id", ondelete="CASCADE"), index=True)
    engine: Mapped[str] = mapped_column(String(64))
    model_version_id: Mapped[UUID | None] = mapped_column(ForeignKey("model_versions.id"))
    status: Mapped[str] = mapped_column(String(32), index=True)
    final_score: Mapped[float | None] = mapped_column(Float)
    processed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    result_metadata: Mapped[dict[str, Any]] = mapped_column(JSON_DOCUMENT, default=dict)


class VerificationEvidence(TimestampMixin, Base):
    __tablename__ = "verification_evidence"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    verification_result_id: Mapped[UUID] = mapped_column(ForeignKey("verification_results.id", ondelete="CASCADE"), index=True)
    evidence_type: Mapped[str] = mapped_column(String(64), index=True)
    score: Mapped[float | None] = mapped_column(Float)
    explanation: Mapped[str] = mapped_column(Text)
    evidence_metadata: Mapped[dict[str, Any]] = mapped_column(JSON_DOCUMENT, default=dict)


class GroundObservation(TimestampMixin, Base):
    __tablename__ = "ground_observations"
    __table_args__ = (
        Index("idx_ground_observations_location_geography", text("(location::geography)"), postgresql_using="gist"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    observation_id: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    report_id: Mapped[UUID] = mapped_column(ForeignKey("reports.id", ondelete="CASCADE"), unique=True, index=True)
    source: Mapped[str] = mapped_column(String(32), default="ADMIN_REVIEW")
    event_type: Mapped[str] = mapped_column(String(48), index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    location: Mapped[Any | None] = mapped_column(Geometry("POINT", srid=4326, spatial_index=True))
    city: Mapped[str] = mapped_column(String(120))
    district: Mapped[str] = mapped_column(String(120), index=True)
    state: Mapped[str] = mapped_column(String(120), index=True)
    verification_status: Mapped[str] = mapped_column(String(32), default="VERIFIED")
    verification_method: Mapped[str] = mapped_column(String(32), default="admin")
    verification_confidence: Mapped[float | None] = mapped_column(Float)


class WeatherSource(TimestampMixin, Base):
    __tablename__ = "weather_sources"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    source_type: Mapped[str] = mapped_column(String(48), index=True)
    source_url: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(24), default="NOT_CONFIGURED")
    last_success_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON_DOCUMENT, default=dict)


class WeatherStation(TimestampMixin, Base):
    __tablename__ = "weather_stations"
    __table_args__ = (
        Index("idx_weather_stations_location_geography", text("(location::geography)"), postgresql_using="gist"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    station_id: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(160))
    source_id: Mapped[UUID | None] = mapped_column(ForeignKey("weather_sources.id"))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    location: Mapped[Any | None] = mapped_column(Geometry("POINT", srid=4326, spatial_index=True))
    city: Mapped[str | None] = mapped_column(String(120))
    district: Mapped[str] = mapped_column(String(120), index=True)
    state: Mapped[str] = mapped_column(String(120), index=True)
    status: Mapped[str] = mapped_column(String(24), default="DEMO")


class WeatherObservation(TimestampMixin, Base):
    __tablename__ = "weather_observations"
    __table_args__ = (Index("ix_weather_observation_station_time", "station_id", "source_timestamp"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    observation_id: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    station_id: Mapped[UUID | None] = mapped_column(ForeignKey("weather_stations.id"), index=True)
    source_id: Mapped[UUID | None] = mapped_column(ForeignKey("weather_sources.id"), index=True)
    source_timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    location: Mapped[Any | None] = mapped_column(Geometry("POINT", srid=4326, spatial_index=True))
    temperature_c: Mapped[float | None] = mapped_column(Float)
    feels_like_c: Mapped[float | None] = mapped_column(Float)
    humidity_percent: Mapped[float | None] = mapped_column(Float)
    rainfall_mm: Mapped[float | None] = mapped_column(Float)
    rainfall_1h_mm: Mapped[float | None] = mapped_column(Float)
    rainfall_3h_mm: Mapped[float | None] = mapped_column(Float)
    rainfall_24h_mm: Mapped[float | None] = mapped_column(Float)
    wind_speed_kmh: Mapped[float | None] = mapped_column(Float)
    wind_direction_deg: Mapped[float | None] = mapped_column(Float)
    wind_gust_kmh: Mapped[float | None] = mapped_column(Float)
    pressure_hpa: Mapped[float | None] = mapped_column(Float)
    cloud_cover_percent: Mapped[float | None] = mapped_column(Float)
    visibility_km: Mapped[float | None] = mapped_column(Float)
    dew_point_c: Mapped[float | None] = mapped_column(Float)
    historical_rainfall_avg: Mapped[float | None] = mapped_column(Float)
    historical_temperature_avg: Mapped[float | None] = mapped_column(Float)
    rainfall_anomaly: Mapped[float | None] = mapped_column(Float)
    temperature_anomaly: Mapped[float | None] = mapped_column(Float)
    wind_anomaly: Mapped[float | None] = mapped_column(Float)
    pressure_anomaly: Mapped[float | None] = mapped_column(Float)
    visibility_anomaly: Mapped[float | None] = mapped_column(Float)
    weather_anomaly_score: Mapped[float | None] = mapped_column(Float)
    quality_status: Mapped[str] = mapped_column(String(32), default="MISSING", index=True)
    provenance: Mapped[dict[str, Any]] = mapped_column(JSON_DOCUMENT, default=dict)


class WeatherEvent(TimestampMixin, Base):
    __tablename__ = "weather_events"
    __table_args__ = (
        Index("ix_weather_event_status_updated", "status", "last_updated_at"),
        Index("idx_weather_events_geometry_geography", text("(geometry::geography)"), postgresql_using="gist"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    event_id: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    event_type: Mapped[str] = mapped_column(String(48), index=True)
    title: Mapped[str] = mapped_column(String(240))
    center_latitude: Mapped[float] = mapped_column(Float)
    center_longitude: Mapped[float] = mapped_column(Float)
    geometry: Mapped[Any | None] = mapped_column(Geometry("GEOMETRY", srid=4326, spatial_index=True))
    state: Mapped[str] = mapped_column(String(120), index=True)
    district: Mapped[str] = mapped_column(String(120), index=True)
    city: Mapped[str | None] = mapped_column(String(120))
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    last_updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    end_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(32), index=True)
    severity: Mapped[str] = mapped_column(String(32), default="UNASSESSED")
    affected_radius_km: Mapped[float | None] = mapped_column(Float)
    anomaly_score: Mapped[float | None] = mapped_column(Float)
    event_confidence: Mapped[float | None] = mapped_column(Float)
    severity_score: Mapped[float | None] = mapped_column(Float)
    verified_report_count: Mapped[int] = mapped_column(Integer, default=0)
    suspicious_report_count: Mapped[int] = mapped_column(Integer, default=0)
    source_count: Mapped[int] = mapped_column(Integer, default=0)
    meteorological_evidence: Mapped[dict[str, Any]] = mapped_column(JSON_DOCUMENT, default=dict)
    ground_evidence: Mapped[dict[str, Any]] = mapped_column(JSON_DOCUMENT, default=dict)
    provenance: Mapped[dict[str, Any]] = mapped_column(JSON_DOCUMENT, default=dict)


class EventReport(TimestampMixin, Base):
    __tablename__ = "event_reports"

    event_id: Mapped[UUID] = mapped_column(ForeignKey("weather_events.id", ondelete="CASCADE"), primary_key=True)
    report_id: Mapped[UUID] = mapped_column(ForeignKey("reports.id", ondelete="CASCADE"), primary_key=True)
    relation_type: Mapped[str] = mapped_column(String(32), default="VERIFIED_EVIDENCE")


class EventCluster(TimestampMixin, Base):
    __tablename__ = "event_clusters"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    event_id: Mapped[UUID] = mapped_column(ForeignKey("weather_events.id", ondelete="CASCADE"), index=True)
    cluster_key: Mapped[str] = mapped_column(String(180), index=True)
    algorithm: Mapped[str] = mapped_column(String(80))
    parameters: Mapped[dict[str, Any]] = mapped_column(JSON_DOCUMENT, default=dict)


class EventTimeline(TimestampMixin, Base):
    __tablename__ = "event_timeline"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    event_id: Mapped[UUID] = mapped_column(ForeignKey("weather_events.id", ondelete="CASCADE"), index=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    event: Mapped[str] = mapped_column(String(80), index=True)
    description: Mapped[str] = mapped_column(Text)
    actor_type: Mapped[str] = mapped_column(String(32), default="SYSTEM")
    actor_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id"))
    details: Mapped[dict[str, Any]] = mapped_column(JSON_DOCUMENT, default=dict)


class Alert(TimestampMixin, Base):
    __tablename__ = "alerts"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    event_id: Mapped[UUID | None] = mapped_column(ForeignKey("weather_events.id"), index=True)
    title: Mapped[str] = mapped_column(String(240))
    body: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), default="DRAFT", index=True)
    audience_radius_km: Mapped[float | None] = mapped_column(Float)
    provenance: Mapped[dict[str, Any]] = mapped_column(JSON_DOCUMENT, default=dict)


class Notification(TimestampMixin, Base):
    __tablename__ = "notifications"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    alert_id: Mapped[UUID | None] = mapped_column(ForeignKey("alerts.id"), index=True)
    user_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id"), index=True)
    channel: Mapped[str] = mapped_column(String(24), index=True)
    recipient: Mapped[str] = mapped_column(String(320))
    status: Mapped[str] = mapped_column(String(32), index=True)
    provider_message_id: Mapped[str | None] = mapped_column(String(255))
    error: Mapped[str | None] = mapped_column(Text)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ModelVersion(TimestampMixin, Base):
    __tablename__ = "model_versions"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    engine: Mapped[str] = mapped_column(String(64), index=True)
    version: Mapped[str] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(32), default="NOT_TRAINED")
    artifact_uri: Mapped[str | None] = mapped_column(Text)
    configuration: Mapped[dict[str, Any]] = mapped_column(JSON_DOCUMENT, default=dict)


class ModelMetric(TimestampMixin, Base):
    __tablename__ = "model_metrics"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    model_version_id: Mapped[UUID] = mapped_column(ForeignKey("model_versions.id", ondelete="CASCADE"), index=True)
    metric_name: Mapped[str] = mapped_column(String(80))
    metric_value: Mapped[float] = mapped_column(Float)
    evaluation_dataset: Mapped[str] = mapped_column(String(160))
    evaluated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PredictionLog(TimestampMixin, Base):
    __tablename__ = "prediction_logs"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    model_version_id: Mapped[UUID | None] = mapped_column(ForeignKey("model_versions.id"), index=True)
    entity_type: Mapped[str] = mapped_column(String(40), index=True)
    entity_id: Mapped[str] = mapped_column(String(128), index=True)
    prediction: Mapped[dict[str, Any]] = mapped_column(JSON_DOCUMENT)
    processed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AdminAction(TimestampMixin, Base):
    __tablename__ = "admin_actions"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    admin_user_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id"), index=True)
    report_id: Mapped[UUID | None] = mapped_column(ForeignKey("reports.id"), index=True)
    action: Mapped[str] = mapped_column(String(64), index=True)
    previous_status: Mapped[str | None] = mapped_column(String(32))
    new_status: Mapped[str | None] = mapped_column(String(32))
    reason: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)


class AuditLog(TimestampMixin, Base):
    __tablename__ = "audit_logs"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    actor_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id"), index=True)
    action: Mapped[str] = mapped_column(String(100), index=True)
    entity_type: Mapped[str] = mapped_column(String(64), index=True)
    entity_id: Mapped[str] = mapped_column(String(128), index=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    request_id: Mapped[str | None] = mapped_column(String(128), index=True)
    details: Mapped[dict[str, Any]] = mapped_column(JSON_DOCUMENT, default=dict)