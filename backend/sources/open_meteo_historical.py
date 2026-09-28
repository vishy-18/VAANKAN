from __future__ import annotations

import asyncio
from datetime import date, datetime, timedelta, timezone
from typing import Any

import httpx

from .locations import INDIAN_WEATHER_LOCATIONS, WeatherLocation

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"


def _mean(values: Any) -> float | None:
    if not isinstance(values, list):
        return None
    numeric = [float(value) for value in values if isinstance(value, (float, int)) and not isinstance(value, bool)]
    return sum(numeric) / len(numeric) if numeric else None


class OpenMeteoHistoricalSource:
    """Rolling historical baselines from Open-Meteo archive data, not climate normals."""

    def __init__(
        self,
        *,
        locations: tuple[WeatherLocation, ...] = INDIAN_WEATHER_LOCATIONS,
        timeout_seconds: float = 20,
        cache_ttl_seconds: int = 86_400,
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
        self._lock = asyncio.Lock()

    def metadata(self) -> dict[str, Any]:
        return {
            "source_id": "open-meteo-archive",
            "source_name": "Open-Meteo Historical Weather",
            "source_type": "HISTORICAL_WEATHER",
            "source_url": ARCHIVE_URL,
            "status": self._status,
            "mode": "HISTORICAL" if self._status == "CONNECTED" else self._status,
            "last_success_at": self._last_success_at.isoformat() if self._last_success_at else None,
            "error": self._last_error,
            "baseline_window_days": 30,
            "coverage_note": "Rolling recent baseline; not a long-term climatological normal.",
        }

    async def fetch_baselines(self, *, force_refresh: bool = False) -> dict[str, Any]:
        async with self._lock:
            now = datetime.now(timezone.utc)
            if not force_refresh and self._cache and self._last_success_at and now - self._last_success_at < self.cache_ttl:
                return self._snapshot("HISTORICAL", cached=True)
            end_date = date.today() - timedelta(days=5)
            start_date = end_date - timedelta(days=29)
            params = {
                "latitude": ",".join(str(location.latitude) for location in self.locations),
                "longitude": ",".join(str(location.longitude) for location in self.locations),
                "daily": "temperature_2m_mean,precipitation_sum,wind_speed_10m_max",
                "hourly": "visibility",
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
                "timezone": "UTC",
            }
            try:
                payloads = await self._request(params)
                normalized = self._normalize(payloads, start_date, end_date)
                missing = [location for location in self.locations if location.location_id not in normalized]
                for location in missing:
                    try:
                        one_params = dict(params)
                        one_params["latitude"] = str(location.latitude)
                        one_params["longitude"] = str(location.longitude)
                        one = await self._request(one_params)
                        normalized.update(self._normalize(one, start_date, end_date, (location,)))
                    except (httpx.HTTPError, ValueError, KeyError, TypeError):
                        continue
                self._cache.update(normalized)
                self._last_success_at = now
                self._last_error = None if len(normalized) == len(self.locations) else "Historical baseline unavailable for one or more locations"
                self._status = "CONNECTED" if normalized else "ERROR"
                mode = "HISTORICAL" if len(normalized) == len(self.locations) else "DEGRADED"
                return self._snapshot(mode, cached=False)
            except (httpx.HTTPError, ValueError, KeyError, TypeError) as error:
                self._last_error = str(error)[:300]
                self._status = "DEGRADED" if self._cache else "ERROR"
                return self._snapshot("HISTORICAL_FALLBACK" if self._cache else "NOT_CONNECTED", cached=bool(self._cache))

    async def _request(self, params: dict[str, str]) -> list[dict[str, Any]]:
        last_error: Exception | None = None
        async with self.client_factory(timeout=self.timeout_seconds) as client:
            for attempt in range(self.max_retries + 1):
                try:
                    response = await client.get(ARCHIVE_URL, params=params)
                    response.raise_for_status()
                    payload = response.json()
                    if isinstance(payload, dict):
                        payload = [payload]
                    if not isinstance(payload, list):
                        raise ValueError("Open-Meteo historical response must be an object or array")
                    return [item for item in payload if isinstance(item, dict)]
                except (httpx.HTTPError, ValueError) as error:
                    last_error = error
                    if attempt < self.max_retries:
                        await asyncio.sleep(min(0.25 * (2 ** attempt), 1.0))
        raise ValueError(f"Open-Meteo historical request failed: {last_error}")

    def _normalize(
        self,
        payloads: list[dict[str, Any]],
        start_date: date,
        end_date: date,
        locations: tuple[WeatherLocation, ...] | None = None,
    ) -> dict[str, dict[str, Any]]:
        selected = locations or self.locations
        output: dict[str, dict[str, Any]] = {}
        for index, payload in enumerate(payloads[:len(selected)]):
            location = selected[index]
            daily = payload.get("daily")
            hourly = payload.get("hourly")
            if not isinstance(daily, dict):
                continue
            temperature = _mean(daily.get("temperature_2m_mean"))
            rainfall = _mean(daily.get("precipitation_sum"))
            wind = _mean(daily.get("wind_speed_10m_max"))
            visibility = _mean(hourly.get("visibility")) if isinstance(hourly, dict) else None
            output[location.location_id] = {
                "location_id": location.location_id,
                "city": location.city,
                "district": location.district,
                "state": location.state,
                "latitude": location.latitude,
                "longitude": location.longitude,
                "historical_temperature_avg_c": temperature,
                "historical_rainfall_daily_avg_mm": rainfall,
                "historical_wind_speed_avg_kmh": wind,
                "historical_visibility_avg_km": visibility / 1000 if visibility is not None else None,
                "baseline_start_date": start_date,
                "baseline_end_date": end_date,
                "baseline_observation_days": len(daily.get("time", [])) if isinstance(daily.get("time"), list) else 0,
                "baseline_source": "Open-Meteo archive; recent rolling baseline, not climate normals",
                "data_mode": "HISTORICAL",
            }
        return output

    def _snapshot(self, mode: str, *, cached: bool) -> dict[str, Any]:
        source = self.metadata()
        source["status"] = "DEGRADED" if mode in {"DEGRADED", "HISTORICAL_FALLBACK", "NOT_CONNECTED"} else self._status
        return {
            "source": source,
            "data_mode": "HISTORICAL_FALLBACK" if cached and mode == "HISTORICAL_FALLBACK" else mode,
            "baselines": list(self._cache.values()),
            "cached": cached,
            "failures": len(self.locations) - len(self._cache),
        }


open_meteo_historical_source = OpenMeteoHistoricalSource()
