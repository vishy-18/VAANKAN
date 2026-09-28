from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .locations import INDIAN_WEATHER_LOCATIONS
from .open_meteo import OPEN_METEO_ENABLED, open_meteo_source
from .open_meteo_historical import open_meteo_historical_source


class WeatherIntelligenceService:
    """Provider orchestration and transparent deterministic weather analysis."""

    def __init__(self, weather_source=open_meteo_source, historical_source=open_meteo_historical_source) -> None:
        self.weather_source = weather_source
        self.historical_source = historical_source
        self._samples: dict[str, list[dict[str, Any]]] = {}
        self._processed_timestamp: str | None = None

    async def current(self, *, refresh: bool = False) -> dict[str, Any]:
        if not OPEN_METEO_ENABLED:
            return {
                "data_mode": "NOT_CONFIGURED",
                "source": {**self.weather_source.metadata(), "status": "DISABLED", "mode": "NOT_CONFIGURED"},
                "historical_source": {**self.historical_source.metadata(), "status": "DISABLED", "mode": "NOT_CONFIGURED"},
                "observations": [],
                "hourly": [],
                "event_candidates": [],
                "coverage_note": "Representative monitoring locations; not complete national coverage.",
            }
        weather_result = await self.weather_source.fetch_current(force_refresh=refresh)
        baseline_result = await self.historical_source.fetch_baselines(force_refresh=refresh)
        baseline_by_location = {item["location_id"]: item for item in baseline_result.get("baselines", [])}
        observations = [
            self._enrich(record, baseline_by_location.get(record["observation_id"].split(":")[1]))
            for record in weather_result.get("observations", [])
        ]
        self._record_samples(observations)
        candidates = self._detect_candidates(observations)
        return {
            "data_mode": weather_result.get("data_mode", "UNKNOWN"),
            "source": weather_result.get("source", self.weather_source.metadata()),
            "historical_source": baseline_result.get("source", self.historical_source.metadata()),
            "observations": observations,
            "hourly": weather_result.get("hourly", []),
            "event_candidates": candidates,
            "coverage_note": "Representative monitoring locations; not complete national coverage.",
            "updated_at": datetime.now(timezone.utc),
            "failed_location_count": weather_result.get("failures", 0),
            "historical_failed_location_count": baseline_result.get("failures", 0),
        }

    def _enrich(self, observation: dict[str, Any], baseline: dict[str, Any] | None) -> dict[str, Any]:
        record = dict(observation)
        if baseline:
            daily_rainfall_average = baseline.get("historical_rainfall_daily_avg_mm")
            record.update({
                "historical_rainfall_daily_avg_mm": daily_rainfall_average,
                "historical_rainfall_avg_mm": daily_rainfall_average / 24 if isinstance(daily_rainfall_average, (int, float)) else None,
                "historical_temperature_avg_c": baseline.get("historical_temperature_avg_c"),
                "historical_wind_speed_avg_kmh": baseline.get("historical_wind_speed_avg_kmh"),
                "historical_visibility_avg_km": baseline.get("historical_visibility_avg_km"),
                "baseline_start_date": baseline.get("baseline_start_date"),
                "baseline_end_date": baseline.get("baseline_end_date"),
                "baseline_observation_days": baseline.get("baseline_observation_days", 0),
                "baseline_source": baseline.get("baseline_source"),
            })
        else:
            record.setdefault("historical_rainfall_avg_mm", None)
            record["historical_rainfall_daily_avg_mm"] = None
            record.setdefault("historical_temperature_avg_c", None)
            record.setdefault("historical_wind_speed_avg_kmh", None)
            record.setdefault("historical_visibility_avg_km", None)
            record["baseline_observation_days"] = 0
        record["rainfall_anomaly_mm"] = _difference(record.get("rainfall_1h_mm", record.get("rainfall_mm")), record.get("historical_rainfall_avg_mm"))
        baseline_rain = record.get("historical_rainfall_avg_mm")
        record["rainfall_anomaly_ratio"] = (
            round(record.get("rainfall_1h_mm", record.get("rainfall_mm")) / baseline_rain, 2)
            if isinstance(record.get("rainfall_1h_mm", record.get("rainfall_mm")), (int, float)) and isinstance(baseline_rain, (int, float)) and baseline_rain > 0
            else None
        )
        record["temperature_anomaly_c"] = _difference(record.get("temperature_c"), record.get("historical_temperature_avg_c"))
        record["wind_anomaly_kmh"] = _difference(record.get("wind_speed_kmh"), record.get("historical_wind_speed_avg_kmh"))
        record["visibility_anomaly_km"] = _difference(record.get("visibility_km"), record.get("historical_visibility_avg_km"))
        components = []
        if record["rainfall_anomaly_ratio"] is not None:
            components.append(min(100.0, max(0.0, (record["rainfall_anomaly_ratio"] - 1) * 25)))
        if record["temperature_anomaly_c"] is not None:
            components.append(min(100.0, max(0.0, record["temperature_anomaly_c"] * 10)))
        if record["wind_anomaly_kmh"] is not None:
            components.append(min(100.0, max(0.0, record["wind_anomaly_kmh"] * 2)))
        if record["visibility_anomaly_km"] is not None:
            components.append(min(100.0, max(0.0, -record["visibility_anomaly_km"] * 20)))
        record["weather_anomaly_score"] = round(sum(components) / len(components), 1) if components else None
        record["anomaly_components"] = {
            "rainfall_ratio_score": _rainfall_score(record["rainfall_anomaly_ratio"]),
            "temperature_delta_score": _delta_score(record["temperature_anomaly_c"], 10),
            "wind_delta_score": _delta_score(record["wind_anomaly_kmh"], 2),
            "visibility_reduction_score": _visibility_score(record["visibility_anomaly_km"]),
            "method": "Deterministic normalized anomaly indicator; not ML, probability, or warning.",
        }
        record["freshness_status"] = _freshness(record.get("timestamp"))
        return record

    def _record_samples(self, observations: list[dict[str, Any]]) -> None:
        seen_timestamp = self.weather_source.metadata().get("last_success_at")
        if seen_timestamp is None or str(seen_timestamp) == self._processed_timestamp:
            return
        self._processed_timestamp = str(seen_timestamp)
        now = datetime.now(timezone.utc)
        for observation in observations:
            location_id = str(observation["observation_id"]).split(":")[1]
            samples = self._samples.setdefault(location_id, [])
            samples.append({
                "timestamp": seen_timestamp,
                "rainfall_mm": observation.get("rainfall_mm"),
                "temperature_c": observation.get("temperature_c"),
                "wind_speed_kmh": observation.get("wind_speed_kmh"),
                "anomaly_score": observation.get("weather_anomaly_score"),
            })
            self._samples[location_id] = [sample for sample in samples if _age_hours(sample["timestamp"], now) <= 6][-12:]

    def _detect_candidates(self, observations: list[dict[str, Any]]) -> list[dict[str, Any]]:
        location_by_id = {location.location_id: location for location in INDIAN_WEATHER_LOCATIONS}
        anomaly_by_id = {item["observation_id"].split(":")[1]: item for item in observations}
        candidates: list[dict[str, Any]] = []
        for event_type, metric, threshold, unit, min_samples in (
            ("HEAVY_RAIN_CANDIDATE", "rainfall_mm", 3.0, "mm", 3),
            ("HEATWAVE_CANDIDATE", "temperature_anomaly_c", 4.0, "°C above recent baseline", 3),
            ("STRONG_WIND_CANDIDATE", "wind_speed_kmh", 55.0, "km/h", 2),
        ):
            qualified = []
            for location_id, observation in anomaly_by_id.items():
                samples = self._samples.get(location_id, [])
                values = [sample.get(metric) for sample in samples]
                available = [value for value in values if isinstance(value, (int, float))]
                if len(available) >= min_samples and all(value >= threshold for value in available[-min_samples:]):
                    qualified.append((location_by_id.get(location_id), observation, samples[-min_samples:]))
            remaining = set(range(len(qualified)))
            while remaining:
                seed_index = remaining.pop()
                seed = qualified[seed_index][0]
                if seed is None:
                    continue
                cluster = [seed_index]
                for candidate_index in list(remaining):
                    other = qualified[candidate_index][0]
                    if other and _distance_km(seed.latitude, seed.longitude, other.latitude, other.longitude) <= 75:
                        cluster.append(candidate_index)
                        remaining.remove(candidate_index)
                if len(cluster) < 3:
                    continue
                members = [qualified[index] for index in cluster]
                member_locations = [member[0] for member in members if member[0]]
                center_latitude = sum(location.latitude for location in member_locations) / len(member_locations)
                center_longitude = sum(location.longitude for location in member_locations) / len(member_locations)
                latest_timestamp = max(
                    (member[1].get("timestamp") for member in members if isinstance(member[1].get("timestamp"), datetime)),
                    default=datetime.now(timezone.utc),
                )
                candidates.append({
                    "candidate_id": f"{event_type.lower()}:{seed.location_id}",
                    "event_type": event_type,
                    "title": event_type.replace("_CANDIDATE", "").replace("_", " ").title(),
                    "status": "DETECTED",
                    "event_status": "DETECTED",
                    "severity": "UNASSESSED",
                    "confidence": None,
                    "latitude": center_latitude,
                    "longitude": center_longitude,
                    "city": member_locations[0].city,
                    "district": member_locations[0].district,
                    "state": member_locations[0].state,
                    "timestamp": latest_timestamp,
                    "locations": [location.location_id for location in member_locations],
                    "states": sorted({member[0].state for member in members if member[0]}),
                    "source": "Open-Meteo",
                    "source_count": len(member_locations),
                    "report_count": 0,
                    "verified_report_count": 0,
                    "suspicious_report_count": 0,
                    "observed_value": round(sum(float(member[1][metric]) for member in members) / len(members), 2),
                    "metric_name": metric,
                    "unit": unit,
                    "persistence_samples": min_samples,
                    "trigger_reason": f"At least {len(members)} locations within 75 km exceeded the deterministic {threshold} {unit} signal across {min_samples} consecutive successful refreshes.",
                    "alert_level": "INFORMATION",
                    "trend": "PERSISTENT",
                    "data_mode": "LIVE" if all(member[1].get("data_mode") == "LIVE" for member in members) else "FALLBACK",
                    "timeline": [{"timestamp": latest_timestamp, "stage": "DETECTED", "detail": "Deterministic anomaly, persistence and nearby-location criteria met."}],
                })
        return candidates


