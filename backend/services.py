from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
from typing import Any
from uuid import UUID

from geoalchemy2 import WKTElement
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .models import Alert, AuditLog, CitizenActivity, EventReport, GroundObservation as GroundObservationModel, Notification
from .models import WeatherEvent as WeatherEventModel, WeatherObservation as WeatherObservationModel, WeatherStation as WeatherStationModel
from .repositories import (
    AuditRepository,
    GroundObservationRepository,
    ReportRepository,
    UserRepository,
    VerificationRepository,
    WeatherEventRepository,
    WeatherObservationRepository,
)
from .models import Report as ReportModel
from .models import User as UserModel
from .schemas import CommonReport, EventType, GroundObservation, SourceType, VerificationStatus, WeatherEvent, WeatherObservation


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
        submitted=record.submitted,
        submitted_at=record.submitted_at,
        citizen_id=(record.provenance or {}).get("citizen_id"),
        description=(record.provenance or {}).get("description"),
        locality=(record.provenance or {}).get("locality"),
        pincode=(record.provenance or {}).get("pincode"),
        citizen_reported_severity=(record.provenance or {}).get("citizen_reported_severity"),
        is_ongoing=(record.provenance or {}).get("is_ongoing"),
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


def weather_observation_schema(record: WeatherObservationModel, station: WeatherStationModel | None) -> WeatherObservation:
    provenance = record.provenance or {}
    return WeatherObservation(
        observation_id=record.observation_id,
        source_id="open-meteo",
        source_type="WEATHER_MODEL",
        source_name="Open-Meteo",
        timestamp=record.source_timestamp,
        ingested_at=record.processed_at,
        latitude=record.latitude,
        longitude=record.longitude,
        city=station.city if station else None,
        district=station.district if station else None,
        state=station.state if station else None,
        temperature_c=record.temperature_c,
        feels_like_c=record.feels_like_c,
        humidity_percent=record.humidity_percent,
        precipitation_mm=provenance.get("precipitation_mm"),
        rainfall_mm=record.rainfall_mm,
        rainfall_1h_mm=record.rainfall_1h_mm,
        rainfall_3h_mm=record.rainfall_3h_mm,
        rainfall_24h_mm=record.rainfall_24h_mm,
        wind_speed_kmh=record.wind_speed_kmh,
        wind_direction_deg=record.wind_direction_deg,
        wind_gust_kmh=record.wind_gust_kmh,
        pressure_hpa=record.pressure_hpa,
        cloud_cover_percent=record.cloud_cover_percent,
        visibility_km=record.visibility_km,
        dew_point_c=record.dew_point_c,
        weather_condition=provenance.get("weather_condition"),
        historical_rainfall_avg_mm=record.historical_rainfall_avg,
        historical_rainfall_daily_avg_mm=provenance.get("historical_rainfall_daily_avg_mm"),
        historical_temperature_avg_c=record.historical_temperature_avg,
        historical_wind_speed_avg_kmh=provenance.get("historical_wind_speed_avg_kmh"),
        historical_visibility_avg_km=provenance.get("historical_visibility_avg_km"),
        rainfall_anomaly_mm=record.rainfall_anomaly,
        rainfall_anomaly_ratio=provenance.get("rainfall_anomaly_ratio"),
        temperature_anomaly_c=record.temperature_anomaly,
        wind_anomaly_kmh=record.wind_anomaly,
        visibility_anomaly_km=record.visibility_anomaly,
        weather_anomaly_score=record.weather_anomaly_score,
        anomaly_components=provenance.get("anomaly_components", {}),
        data_quality_flag=record.quality_status,
        freshness_status=provenance.get("freshness_status", "UNKNOWN"),
        data_mode=provenance.get("data_mode", "UNKNOWN"),
        source_units=provenance.get("source_units", {}),
        baseline_start_date=provenance.get("baseline_start_date"),
        baseline_end_date=provenance.get("baseline_end_date"),
        baseline_observation_days=provenance.get("baseline_observation_days", 0),
        baseline_source=provenance.get("baseline_source"),
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
        self.weather_observations = WeatherObservationRepository(session)

    def add_report(self, report: CommonReport) -> CommonReport:
        record = self.reports.add(report)
        if record:
            record.provenance = {
                **(record.provenance or {}),
                "source_name": report.source_name,
                "image_url": report.image_url,
                "video_url": report.video_url,
                "citizen_id": report.citizen_id,
                "description": report.description,
                "locality": report.locality,
                "pincode": report.pincode,
                "citizen_reported_severity": report.citizen_reported_severity,
                "is_ongoing": report.is_ongoing,
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

    def list_review_queue(
        self,
        *,
        status: str | None = None,
        event_type: str | None = None,
        state: str | None = None,
        district: str | None = None,
        date: str | None = None,
        vista_status: str | None = None,
        priority: str | None = None,
    ) -> list[CommonReport]:
        records = self.reports.list(
            verification_status=status.upper() if status else None,
            event_type=event_type,
            region=state or district,
            limit=500,
        )
        if date:
            records = [record for record in records if record.source_timestamp.date().isoformat() == date]
        if vista_status:
            records = [record for record in records if str((record.provenance or {}).get("vista_status", "PENDING")).casefold() == vista_status.casefold()]
        if priority:
            records = [record for record in records if str((record.provenance or {}).get("priority", "NORMAL")).casefold() == priority.casefold()]
        return [report_schema(record) for record in records]

    def list_citizen_reports(self, citizen_id: str, *, limit: int = 100, offset: int = 0) -> list[CommonReport]:
        records = self.reports.list_for_citizen(citizen_id, limit=limit, offset=offset)
        return [report_schema(record) for record in records]

    def add_activity(
        self,
        citizen_id: str,
        *,
        activity_type: str,
        title: str,
        description: str,
        related_id: str | None = None,
        status: str = "ACTIVE",
    ) -> dict[str, Any]:
        activity = CitizenActivity(
            citizen_id=citizen_id,
            activity_type=activity_type,
            title=title,
            description=description,
            related_id=related_id,
            status=status,
        )
        self.session.add(activity)
        self.session.flush()
        return {
            "id": str(activity.id),
            "citizen_id": activity.citizen_id,
            "type": activity.activity_type,
            "title": activity.title,
            "description": activity.description,
            "timestamp": activity.occurred_at.isoformat() if activity.occurred_at else datetime.now(timezone.utc).isoformat(),
            "related_id": activity.related_id,
            "status": activity.status,
        }

    def list_citizen_activities(self, citizen_id: str) -> list[dict[str, Any]]:
        statement = (
            select(CitizenActivity)
            .where(CitizenActivity.citizen_id == citizen_id)
            .order_by(CitizenActivity.occurred_at.desc())
            .limit(100)
        )
        return [
            {
                "id": str(activity.id),
                "citizen_id": activity.citizen_id,
                "type": activity.activity_type,
                "title": activity.title,
                "description": activity.description,
                "timestamp": activity.occurred_at.isoformat(),
                "related_id": activity.related_id,
                "status": activity.status,
            }
            for activity in self.session.scalars(statement)
        ]

    def acknowledge_alert(self, citizen_id: str, alert_id: str) -> dict[str, object]:
        existing = self.session.scalars(
            select(CitizenActivity).where(
                CitizenActivity.citizen_id == citizen_id,
                CitizenActivity.activity_type == "ALERT_ACKNOWLEDGED",
                CitizenActivity.related_id == alert_id,
            )
        ).first()
        if existing:
            return {"acknowledged": True, "already_acknowledged": True, "acknowledged_at": existing.occurred_at.isoformat()}
        activity = self.add_activity(
            citizen_id,
            activity_type="ALERT_ACKNOWLEDGED",
            title="Alert acknowledged",
            description=f"Alert {alert_id} acknowledged from the citizen portal.",
            related_id=alert_id,
            status="ACKNOWLEDGED",
        )
        return {"acknowledged": True, "already_acknowledged": False, "acknowledged_at": activity["timestamp"]}

    def record_notification(
        self,
        *,
        alert_id: UUID | None = None,
        user_id: UUID | None = None,
        recipient: str,
        channel: str,
        delivery_status: str,
        error: str | None = None,
    ) -> Notification:
        record = Notification(
            alert_id=alert_id,
            user_id=user_id,
            channel=channel,
            recipient=recipient,
            status=delivery_status.upper(),
            error=error,
            sent_at=datetime.now(timezone.utc) if delivery_status == "sent" else None,
        )
        self.session.add(record)
        self.session.flush()
        return record

    def update_notification(self, notification_id: str, delivery_status: str, error: str | None = None) -> None:
        record = self.session.get(Notification, UUID(notification_id))
        if record is None:
            return
        record.status = delivery_status.upper()
        record.error = error
        record.sent_at = datetime.now(timezone.utc) if delivery_status == "sent" else None

    def submit_verified_report(self, report_id: str, *, operator: str, radius_km: float = 10.0) -> dict[str, Any]:
        record = self.reports.get_by_record_id(report_id, for_update=True)
        if record is None:
            raise ValueError("report not found")
        if record.verification_status != VerificationStatus.verified.value:
            raise ValueError("Only VERIFIED reports can be submitted")
        if record.submitted:
            raise ValueError("report already submitted")

        now = datetime.now(timezone.utc)
        record.submitted = True
        record.submitted_at = now
        observation = self.ground_observations.replace_from_verified_report(record)
        event_uuid = self.session.scalars(
            select(EventReport.event_id).where(EventReport.report_id == record.id).limit(1)
        ).first()
        alert = Alert(
            event_id=event_uuid,
            source_report_id=record.id,
            title=record.text[:240],
            body=f"Verified {record.event_type_claimed.replace('_', ' ')} event near {record.city}, {record.state}.",
            status="ACTIVE",
            audience_radius_km=radius_km,
            provenance={"report_id": report_id, "submitted_by": operator, "submitted_at": now.isoformat()},
        )
        self.session.add(alert)
        self.session.flush()

        recipients = self.find_users_within_radius(record.latitude, record.longitude, radius_km)
        queued_notifications: list[dict[str, Any]] = []
        for recipient in recipients:
            user_uuid = UUID(str(recipient["user_id"]))
            notification = self.record_notification(
                alert_id=alert.id,
                user_id=user_uuid,
                recipient=str(recipient["email"]),
                channel="email",
                delivery_status="queued",
            )
            self.add_activity(
                str(user_uuid),
                activity_type="VERIFIED_ALERT",
                title="Nearby weather alert",
                description=f"{record.text} was verified and submitted within your {radius_km:g} km alert radius.",
                related_id=str(alert.id),
                status="ACTIVE",
            )
            queued_notifications.append({
                "notification_id": str(notification.id),
                "user_id": str(user_uuid),
                "email": str(recipient["email"]),
                "name": str(recipient.get("name") or "Citizen"),
                "distance_km": float(recipient["distance_km"]),
            })

        self.session.add(AuditLog(
            action="report_submitted_to_vayu",
            entity_type="report",
            entity_id=report_id,
            occurred_at=now,
            details={
                "verification_status": record.verification_status,
                "submitted": True,
                "submitted_at": now.isoformat(),
                "alert_id": str(alert.id),
                "radius_km": radius_km,
                "recipient_count": len(recipients),
                "operator": operator,
            },
        ))
        self.session.flush()
        return {
            "report_id": report_id,
            "title": record.text,
            "event_type": record.event_type_claimed,
            "city": record.city,
            "district": record.district,
            "state": record.state,
            "status": VerificationStatus.verified.value,
            "submitted": True,
            "submitted_at": now.isoformat(),
            "vayu_status": "SUBMITTED",
            "verified_ground_observation_id": observation.observation_id,
            "alert_id": str(alert.id),
            "recipients": queued_notifications,
        }

    def list_citizen_alerts(self, citizen_id: str) -> list[dict[str, Any]]:
        try:
            user = self.session.get(UserModel, UUID(citizen_id))
        except ValueError:
            user = self.users.get_by_email(citizen_id)
        if user is None:
            return []
        statement = (
            select(Alert, Notification, ReportModel)
            .join(Notification, Notification.alert_id == Alert.id)
            .join(ReportModel, Alert.source_report_id == ReportModel.id)
            .where(Notification.user_id == user.id, Notification.channel == "email")
            .where(Alert.status == "ACTIVE", ReportModel.submitted.is_(True))
            .order_by(Alert.created_at.desc())
        )
        results = []
        for alert, notification, report in self.session.execute(statement):
            acknowledged = self.session.scalars(select(CitizenActivity).where(
                CitizenActivity.citizen_id.in_([str(user.id), user.email]),
                CitizenActivity.activity_type == "ALERT_ACKNOWLEDGED",
                CitizenActivity.related_id == str(alert.id),
            )).first() is not None
            results.append({
                "alert_id": str(alert.id),
                "report_id": report.record_id,
                "title": alert.title,
                "severity": (report.provenance or {}).get("citizen_reported_severity") or report.event_type_claimed.upper(),
                "location": f"{report.city}, {report.state}",
                "acknowledged": acknowledged,
                "source": report.source_name,
                "timestamp": alert.created_at.isoformat(),
                "age_hours": max(0.0, (datetime.now(timezone.utc) - alert.created_at).total_seconds() / 3600),
                "event_type": report.event_type_claimed,
                "latitude": report.latitude,
                "longitude": report.longitude,
                "email_status": notification.status,
            })
        return results

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

    def update_citizen_profile(self, citizen_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
        record = self.users.update_citizen_profile(citizen_id, updates)
        return self._user_dict(record) if record else None

    @staticmethod
    def _user_dict(record: Any) -> dict[str, Any]:
        profile = record.citizen_profile
        return {
            "user_id": str(record.id),
            "email": record.email,
            "name": record.display_name,
            "phone": profile.phone if profile else "",
            "government_id": profile.government_id if profile else "",
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
            if audit.action != "verification_decision" or audit.entity_type != "report":
                continue
            details = audit.details or {}
            report = self.reports.get_by_record_id(audit.entity_id) if audit.entity_type == "report" else None
            results.append({
                "submission_id": f"SUB-{str(audit.id)[:8].upper()}",
                "report_id": audit.entity_id,
                "report_title": details.get("report_title") or (report.text if report else ""),
                "location": details.get("location") or (f"{report.city}, {report.district}, {report.state}" if report else ""),
                "event_type": details.get("event_type") or (report.event_type_claimed if report else ""),
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

    def upsert_weather_observations(self, observations: list[dict[str, Any]]) -> int:
        return self.weather_observations.upsert_many(observations)

    def list_weather_observations(
        self,
        *,
        state: str | None = None,
        city: str | None = None,
        limit: int = 500,
    ) -> list[WeatherObservation]:
        records = self.weather_observations.list(state=state, city=city, limit=limit)
        return [weather_observation_schema(record, station) for record, station in records]