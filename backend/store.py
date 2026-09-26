from __future__ import annotations

import math
from datetime import datetime, timezone
from hashlib import sha256
from threading import Lock
from typing import Any
from uuid import uuid4

from .schemas import CommonReport, VerificationStatus


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


store = MemoryStore()