def _difference(current: Any, baseline: Any) -> float | None:
    if isinstance(current, (int, float)) and isinstance(baseline, (int, float)):
        return round(float(current) - float(baseline), 2)
    return None


def _rainfall_score(ratio: float | None) -> float | None:
    return round(min(100.0, max(0.0, (ratio - 1) * 25)), 1) if ratio is not None else None


def _delta_score(delta: float | None, multiplier: float) -> float | None:
    return round(min(100.0, max(0.0, delta * multiplier)), 1) if delta is not None else None


def _visibility_score(delta: float | None) -> float | None:
    return round(min(100.0, max(0.0, -delta * 20)), 1) if delta is not None else None


def _age_hours(timestamp: Any, now: datetime) -> float:
    if isinstance(timestamp, str):
        try:
            timestamp = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        except ValueError:
            return float("inf")
    if not isinstance(timestamp, datetime):
        return float("inf")
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    return (now - timestamp).total_seconds() / 3600


def _freshness(timestamp: Any) -> str:
    age = _age_hours(timestamp, datetime.now(timezone.utc))
    if age <= 1:
        return "FRESH"
    if age <= 3:
        return "DELAYED"
    if age <= 24:
        return "STALE"
    return "OFFLINE"


def _distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    # Equirectangular approximation is sufficient for this coarse 75 km candidate grouping.
    from math import cos, radians, sqrt

    x = radians(lon2 - lon1) * cos(radians((lat1 + lat2) / 2))
    y = radians(lat2 - lat1)
    return 6371 * sqrt(x * x + y * y)


weather_intelligence = WeatherIntelligenceService()
