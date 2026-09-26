from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
from typing import Any

from geoalchemy2 import WKTElement
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .models import EventReport, GroundObservation as GroundObservationModel
from .models import WeatherEvent as WeatherEventModel
from .repositories import (
    AuditRepository,
    GroundObservationRepository,
    ReportRepository,
    UserRepository,
    VerificationRepository,
    WeatherEventRepository,
)
from .models import Report as ReportModel
from .schemas import CommonReport, EventType, GroundObservation, SourceType, VerificationStatus, WeatherEvent


def report_schema(record: ReportModel) -> CommonReport:
    return CommonReport(
        record_id=record.record_id,
        source_type=SourceType(record.source_type),
        source_name=record.source_name,
        timestamp=record.source_timestamp,
        text=record.text,
        language=record.language,
        latitude=record.latitude,
        longitude=record.longitude,
        city=record.city,
        district=record.district,
        state=record.state,
        event_type_claimed=EventType(record.event_type_claimed),
        image_url=(record.provenance or {}).get("image_url"),
        video_url=(record.provenance or {}).get("video_url"),
        verification_status=VerificationStatus(record.verification_status),
    )


def ground_observation_schema(record: GroundObservationModel, report_id: str) -> GroundObservation:
    return GroundObservation(
        observation_id=record.observation_id,
        source="ADMIN_REVIEW",
        report_id=report_id,
        event_type=EventType(record.event_type),
        timestamp=record.timestamp,
        latitude=record.latitude,
        longitude=record.longitude,
        city=record.city,
        district=record.district,
        state=record.state,
        verification_status="VERIFIED",
        verification_method="admin",
        verification_confidence=record.verification_confidence,
    )


def event_schema(record: WeatherEventModel) -> WeatherEvent:
    return WeatherEvent(
        event_id=record.event_id,
        event_type=EventType(record.event_type),
        title=record.title,
        city=record.city or "",
        district=record.district,
        state=record.state,
        latitude=record.center_latitude,
        longitude=record.center_longitude,
        first_seen_at=record.start_time,
        last_updated_at=record.last_updated_at,
        status=record.status,
        severity="UNASSESSED",
        verified_report_count=record.verified_report_count,
        verified_media_count=int(record.ground_evidence.get("verified_media_count", 0)),
        observation_ids=list(record.ground_evidence.get("observation_ids", [])),
        meteorological_evidence=record.meteorological_evidence,
        vayu_analysis={
            "anomaly_score": record.anomaly_score,
            "event_confidence": record.event_confidence,
            "severity_score": record.severity_score,
        },
    )


