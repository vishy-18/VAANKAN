from __future__ import annotations

import math
from datetime import datetime, timezone
from hashlib import sha256
from threading import Lock
from typing import Any
from uuid import uuid4

from .schemas import CommonReport, GroundObservation, VerificationStatus, WeatherEvent


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0  # Earth radius in kilometers
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r * c


class MemoryStore:
    def __init__(self) -> None:
        self._lock = Lock()
        self.users: dict[str, dict[str, Any]] = {}
        self.reports: dict[str, CommonReport] = {}
        self.ground_observations: dict[str, GroundObservation] = {}
        self.weather_events: dict[str, WeatherEvent] = {}
        self.actions: list[dict[str, Any]] = []
        self.submissions: list[dict[str, Any]] = []
        self._seed()

    def _seed(self) -> None:
        seed_report = CommonReport(
            record_id="R10234",
            source_type="citizen",
            source_name="VAANKAN demo citizen",
            timestamp=datetime(2026, 9, 24, 14, 30, tzinfo=timezone.utc),
            text="Heavy rain has flooded the main road near Cuddalore bus stand.",
            language="en",
            latitude=11.75,
            longitude=79.76,
            city="Cuddalore",
            district="Cuddalore",
            state="Tamil Nadu",
            event_type_claimed="flooding",
            verification_status=VerificationStatus.pending,
        )
        self.reports[seed_report.record_id] = seed_report

        # Seed demo users within 10 km of Cuddalore (11.75, 79.76)
        user1 = {
            "user_id": "usr-demo-001",
            "email": "skyware2025@gmail.com",
            "name": "Vishaal (Local Citizen)",
            "phone": "+919876543210",
            "address": "Main Street, Cuddalore",
            "latitude": 11.755,
            "longitude": 79.765,
            "password_hash": sha256("password123".encode()).hexdigest(),
        }
        user2 = {
            "user_id": "usr-demo-002",
            "email": "citizen.cuddalore@vaankan.gov.in",
            "name": "K. Ramanathan",
            "phone": "+919123456789",
            "address": "Beach Road, Cuddalore",
            "latitude": 11.745,
            "longitude": 79.770,
            "password_hash": sha256("password123".encode()).hexdigest(),
        }
        user3 = {
            "user_id": "usr-demo-003",
            "email": "chennai.observer@example.com",
            "name": "S. Sundaram (Far away)",
            "phone": "+919000000000",
            "address": "Anna Salai, Chennai",
            "latitude": 13.0827,
            "longitude": 80.2707,
            "password_hash": sha256("password123".encode()).hexdigest(),
        }
        self.users[user1["email"]] = user1
        self.users[user2["email"]] = user2
        self.users[user3["email"]] = user3

    def add_user(self, email: str, password: str, **profile: Any) -> dict[str, Any]:
        with self._lock:
            if email in self.users:
                raise ValueError("email already registered")
            
            # Extract lat/lon if provided in profile
            lat = float(profile.get("latitude")) if profile.get("latitude") else 11.75
            lon = float(profile.get("longitude")) if profile.get("longitude") else 79.76

            user = {
                "user_id": str(uuid4()),
                "email": email,
                "password_hash": sha256(password.encode()).hexdigest(),
                **profile,
                "latitude": str(lat),
                "longitude": str(lon),
            }
            self.users[email] = user
            return {key: str(value) for key, value in user.items() if key != "password_hash"}

    def authenticate(self, email: str, password: str) -> dict[str, Any] | None:
        candidate = self.users.get(email)
        if not candidate or candidate["password_hash"] != sha256(password.encode()).hexdigest():
            return None
        return {key: value for key, value in candidate.items() if key != "password_hash"}

    def add_report(self, report: CommonReport) -> CommonReport:
        with self._lock:
            if report.record_id in self.reports:
                raise ValueError("record_id already exists")
            self.reports[report.record_id] = report
            return report

    def get_report(self, report_id: str) -> CommonReport | None:
        return self.reports.get(report_id)

    def list_reports(
        self,
        *,
        event_type: str | None = None,
        verification_status: VerificationStatus | None = None,
        region: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[CommonReport]:
        reports = list(self.reports.values())
        if event_type:
            reports = [report for report in reports if report.event_type_claimed.value == event_type]
        if verification_status:
            reports = [report for report in reports if report.verification_status == verification_status]
        if region:
            reports = [
                report for report in reports
                if region.casefold() in (report.state.casefold(), report.district.casefold(), report.city.casefold())
            ]
        return reports[offset : offset + limit]

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
        results = []
        for report in self.reports.values():
            if verification_status and report.verification_status != verification_status:
                continue
            if event_type and report.event_type_claimed.value != event_type:
                continue
            distance = haversine_distance_km(latitude, longitude, report.latitude, report.longitude)
            if distance <= radius_km:
                results.append((distance, report))
        results.sort(key=lambda item: item[0])
        return [report for _, report in results[:limit]]

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
        if report_id not in self.reports:
            return None
        return self.add_submission(
            report_id=report_id,
            status=status,
            reason=reason,
            operator=operator,
            notified_users=notified_users,
            email_status=email_status,
        )

    def find_reports_within_radius(self, latitude: float, longitude: float, radius_km: float = 10.0) -> list[CommonReport]:
        return self.nearby_reports(latitude, longitude, radius_km)

    def find_users_within_radius(self, latitude: float, longitude: float, radius_km: float = 10.0) -> list[dict[str, Any]]:
        with self._lock:
            results: list[dict[str, Any]] = []
            for user in self.users.values():
                u_lat = user.get("latitude")
                u_lon = user.get("longitude")
                if u_lat is not None and u_lon is not None:
                    try:
                        dist = haversine_distance_km(latitude, longitude, float(u_lat), float(u_lon))
                        if dist <= radius_km:
                            results.append({
                                "email": user["email"],
                                "name": user.get("name", "Citizen"),
                                "phone": user.get("phone", ""),
                                "distance_km": round(dist, 2),
                            })
                    except (ValueError, TypeError):
                        continue
            return results

    def add_submission(
        self,
        report_id: str,
        status: VerificationStatus,
        reason: str,
        operator: str = "A. Sharma",
        notified_users: list[dict[str, Any]] | None = None,
        email_status: str = "sent",
    ) -> dict[str, Any]:
        with self._lock:
            report = self.reports[report_id]
            previous = report.verification_status.value
            updated = report.model_copy(update={"verification_status": status})
            self.reports[report_id] = updated

            if status == VerificationStatus.verified:
                observation = GroundObservation(
                    observation_id=f"GO-{report_id}",
                    report_id=report_id,
                    event_type=report.event_type_claimed,
                    timestamp=report.timestamp,
                    latitude=report.latitude,
                    longitude=report.longitude,
                    city=report.city,
                    district=report.district,
                    state=report.state,
                )
                self.ground_observations[observation.observation_id] = observation
            else:
                self.ground_observations.pop(f"GO-{report_id}", None)
            self._rebuild_weather_events()

            submission = {
                "submission_id": f"SUB-{str(uuid4())[:8].upper()}",
                "report_id": report_id,
                "report_title": report.text,
                "location": f"{report.city}, {report.district}, {report.state}",
                "event_type": report.event_type_claimed.value,
                "latitude": report.latitude,
                "longitude": report.longitude,
                "previous_status": previous,
                "new_status": status.value,
                "reason": reason,
                "operator": operator,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "notified_count": len(notified_users) if notified_users else 0,
                "notified_users": notified_users or [],
                "email_status": email_status,
            }
            self.submissions.insert(0, submission)
            self.actions.append(submission)
            return submission

    def _rebuild_weather_events(self) -> None:
        clusters: list[list[GroundObservation]] = []
        for observation in sorted(self.ground_observations.values(), key=lambda item: item.timestamp):
            matching_cluster = next(
                (
                    cluster
                    for cluster in clusters
                    if cluster[0].event_type == observation.event_type
                    and cluster[0].district.casefold() == observation.district.casefold()
                    and cluster[0].state.casefold() == observation.state.casefold()
                    and haversine_distance_km(
                        sum(item.latitude for item in cluster) / len(cluster),
                        sum(item.longitude for item in cluster) / len(cluster),
                        observation.latitude,
                        observation.longitude,
                    ) <= 10.0
                ),
                None,
            )
            if matching_cluster is None:
                clusters.append([observation])
            else:
                matching_cluster.append(observation)

        rebuilt: dict[str, WeatherEvent] = {}
        for cluster in clusters:
            first = cluster[0]
            event_id = f"EVT-{first.report_id}"
            count = len(cluster)
            rebuilt[event_id] = WeatherEvent(
                event_id=event_id,
                event_type=first.event_type,
                title=f"Verified {first.event_type.value.replace('_', ' ')} observations",
                city=first.city,
                district=first.district,
                state=first.state,
                latitude=sum(item.latitude for item in cluster) / count,
                longitude=sum(item.longitude for item in cluster) / count,
                first_seen_at=first.timestamp,
                last_updated_at=max(item.timestamp for item in cluster),
                status="CORRELATED" if count > 1 else "DETECTED",
                verified_report_count=count,
                verified_media_count=sum(
                    int(bool(self.reports[item.report_id].image_url))
                    + int(bool(self.reports[item.report_id].video_url))
                    for item in cluster
                ),
                observation_ids=[item.observation_id for item in cluster],
                meteorological_evidence={
                    "rainfall_24h_mm": None,
                    "temperature_c": None,
                    "humidity_percent": None,
                    "wind_speed_kmh": None,
                    "pressure_hpa": None,
                    "visibility_km": None,
                },
                vayu_analysis={
                    "anomaly_score": None,
                    "event_confidence": None,
                    "severity_score": None,
                },
            )
        self.weather_events = rebuilt


store = MemoryStore()
