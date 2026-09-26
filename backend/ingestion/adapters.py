from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
import json
from typing import Any

from ..schemas import EventType, SourceType
from .base import DeterministicAdapter
from .schemas import NormalizedWeatherRecord, SourceClass


def _record_hash(payload: dict[str, Any]) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return sha256(canonical.encode("utf-8")).hexdigest()


class DemoImdAdapter(DeterministicAdapter):
    """Deterministic IMD-shaped fixture; it does not call the IMD service."""

    source_id = "demo-imd-station-delhi-001"
    source_name = "IMD-compatible demo fixture"

    def fetch(self) -> list[dict[str, Any]]:
        timestamp = datetime(2026, 9, 26, 10, 0, tzinfo=timezone.utc)
        common = {
            "source_id": self.source_id,
            "source_type": SourceType.weather_api,
            "source_name": self.source_name,
            "source_class": SourceClass.authoritative_meteorological,
            "timestamp": timestamp,
            "ingestion_timestamp": timestamp,
            "language": "und",
            "latitude": 28.6139,
            "longitude": 77.2090,
            "state": "Delhi",
            "district": "New Delhi",
            "city": "New Delhi",
            "event_type": EventType.rainfall,
            "humidity_percent": 62.0,
            "rainfall_mm": 12.4,
            "wind_speed_kmh": 18.0,
            "wind_direction_deg": 250.0,
            "pressure_hpa": 1008.4,
            "cloud_cover_percent": 45.0,
            "demo": True,
            "raw_source_reference": "fixture://demo-imd/delhi/2026-09-26T10:00:00Z",
        }
        first = {**common, "record_id": "DEMO-IMD-DEL-001", "temperature_c": 31.2}
        second = {
            **common,
            "record_id": "DEMO-IMD-DEL-002",
            "source_id": "demo-imd-station-delhi-002",
            "latitude": 28.6200,
            "longitude": 77.2150,
            "temperature_c": 31.0,
            "raw_source_reference": "fixture://demo-imd/delhi/2026-09-26T10:00:00Z/station-2",
        }
        return [self._with_hash(first), self._with_hash(second)]

    @staticmethod
    def _with_hash(record: dict[str, Any]) -> dict[str, Any]:
        hash_input = {key: value.value if hasattr(value, "value") else value for key, value in record.items() if key != "record_id"}
        hash_input = {key: value.isoformat() if isinstance(value, datetime) else value for key, value in hash_input.items()}
        return {**record, "content_hash": _record_hash(hash_input)}


class DemoCitizenAdapter(DeterministicAdapter):
    """Controlled untrusted report fixture; records are sent to VISTA review."""

    source_id = "demo-citizen-stream"
    source_name = "VAANKAN citizen demo stream"

    def fetch(self) -> list[dict[str, Any]]:
        timestamp = datetime(2026, 9, 26, 10, 5, tzinfo=timezone.utc)
        report = {
            "record_id": "DEMO-CIT-CHN-001",
            "source_id": "demo-citizen-message-001",
            "source_type": SourceType.citizen,
            "source_name": self.source_name,
            "source_class": SourceClass.untrusted_external,
            "timestamp": timestamp,
            "ingestion_timestamp": timestamp,
            "text": "Heavy rain reported near Tambaram bus stand.",
            "language": "en",
            "latitude": 12.9249,
            "longitude": 80.1000,
            "state": "Tamil Nadu",
            "district": "Chengalpattu",
            "city": "Tambaram",
            "event_type": EventType.rainfall,
            "raw_source_reference": "fixture://demo-citizen/message-001",
            "demo": True,
        }
        hash_input = {key: value.value if hasattr(value, "value") else value for key, value in report.items() if key != "record_id"}
        hash_input = {key: value.isoformat() if isinstance(value, datetime) else value for key, value in hash_input.items()}
        hashed = {**report, "content_hash": _record_hash(hash_input)}
        duplicate = {**hashed, "record_id": "DEMO-CIT-CHN-001-DUP"}
        return [hashed, duplicate]