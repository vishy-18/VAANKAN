from __future__ import annotations

import asyncio
import os
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from .locations import INDIAN_WEATHER_LOCATIONS, WeatherLocation

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
CURRENT_FIELDS = (
    "temperature_2m", "relative_humidity_2m", "apparent_temperature", "precipitation", "rain",
    "pressure_msl", "cloud_cover", "visibility", "wind_speed_10m", "wind_direction_10m",
    "wind_gusts_10m", "dew_point_2m", "weather_code",
)
HOURLY_FIELDS = (
    "temperature_2m", "relative_humidity_2m", "apparent_temperature", "precipitation", "rain",
    "pressure_msl", "cloud_cover", "visibility", "wind_speed_10m", "wind_direction_10m",
    "wind_gusts_10m", "dew_point_2m", "weather_code",
)


def _number(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (float, int)):
        return None
    number = float(value)
    return number if number == number and abs(number) != float("inf") else None


def _timestamp(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)


class OpenMeteoSource:
    """Batched Open-Meteo provider with bounded retry and last-success cache."""

    def __init__(
        self,
        *,
        locations: tuple[WeatherLocation, ...] = INDIAN_WEATHER_LOCATIONS,
        timeout_seconds: float = 12,
        cache_ttl_seconds: int = 600,
        max_retries: int = 2,
        client_factory=httpx.AsyncClient,
    ) -> None:
        self.locations = locations
        self.timeout_seconds = timeout_seconds
        self.cache_ttl = timedelta(seconds=cache_ttl_seconds)
        self.max_retries = max_retries
        self.client_factory = client_factory
        self._cache: dict[str, dict[str, Any]] = {}
        self._last_success_at: datetime | None = None
        self._last_error: str | None = None
        self._status = "READY"
        self._stale_locations: set[str] = set()
        self._lock = asyncio.Lock()

    def metadata(self) -> dict[str, Any]:
        return {
            "source_id": "open-meteo",
            "source_name": "Open-Meteo",
            "source_type": "WEATHER_MODEL",
            "source_url": FORECAST_URL,
            "status": self._status,
            "mode": "LIVE" if self._status == "LIVE" else self._status,
            "last_success_at": self._last_success_at.isoformat() if self._last_success_at else None,
            "error": self._last_error,
            "location_count": len(self.locations),
            "coverage_note": "Representative monitoring locations; not complete national coverage.",
        }

    async def fetch_current(self, *, force_refresh: bool = False) -> dict[str, Any]:
        async with self._lock:
            now = datetime.now(timezone.utc)
            if not force_refresh and self._cache and self._last_success_at and now - self._last_success_at < self.cache_ttl:
                return self._snapshot("LIVE", cached=True)
            try:
                responses = await self._fetch_batch()
                normalized = self._normalize_batch(responses)
                missing = [location for location in self.locations if location.location_id not in normalized]
                self._stale_locations = set()
                for location in missing:
                    try:
                        individual = await self._fetch_batch((location,))
                        normalized.update(self._normalize_batch(individual, (location,)))
                    except (httpx.HTTPError, ValueError, KeyError, TypeError):
                        if location.location_id in self._cache:
                            self._stale_locations.add(location.location_id)
                        continue
                if not normalized and not self._cache:
                    raise ValueError("Open-Meteo returned no valid location observations")
                self._cache.update(normalized)
                self._last_success_at = now
                self._last_error = None if len(normalized) == len(self.locations) else "One or more locations returned invalid or unavailable data"
                self._status = "LIVE" if len(normalized) == len(self.locations) else "DEGRADED"
                return self._snapshot(self._status, cached=False)
            except (httpx.HTTPError, ValueError, KeyError, TypeError) as error:
                self._last_error = str(error)[:300]
                if self._cache:
                    self._stale_locations = set(self._cache)
                    self._status = "DEGRADED"
                    return self._snapshot("DEGRADED", cached=True)
                self._status = "ERROR"
                return {"source": self.metadata(), "data_mode": "NOT_CONNECTED", "observations": [], "hourly": [], "failures": len(self.locations)}

    async def _fetch_batch(self, locations: tuple[WeatherLocation, ...] | None = None) -> list[dict[str, Any]]:
        selected = locations or self.locations
        params = {
            "latitude": ",".join(str(location.latitude) for location in selected),
            "longitude": ",".join(str(location.longitude) for location in selected),
            "current": ",".join(CURRENT_FIELDS),
            "hourly": ",".join(HOURLY_FIELDS),
            "forecast_days": "2",
            "timezone": "UTC",
        }
        last_error: Exception | None = None
        async with self.client_factory(timeout=self.timeout_seconds) as client:
            for attempt in range(self.max_retries + 1):
                try:
                    response = await client.get(FORECAST_URL, params=params)
                    response.raise_for_status()
                    payload = response.json()
                    if isinstance(payload, dict):
                        payload = [payload]
                    if not isinstance(payload, list):
                        raise ValueError("Open-Meteo response must be an object or array")
                    return [item for item in payload if isinstance(item, dict)]
                except (httpx.HTTPError, ValueError) as error:
                    last_error = error
                    if attempt < self.max_retries:
                        await asyncio.sleep(min(0.25 * (2 ** attempt), 1.0))
        raise ValueError(f"Open-Meteo request failed: {last_error}")

    def _normalize_batch(
        self,
        payloads: list[dict[str, Any]],
        locations: tuple[WeatherLocation, ...] | None = None,
    ) -> dict[str, dict[str, Any]]:
        selected = locations or self.locations
        normalized: dict[str, dict[str, Any]] = {}
        for index, payload in enumerate(payloads[:len(selected)]):
            location = selected[index]
            current = payload.get("current")
            current_units = payload.get("current_units")
            hourly = payload.get("hourly")
            if not isinstance(current, dict) or not isinstance(hourly, dict):
                continue
            timestamp = _timestamp(current.get("time"))
            times = hourly.get("time")
            if timestamp is None or not isinstance(times, list):
                continue
            hourly_rows = []
            for hour_index, hour in enumerate(times):
                hour_timestamp = _timestamp(hour)
                if hour_timestamp is None:
                    continue
                values = {
                    "temperature_c": _at(hourly, "temperature_2m", hour_index),
                    "feels_like_c": _at(hourly, "apparent_temperature", hour_index),
                    "humidity_percent": _at(hourly, "relative_humidity_2m", hour_index),
                    "precipitation_mm": _at(hourly, "precipitation", hour_index),
                    "rainfall_mm": _at(hourly, "rain", hour_index),
                    "rainfall_1h_mm": _at(hourly, "rain", hour_index),
                    "pressure_hpa": _at(hourly, "pressure_msl", hour_index),
                    "cloud_cover_percent": _at(hourly, "cloud_cover", hour_index),
                    "visibility_m": _at(hourly, "visibility", hour_index),
                    "wind_speed_kmh": _at(hourly, "wind_speed_10m", hour_index),
                    "wind_direction_deg": _at(hourly, "wind_direction_10m", hour_index),
                    "wind_gust_kmh": _at(hourly, "wind_gusts_10m", hour_index),
                    "dew_point_c": _at(hourly, "dew_point_2m", hour_index),
                    "weather_code": _at(hourly, "weather_code", hour_index),
                }
                hourly_rows.append({"timestamp": hour_timestamp, **values})
            current_values = {
                "temperature_c": _number(current.get("temperature_2m")),
                "feels_like_c": _number(current.get("apparent_temperature")),
                "humidity_percent": _number(current.get("relative_humidity_2m")),
                "precipitation_mm": _number(current.get("precipitation")),
                "rainfall_mm": _number(current.get("rain")),
                "rainfall_1h_mm": _number(current.get("rain")),
                "pressure_hpa": _number(current.get("pressure_msl")),
                "cloud_cover_percent": _number(current.get("cloud_cover")),
                "visibility_m": _number(current.get("visibility")),
                "wind_speed_kmh": _number(current.get("wind_speed_10m")),
                "wind_direction_deg": _number(current.get("wind_direction_10m")),
                "wind_gust_kmh": _number(current.get("wind_gusts_10m")),
                "dew_point_c": _number(current.get("dew_point_2m")),
                "weather_code": _number(current.get("weather_code")),
            }
            normalized[location.location_id] = {
                "observation_id": f"open-meteo:{location.location_id}:{timestamp.isoformat()}",
                "source_id": "open-meteo",
                "source_type": "WEATHER_MODEL",
                "source_name": "Open-Meteo",
                "timestamp": timestamp,
                "ingested_at": datetime.now(timezone.utc),
                "latitude": location.latitude,
                "longitude": location.longitude,
                "city": location.city,
                "district": location.district,
                "state": location.state,
                **current_values,
                "visibility_km": current_values["visibility_m"] / 1000 if current_values["visibility_m"] is not None else None,
                "weather_condition_code": current_values["weather_code"],
                "weather_condition": _weather_condition(current_values["weather_code"]),
                "source_units": current_units if isinstance(current_units, dict) else {},
                "data_quality_flag": "PROVIDER_REPORTED",
                "data_mode": "LIVE",
                "historical_rainfall_avg_mm": None,
                "historical_temperature_avg_c": None,
                "rainfall_anomaly_mm": None,
                "temperature_anomaly_c": None,
                "wind_anomaly_kmh": None,
                "weather_anomaly_score": None,
                "hourly": hourly_rows,
            }
        return normalized

    def _snapshot(self, mode: str, *, cached: bool) -> dict[str, Any]:
        observations = []
        hourly = []
        for location in self.locations:
            record = self._cache.get(location.location_id)
            if not record:
                continue
            observation = {key: value for key, value in record.items() if key != "hourly"}
            if location.location_id in self._stale_locations:
                observation["data_mode"] = "FALLBACK"
                observation["data_quality_flag"] = "CACHED_LAST_SUCCESS"
            observations.append(observation)
            hourly.extend({"location_id": location.location_id, "city": location.city, "district": location.district, "state": location.state, "latitude": location.latitude, "longitude": location.longitude, **item} for item in record["hourly"])
        source = self.metadata()
        source["status"] = "DEGRADED" if cached and mode == "DEGRADED" else mode
        return {"source": source, "data_mode": "FALLBACK" if cached and mode == "DEGRADED" else mode, "observations": observations, "hourly": hourly, "failures": len(self.locations) - len(observations)}


def _at(series: dict[str, Any], name: str, index: int) -> float | None:
    values = series.get(name)
    return _number(values[index]) if isinstance(values, list) and index < len(values) else None


def _weather_condition(code: float | None) -> str | None:
    if code is None:
        return None
    code_map = {
        0: "Clear", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
        45: "Fog", 48: "Depositing rime fog", 51: "Drizzle", 53: "Drizzle", 55: "Drizzle",
        61: "Rain", 63: "Rain", 65: "Heavy rain", 71: "Snow", 73: "Snow", 75: "Heavy snow",
        80: "Rain showers", 81: "Rain showers", 82: "Heavy rain showers", 95: "Thunderstorm",
        96: "Thunderstorm with hail", 99: "Thunderstorm with hail",
    }
    return code_map.get(int(code), "Unknown provider weather code")


OPEN_METEO_ENABLED = os.getenv("OPEN_METEO_ENABLED", "true").strip().lower() not in {"0", "false", "no"}
open_meteo_source = OpenMeteoSource()
