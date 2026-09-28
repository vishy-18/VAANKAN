from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
from typing import Any
from uuid import UUID

from geoalchemy2 import Geography, WKTElement
from sqlalchemy import cast, delete, func, select
from sqlalchemy.orm import Session

from .models import AdminAction, AuditLog, CitizenProfile, GroundObservation as GroundObservationModel
from .models import User as UserModel
from .models import VerificationEvidence, VerificationResult
from .models import Report as ReportModel
from .models import WeatherEvent as WeatherEventModel
from .models import WeatherObservation as WeatherObservationModel
from .models import WeatherSource as WeatherSourceModel
from .models import WeatherStation as WeatherStationModel
from .schemas import CommonReport


def point_geography(latitude: float, longitude: float):
    point = func.ST_SetSRID(func.ST_MakePoint(longitude, latitude), 4326)
    return cast(point, Geography(srid=4326))


class ReportRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, report: CommonReport) -> ReportModel:
        record = ReportModel(
            record_id=report.record_id,
            source_type=report.source_type.value,
            source_name=report.source_name,
            source_timestamp=report.timestamp,
            text=report.text,
            language=report.language,
            latitude=report.latitude,
            longitude=report.longitude,
            location=WKTElement(f"POINT({report.longitude} {report.latitude})", srid=4326),
            city=report.city,
            district=report.district,
            state=report.state,
            event_type_claimed=report.event_type_claimed.value,
            verification_status=report.verification_status.value,
            submitted=report.submitted,
            submitted_at=report.submitted_at,
            provenance={"source_name": report.source_name, "citizen_id": report.citizen_id},
        )
        self.session.add(record)
        self.session.flush()
        return record

    def get_by_record_id(self, record_id: str, *, for_update: bool = False) -> ReportModel | None:
        statement = select(ReportModel).where(ReportModel.record_id == record_id)
        if for_update:
            statement = statement.with_for_update()
        return self.session.scalars(statement).first()

    def get_by_id(self, report_uuid: UUID) -> ReportModel | None:
        return self.session.get(ReportModel, report_uuid)

    def list(
        self,
        *,
        verification_status: str | None = None,
        event_type: str | None = None,
        region: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[ReportModel]:
        statement = select(ReportModel)
        if verification_status:
            statement = statement.where(ReportModel.verification_status == verification_status)
        if event_type:
            statement = statement.where(ReportModel.event_type_claimed == event_type)
        if region:
            statement = statement.where(
                (ReportModel.state.ilike(region))
                | (ReportModel.district.ilike(region))
                | (ReportModel.city.ilike(region))
            )
        statement = statement.order_by(ReportModel.source_timestamp.desc()).limit(limit).offset(offset)
        return list(self.session.scalars(statement))

    def list_for_citizen(self, citizen_id: str, *, limit: int = 100, offset: int = 0) -> list[ReportModel]:
        statement = (
            select(ReportModel)
            .where(
                (ReportModel.provenance["citizen_id"].as_string() == citizen_id)
                | (ReportModel.source_name == f"Citizen • {citizen_id}")
            )
            .order_by(ReportModel.source_timestamp.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(self.session.scalars(statement))

    @staticmethod
    def within_radius_statement(latitude: float, longitude: float, radius_meters: float):
        center = point_geography(latitude, longitude)
        location = cast(ReportModel.location, Geography(srid=4326))
        return select(ReportModel).where(func.ST_DWithin(location, center, radius_meters))

    def within_radius(
        self,
        latitude: float,
        longitude: float,
        radius_meters: float,
        *,
        verification_status: str | None = None,
        event_type: str | None = None,
        limit: int = 100,
    ) -> list[ReportModel]:
        statement = self.within_radius_statement(latitude, longitude, radius_meters)
        if verification_status:
            statement = statement.where(ReportModel.verification_status == verification_status)
        if event_type:
            statement = statement.where(ReportModel.event_type_claimed == event_type)
        distance = func.ST_Distance(
            cast(ReportModel.location, Geography(srid=4326)),
            point_geography(latitude, longitude),
        )
        return list(self.session.scalars(statement.order_by(distance).limit(limit)))

    def update_status(self, record: ReportModel, status: str) -> None:
        record.verification_status = status
        record.processed_at = datetime.now(timezone.utc)


class WeatherStationRepository:
    @staticmethod
    def nearest_station_statement(latitude: float, longitude: float):
        center = point_geography(latitude, longitude)
        location = cast(WeatherStationModel.location, Geography(srid=4326))
        return (
            select(WeatherStationModel)
            .order_by(func.ST_Distance(location, center))
            .limit(1)
        )


class WeatherEventRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get(self, event_id: str) -> WeatherEventModel | None:
        statement = select(WeatherEventModel).where(WeatherEventModel.event_id == event_id)
        return self.session.scalars(statement).first()

    def list(
        self,
        *,
        state: str | None = None,
        district: str | None = None,
        status: str | None = None,
        since: datetime | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[WeatherEventModel]:
        statement = select(WeatherEventModel)
        if state:
            statement = statement.where(WeatherEventModel.state == state)
        if district:
            statement = statement.where(WeatherEventModel.district == district)
        if status:
            statement = statement.where(WeatherEventModel.status == status)
        if since:
            statement = statement.where(WeatherEventModel.last_updated_at >= since)
        statement = statement.order_by(WeatherEventModel.last_updated_at.desc()).limit(limit).offset(offset)
        return list(self.session.scalars(statement))


class SpatialEventRepository:
    @staticmethod
    def events_within_radius_statement(latitude: float, longitude: float, radius_meters: float):
        center = point_geography(latitude, longitude)
        geometry = cast(WeatherEventModel.geometry, Geography(srid=4326))
        return select(WeatherEventModel).where(func.ST_DWithin(geometry, center, radius_meters))


class UserRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add_citizen(self, email: str, password: str, **profile: Any) -> UserModel:
        user = UserModel(
            email=email,
            password_hash=sha256(password.encode()).hexdigest(),
            display_name=str(profile.get("name", "Citizen")),
        )
        user.citizen_profile = CitizenProfile(
            phone=profile.get("phone"),
            government_id=profile.get("government_id"),
            address=profile.get("address"),
            latitude=float(profile["latitude"]) if profile.get("latitude") is not None else None,
            longitude=float(profile["longitude"]) if profile.get("longitude") is not None else None,
            location=(
                WKTElement(f"POINT({float(profile['longitude'])} {float(profile['latitude'])})", srid=4326)
                if profile.get("latitude") is not None and profile.get("longitude") is not None
                else None
            ),
        )
        self.session.add(user)
        self.session.flush()
        return user

    def get_by_email(self, email: str) -> UserModel | None:
        return self.session.scalars(select(UserModel).where(UserModel.email == email)).first()

    def update_citizen_profile(self, identifier: str, updates: dict[str, Any]) -> UserModel | None:
        try:
            user = self.session.get(UserModel, UUID(identifier))
        except ValueError:
            user = self.get_by_email(identifier)
        if user is None or user.citizen_profile is None:
            return None
        profile = user.citizen_profile
        if "name" in updates:
            user.display_name = str(updates["name"])
        for field in ("phone", "address", "government_id"):
            if field in updates:
                setattr(profile, field, updates[field])
        if "latitude" in updates or "longitude" in updates:
            latitude = updates.get("latitude")
            longitude = updates.get("longitude")
            if latitude is None or longitude is None:
                profile.latitude = None
                profile.longitude = None
                profile.location = None
            else:
                profile.latitude = float(latitude)
                profile.longitude = float(longitude)
                profile.location = WKTElement(f"POINT({profile.longitude} {profile.latitude})", srid=4326)
                profile.gps_consent = True
        self.session.flush()
        return user

    def nearby_citizens(self, latitude: float, longitude: float, radius_meters: float) -> list[dict[str, Any]]:
        profile_location = cast(CitizenProfile.location, Geography(srid=4326))
        center = point_geography(latitude, longitude)
        distance = func.ST_Distance(profile_location, center)
        statement = (
            select(UserModel.id, UserModel.email, UserModel.display_name, CitizenProfile.phone, distance.label("distance_m"))
            .join(CitizenProfile, CitizenProfile.user_id == UserModel.id)
            .where(CitizenProfile.gps_consent.is_(True))
            .where(func.ST_DWithin(profile_location, center, radius_meters))
            .order_by(distance)
        )
        return [
            {
                "user_id": str(user_id),
                "email": email,
                "name": name,
                "phone": phone or "",
                "distance_km": round(distance_m / 1000, 2),
            }
            for user_id, email, name, phone, distance_m in self.session.execute(statement)
        ]


class VerificationRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add_result(
        self,
        report: ReportModel,
        *,
        engine: str,
        status: str,
        score: float | None,
        result_metadata: dict[str, Any],
    ) -> VerificationResult:
        result = VerificationResult(
            report_id=report.id,
            engine=engine,
            status=status,
            final_score=score,
            result_metadata=result_metadata,
        )
        self.session.add(result)
        self.session.flush()
        return result

    def add_evidence(
        self,
        result: VerificationResult,
        *,
        evidence_type: str,
        score: float | None,
        explanation: str,
        metadata: dict[str, Any] | None = None,
    ) -> VerificationEvidence:
        evidence = VerificationEvidence(
            verification_result_id=result.id,
            evidence_type=evidence_type,
            score=score,
            explanation=explanation,
            evidence_metadata=metadata or {},
        )
        self.session.add(evidence)
        return evidence


class AuditRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def record_admin_decision(
        self,
        *,
        report: ReportModel,
        previous_status: str,
        new_status: str,
        reason: str,
        operator: str,
        notified_users: list[dict[str, Any]],
        email_status: str,
    ) -> AuditLog:
        details = {
            "previous_status": previous_status,
            "new_status": new_status,
            "reason": reason,
            "operator": operator,
            "notified_users": notified_users,
            "email_status": email_status,
            "report_title": report.text,
            "location": f"{report.city}, {report.district}, {report.state}",
            "event_type": report.event_type_claimed,
        }
        self.session.add(
            AdminAction(
                report_id=report.id,
                action="verification_decision",
                previous_status=previous_status,
                new_status=new_status,
                reason=reason,
                notes=operator,
            )
        )
        audit = AuditLog(
            action="verification_decision",
            entity_type="report",
            entity_id=report.record_id,
            details=details,
        )
        self.session.add(audit)
        self.session.flush()
        return audit

    def list(self, limit: int = 500) -> list[AuditLog]:
        statement = select(AuditLog).order_by(AuditLog.occurred_at.desc()).limit(limit)
        return list(self.session.scalars(statement))


class GroundObservationRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def replace_from_verified_report(self, report: ReportModel) -> GroundObservationModel:
        existing = self.session.scalars(
            select(GroundObservationModel).where(GroundObservationModel.report_id == report.id)
        ).first()
        if existing:
            return existing
        observation = GroundObservationModel(
            observation_id=f"GO-{report.record_id}",
            report_id=report.id,
            source="ADMIN_REVIEW",
            event_type=report.event_type_claimed,
            timestamp=report.source_timestamp,
            latitude=report.latitude,
            longitude=report.longitude,
            location=WKTElement(f"POINT({report.longitude} {report.latitude})", srid=4326),
            city=report.city,
            district=report.district,
            state=report.state,
            verification_status="VERIFIED",
            verification_method="admin",
        )
        self.session.add(observation)
        self.session.flush()
        return observation

    def remove_for_report(self, report: ReportModel) -> None:
        self.session.execute(delete(GroundObservationModel).where(GroundObservationModel.report_id == report.id))

    def list(self, limit: int = 500) -> list[GroundObservationModel]:
        statement = select(GroundObservationModel).order_by(GroundObservationModel.timestamp.desc()).limit(limit)
        return list(self.session.scalars(statement))

    @staticmethod
    def nearby_statement(latitude: float, longitude: float, radius_meters: float, event_type: str, district: str, state: str):
        location = cast(GroundObservationModel.location, Geography(srid=4326))
        return select(GroundObservationModel).where(
            GroundObservationModel.event_type == event_type,
            GroundObservationModel.district == district,
            GroundObservationModel.state == state,
            func.ST_DWithin(location, point_geography(latitude, longitude), radius_meters),
        )


class WeatherObservationRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def upsert_many(self, observations: list[dict[str, Any]]) -> int:
        source = self.session.scalars(
            select(WeatherSourceModel).where(WeatherSourceModel.name == "Open-Meteo")
        ).first()
        if source is None:
            source = WeatherSourceModel(
                name="Open-Meteo",
                source_type="WEATHER_MODEL",
                source_url="https://api.open-meteo.com/v1/forecast",
                status="LIVE",
                metadata_json={"provider_is_meteorological_model": True},
            )
            self.session.add(source)
            self.session.flush()

        for data in observations:
            source.status = "DEGRADED" if data.get("data_mode") == "FALLBACK" else "LIVE"
            source.last_success_at = data.get("timestamp")
            station_id = str(data["observation_id"]).split(":")[1]
            station = self.session.scalars(
                select(WeatherStationModel).where(WeatherStationModel.station_id == f"open-meteo:{station_id}")
            ).first()
            if station is None:
                station = WeatherStationModel(
                    station_id=f"open-meteo:{station_id}",
                    name=str(data.get("city") or station_id),
                    source_id=source.id,
                    latitude=float(data["latitude"]),
                    longitude=float(data["longitude"]),
                    location=WKTElement(f"POINT({data['longitude']} {data['latitude']})", srid=4326),
                    city=data.get("city"),
                    district=str(data.get("district") or "Unknown"),
                    state=str(data.get("state") or "Unknown"),
                    status="DEMO" if data.get("data_mode") == "FALLBACK" else "LIVE",
                )
                self.session.add(station)
                self.session.flush()
            else:
                station.source_id = source.id
                station.status = "DEMO" if data.get("data_mode") == "FALLBACK" else "LIVE"

            record = self.session.scalars(
                select(WeatherObservationModel).where(WeatherObservationModel.observation_id == data["observation_id"])
            ).first()
            if record is None:
                record = WeatherObservationModel(
                    observation_id=data["observation_id"],
                    station_id=station.id,
                    source_id=source.id,
                    source_timestamp=data["timestamp"],
                    latitude=float(data["latitude"]),
                    longitude=float(data["longitude"]),
                    location=WKTElement(f"POINT({data['longitude']} {data['latitude']})", srid=4326),
                )
                self.session.add(record)
            record.station_id = station.id
            record.source_id = source.id
            record.source_timestamp = data["timestamp"]
            record.processed_at = data.get("ingested_at")
            record.latitude = float(data["latitude"])
            record.longitude = float(data["longitude"])
            record.location = WKTElement(f"POINT({data['longitude']} {data['latitude']})", srid=4326)
            record.temperature_c = data.get("temperature_c")
            record.feels_like_c = data.get("feels_like_c")
            record.humidity_percent = data.get("humidity_percent")
            record.rainfall_mm = data.get("rainfall_mm")
            record.rainfall_1h_mm = data.get("rainfall_1h_mm")
            record.rainfall_3h_mm = data.get("rainfall_3h_mm")
            record.rainfall_24h_mm = data.get("rainfall_24h_mm")
            record.wind_speed_kmh = data.get("wind_speed_kmh")
            record.wind_direction_deg = data.get("wind_direction_deg")
            record.wind_gust_kmh = data.get("wind_gust_kmh")
            record.pressure_hpa = data.get("pressure_hpa")
            record.cloud_cover_percent = data.get("cloud_cover_percent")
            record.visibility_km = data.get("visibility_km")
            record.dew_point_c = data.get("dew_point_c")
            record.historical_rainfall_avg = data.get("historical_rainfall_avg_mm")
            record.historical_temperature_avg = data.get("historical_temperature_avg_c")
            record.rainfall_anomaly = data.get("rainfall_anomaly_mm")
            record.temperature_anomaly = data.get("temperature_anomaly_c")
            record.wind_anomaly = data.get("wind_anomaly_kmh")
            record.visibility_anomaly = data.get("visibility_anomaly_km")
            record.weather_anomaly_score = data.get("weather_anomaly_score")
            record.quality_status = data.get("data_quality_flag", "UNKNOWN")
            record.provenance = {
                "source_id": "open-meteo",
                "source_type": "WEATHER_MODEL",
                "data_mode": data.get("data_mode", "UNKNOWN"),
                "source_units": data.get("source_units", {}),
                "weather_condition": data.get("weather_condition"),
                "precipitation_mm": data.get("precipitation_mm"),
                "historical_rainfall_daily_avg_mm": data.get("historical_rainfall_daily_avg_mm"),
                "historical_wind_speed_avg_kmh": data.get("historical_wind_speed_avg_kmh"),
                "historical_visibility_avg_km": data.get("historical_visibility_avg_km"),
                "rainfall_anomaly_ratio": data.get("rainfall_anomaly_ratio"),
                "anomaly_components": data.get("anomaly_components", {}),
                "freshness_status": data.get("freshness_status", "UNKNOWN"),
                "baseline_start_date": data.get("baseline_start_date").isoformat() if data.get("baseline_start_date") else None,
                "baseline_end_date": data.get("baseline_end_date").isoformat() if data.get("baseline_end_date") else None,
                "baseline_observation_days": data.get("baseline_observation_days", 0),
                "baseline_source": data.get("baseline_source"),
            }
        self.session.flush()
        return len(observations)

    def list(self, *, state: str | None = None, city: str | None = None, limit: int = 500) -> list[tuple[WeatherObservationModel, WeatherStationModel | None]]:
        statement = select(WeatherObservationModel, WeatherStationModel).outerjoin(
            WeatherStationModel, WeatherStationModel.id == WeatherObservationModel.station_id
        ).order_by(WeatherObservationModel.source_timestamp.desc())
        if state:
            statement = statement.where(WeatherStationModel.state == state)
        if city:
            statement = statement.where(WeatherStationModel.city == city)
        return list(self.session.execute(statement.limit(limit)))