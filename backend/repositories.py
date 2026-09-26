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
            provenance={"source_name": report.source_name},
        )
        self.session.add(record)
        self.session.flush()
        return record

    def get_by_record_id(self, record_id: str) -> ReportModel | None:
        statement = select(ReportModel).where(ReportModel.record_id == record_id)
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
            address=profile.get("address"),
            latitude=float(profile.get("latitude", 11.75)),
            longitude=float(profile.get("longitude", 79.76)),
            location=WKTElement(
                f"POINT({float(profile.get('longitude', 79.76))} {float(profile.get('latitude', 11.75))})",
                srid=4326,
            ),
        )
        self.session.add(user)
        self.session.flush()
        return user

    def get_by_email(self, email: str) -> UserModel | None:
        return self.session.scalars(select(UserModel).where(UserModel.email == email)).first()

    def nearby_citizens(self, latitude: float, longitude: float, radius_meters: float) -> list[dict[str, Any]]:
        profile_location = cast(CitizenProfile.location, Geography(srid=4326))
        center = point_geography(latitude, longitude)
        distance = func.ST_Distance(profile_location, center)
        statement = (
            select(UserModel.email, UserModel.display_name, CitizenProfile.phone, distance.label("distance_m"))
            .join(CitizenProfile, CitizenProfile.user_id == UserModel.id)
            .where(func.ST_DWithin(profile_location, center, radius_meters))
            .order_by(distance)
        )
        return [
            {
                "email": email,
                "name": name,
                "phone": phone or "",
                "distance_km": round(distance_m / 1000, 2),
            }
            for email, name, phone, distance_m in self.session.execute(statement)
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