class PersistenceService:
    """Transactional application service backed by the SQLAlchemy session."""

    def __init__(self, session: Session) -> None:
        self.session = session
        self.reports = ReportRepository(session)
        self.users = UserRepository(session)
        self.verifications = VerificationRepository(session)
        self.audit = AuditRepository(session)
        self.ground_observations = GroundObservationRepository(session)
        self.events = WeatherEventRepository(session)

    def add_report(self, report: CommonReport) -> CommonReport:
        record = self.reports.add(report)
        record.provenance = {
            "source_name": report.source_name,
            "image_url": report.image_url,
            "video_url": report.video_url,
        }
        return report_schema(record)

    def get_report(self, record_id: str) -> CommonReport | None:
        record = self.reports.get_by_record_id(record_id)
        return report_schema(record) if record else None

    def list_reports(
        self,
        *,
        event_type: str | None = None,
        verification_status: VerificationStatus | None = None,
        region: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[CommonReport]:
        records = self.reports.list(
            event_type=event_type,
            verification_status=verification_status.value if verification_status else None,
            region=region,
            limit=limit,
            offset=offset,
        )
        return [report_schema(record) for record in records]

    def nearby_reports(
        self,
        latitude: float,
        longitude: float,
        radius_km: float,
        *,
        verification_status: VerificationStatus | None = None,
        event_type: str | None = None,
        limit: int = 100,
    ) -> list[CommonReport]:
        records = self.reports.within_radius(
            latitude,
            longitude,
            radius_km * 1000,
            verification_status=verification_status.value if verification_status else None,
            event_type=event_type,
            limit=limit,
        )
        return [report_schema(record) for record in records]

    def find_users_within_radius(self, latitude: float, longitude: float, radius_km: float = 10.0) -> list[dict[str, Any]]:
        return self.users.nearby_citizens(latitude, longitude, radius_km * 1000)

    def add_user(self, email: str, password: str, **profile: Any) -> dict[str, Any]:
        record = self.users.add_citizen(email, password, **profile)
        return self._user_dict(record)

    def authenticate(self, email: str, password: str) -> dict[str, Any] | None:
        record = self.users.get_by_email(email)
        if not record or record.password_hash != sha256(password.encode()).hexdigest() or not record.is_active:
            return None
        return self._user_dict(record)

    @staticmethod
    def _user_dict(record: Any) -> dict[str, Any]:
        profile = record.citizen_profile
        return {
            "user_id": str(record.id),
            "email": record.email,
            "name": record.display_name,
            "phone": profile.phone if profile else "",
            "address": profile.address if profile else "",
            "latitude": profile.latitude if profile else None,
            "longitude": profile.longitude if profile else None,
        }

    def apply_decision(
        self,
        report_id: str,
        *,
        status: VerificationStatus,
        reason: str,
        operator: str,
        notified_users: list[dict[str, Any]],
        email_status: str,
    ) -> dict[str, Any] | None:
        record = self.reports.get_by_record_id(report_id)
        if not record:
            return None
        previous_status = record.verification_status
        self.reports.update_status(record, status.value)
        result = self.verifications.add_result(
            record,
            engine="ADMIN_REVIEW",
            status=status.value,
            score=None,
            result_metadata={"reason": reason, "operator": operator},
        )
        self.verifications.add_evidence(
            result,
            evidence_type="admin_decision",
            score=None,
            explanation=reason,
            metadata={"operator": operator, "previous_status": previous_status},
        )
        if status == VerificationStatus.verified:
            self.ground_observations.replace_from_verified_report(record)
        else:
            self.ground_observations.remove_for_report(record)
        self._rebuild_cluster(record)
        audit = self.audit.record_admin_decision(
            report=record,
            previous_status=previous_status,
            new_status=status.value,
            reason=reason,
            operator=operator,
            notified_users=notified_users,
            email_status=email_status,
        )
        return {
            "submission_id": f"SUB-{str(audit.id)[:8].upper()}",
            "report_id": report_id,
            "report_title": record.text,
            "location": f"{record.city}, {record.district}, {record.state}",
            "event_type": record.event_type_claimed,
            "latitude": record.latitude,
            "longitude": record.longitude,
            "previous_status": previous_status,
            "new_status": status.value,
            "reason": reason,
            "operator": operator,
            "timestamp": audit.occurred_at.isoformat() if audit.occurred_at else datetime.now(timezone.utc).isoformat(),
            "notified_count": len(notified_users),
            "notified_users": notified_users,
            "email_status": email_status,
        }

    def _rebuild_cluster(self, anchor: ReportModel) -> None:
        radius = 10_000
        nearby_statement = self.ground_observations.nearby_statement(
            anchor.latitude,
            anchor.longitude,
            radius,
            anchor.event_type_claimed,
            anchor.district,
            anchor.state,
        )
        query = (
            select(GroundObservationModel, ReportModel)
            .join(ReportModel, ReportModel.id == GroundObservationModel.report_id)
            .where(GroundObservationModel.id.in_(nearby_statement.with_only_columns(GroundObservationModel.id)))
            .order_by(GroundObservationModel.timestamp, GroundObservationModel.observation_id)
        )
        members = list(self.session.execute(query))
        affected_event_ids = list(
            self.session.scalars(
                select(EventReport.event_id).where(EventReport.report_id == anchor.id)
            )
        )
        if not members:
            if affected_event_ids:
                self.session.execute(delete(EventReport).where(EventReport.event_id.in_(affected_event_ids)))
                self.session.execute(delete(WeatherEventModel).where(WeatherEventModel.id.in_(affected_event_ids)))
            return

        observations, reports = zip(*members)
        member_event_ids = list(
            self.session.scalars(
                select(EventReport.event_id).where(EventReport.report_id.in_([report.id for report in reports]))
            )
        )
        affected_event_ids = list(set(affected_event_ids + member_event_ids))
        first_observation = observations[0]
        event_id = f"EVT-{reports[0].record_id}"
        count = len(observations)
        latitude = sum(item.latitude for item in observations) / count
        longitude = sum(item.longitude for item in observations) / count
        existing = self.session.scalars(
            select(WeatherEventModel).where(WeatherEventModel.event_id == event_id)
        ).first()
        values = {
            "event_type": anchor.event_type_claimed,
            "title": f"Verified {anchor.event_type_claimed.replace('_', ' ')} observations",
            "center_latitude": latitude,
            "center_longitude": longitude,
            "geometry": WKTElement(f"POINT({longitude} {latitude})", srid=4326),
            "state": anchor.state,
            "district": anchor.district,
            "city": first_observation.city,
            "start_time": first_observation.timestamp,
            "last_updated_at": max(item.timestamp for item in observations),
            "status": "CORRELATED" if count > 1 else "DETECTED",
            "severity": "UNASSESSED",
            "verified_report_count": count,
            "source_count": 1,
            "ground_evidence": {
                "observation_ids": [item.observation_id for item in observations],
                "verified_media_count": sum(
                    int(bool(report.provenance.get("image_url"))) + int(bool(report.provenance.get("video_url")))
                    for report in reports
                ),
            },
            "meteorological_evidence": {
                "rainfall_24h_mm": None,
                "temperature_c": None,
                "humidity_percent": None,
                "wind_speed_kmh": None,
            },
            "provenance": {"mode": "DEMO", "correlation_method": "PostGIS 10 km same-type/district radius"},
        }
        if existing:
            for field, value in values.items():
                setattr(existing, field, value)
            event = existing
        else:
            event = WeatherEventModel(event_id=event_id, **values)
            self.session.add(event)
            self.session.flush()
        self.session.execute(delete(EventReport).where(EventReport.event_id == event.id))
        self.session.add_all(
            [EventReport(event_id=event.id, report_id=report.id, relation_type="VERIFIED_GROUND") for report in reports]
        )
        stale_event_ids = [event_id for event_id in set(affected_event_ids) if event_id != event.id]
        if stale_event_ids:
            self.session.execute(delete(EventReport).where(EventReport.event_id.in_(stale_event_ids)))
            self.session.execute(delete(WeatherEventModel).where(WeatherEventModel.id.in_(stale_event_ids)))

    def record_vista_result(self, report_id: str, score: float, status: str, generated_at: datetime) -> None:
        record = self.reports.get_by_record_id(report_id)
        if record:
            result = self.verifications.add_result(
                record,
                engine="VISTA-demo",
                status=status,
                score=score,
                result_metadata={"generated_at": generated_at.isoformat()},
            )
            self.verifications.add_evidence(
                result,
                evidence_type="demo_source_prior",
                score=score,
                explanation="Illustrative demo prior; not an automated verification decision.",
            )

    def submissions(self) -> list[dict[str, Any]]:
        results = []
        for audit in self.audit.list():
            details = audit.details or {}
            report = self.reports.get_by_record_id(audit.entity_id) if audit.entity_type == "report" else None
            results.append({
                "submission_id": f"SUB-{str(audit.id)[:8].upper()}",
                "report_id": audit.entity_id,
                "report_title": report.text if report else "",
                "previous_status": details.get("previous_status"),
                "new_status": details.get("new_status"),
                "reason": details.get("reason"),
                "operator": details.get("operator"),
                "timestamp": audit.occurred_at.isoformat() if audit.occurred_at else None,
                "notified_users": details.get("notified_users", []),
                "notified_count": len(details.get("notified_users", [])),
                "email_status": details.get("email_status", "not_triggered"),
            })
        return results

    def ground_observation_items(self) -> list[GroundObservation]:
        statement = (
            select(GroundObservationModel, ReportModel.record_id)
            .join(ReportModel, ReportModel.id == GroundObservationModel.report_id)
            .order_by(GroundObservationModel.timestamp.desc())
            .limit(500)
        )
        return [ground_observation_schema(record, record_id) for record, record_id in self.session.execute(statement)]

    def weather_event_items(self, event_type: str | None = None, region: str | None = None) -> list[WeatherEvent]:
        records = self.events.list(limit=500)
        if event_type and event_type not in ("All events", "All"):
            records = [record for record in records if record.event_type.lower() == event_type.lower()]
        if region and region not in ("All India", "All"):
            records = [
                record for record in records
                if region.casefold() in (record.state.casefold(), record.city.casefold(), record.district.casefold())
            ]
        return [event_schema(record) for record in records]

    def audit_logs(self) -> list[dict[str, Any]]:
        return self.submissions()