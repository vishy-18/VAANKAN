from datetime import date, datetime, timezone

from .sources.locations import INDIAN_WEATHER_LOCATIONS, WeatherLocation
from .sources.open_meteo import OpenMeteoSource
from .sources.open_meteo_historical import OpenMeteoHistoricalSource
from .sources.weather_intelligence import WeatherIntelligenceService


def _forecast_payload(time_value="2026-09-27T10:00", *, temperature=31.0, rainfall=2.4):
    return {
        "current": {
            "time": time_value,
            "temperature_2m": temperature,
            "relative_humidity_2m": 72,
            "apparent_temperature": 36,
            "precipitation": rainfall,
            "rain": rainfall,
            "pressure_msl": 1007,
            "cloud_cover": 85,
            "visibility": 7800,
            "wind_speed_10m": 18,
            "wind_direction_10m": 140,
            "wind_gusts_10m": 31,
            "dew_point_2m": 24,
            "weather_code": 61,
        },
        "current_units": {"temperature_2m": "°C", "rain": "mm"},
        "hourly": {
            "time": ["2026-09-27T10:00", "2026-09-27T11:00"],
            "temperature_2m": [temperature, temperature + 0.4],
            "relative_humidity_2m": [72, 70],
            "apparent_temperature": [36, 36],
            "precipitation": [rainfall, 0.2],
            "rain": [rainfall, 0.2],
            "pressure_msl": [1007, 1006],
            "cloud_cover": [85, 80],
            "visibility": [7800, 8500],
            "wind_speed_10m": [18, 20],
            "wind_direction_10m": [140, 150],
            "wind_gusts_10m": [31, 34],
            "dew_point_2m": [24, 24],
            "weather_code": [61, 3],
        },
    }


def test_representative_location_catalogue_covers_multiple_regions() -> None:
    assert 50 <= len(INDIAN_WEATHER_LOCATIONS) <= 100
    assert len({location.state for location in INDIAN_WEATHER_LOCATIONS}) >= 20
    assert {"Tamil Nadu", "Ladakh", "Assam", "Gujarat", "Kerala"}.issubset({location.state for location in INDIAN_WEATHER_LOCATIONS})


def test_forecast_normalizer_keeps_missing_measurements_null_and_units() -> None:
    location = WeatherLocation("test", "Test City", "Test District", "Test State", 20, 80)
    source = OpenMeteoSource(locations=(location,))
    payload = _forecast_payload()
    del payload["current"]["pressure_msl"]
    normalized = source._normalize_batch([payload])["test"]

    assert normalized["source_name"] == "Open-Meteo"
    assert normalized["temperature_c"] == 31
    assert normalized["pressure_hpa"] is None
    assert normalized["visibility_km"] == 7.8
    assert normalized["data_mode"] == "LIVE"
    assert normalized["source_units"]["rain"] == "mm"
    assert normalized["hourly"][0]["rainfall_mm"] == 2.4


def test_malformed_location_is_skipped_without_failing_other_locations() -> None:
    locations = (
        WeatherLocation("good", "Good", "Good", "State", 20, 80),
        WeatherLocation("bad", "Bad", "Bad", "State", 21, 81),
    )
    source = OpenMeteoSource(locations=locations)
    normalized = source._normalize_batch([_forecast_payload(), {"current": None, "hourly": {}}])

    assert list(normalized) == ["good"]


def test_historical_normalizer_returns_available_recent_baselines() -> None:
    location = WeatherLocation("test", "Test City", "Test District", "Test State", 20, 80)
    source = OpenMeteoHistoricalSource(locations=(location,))
    daily = {
        "time": ["2026-08-01", "2026-08-02"],
        "temperature_2m_mean": [30, 32],
        "precipitation_sum": [12, 0],
        "wind_speed_10m_max": [20, 30],
    }
    normalized = source._normalize(
        [{"daily": daily, "hourly": {"visibility": [6000, None, 8000]}}],
        date(2026, 8, 1),
        date(2026, 8, 2),
    )["test"]

    assert normalized["historical_temperature_avg_c"] == 31
    assert normalized["historical_rainfall_daily_avg_mm"] == 6
    assert normalized["historical_wind_speed_avg_kmh"] == 25
    assert normalized["historical_visibility_avg_km"] == 7
    assert "not climate normals" in normalized["baseline_source"]


def test_weather_intelligence_calculates_explainable_anomalies_without_probability() -> None:
    service = WeatherIntelligenceService()
    record = service._enrich(
        {
            "observation_id": "open-meteo:test:2026-09-27T10:00:00+00:00",
            "timestamp": datetime.now(timezone.utc),
            "temperature_c": 35,
            "rainfall_mm": 12,
            "wind_speed_kmh": 40,
            "visibility_km": 3,
        },
        {
            "historical_temperature_avg_c": 30,
            "historical_rainfall_daily_avg_mm": 72,
            "historical_wind_speed_avg_kmh": 20,
            "historical_visibility_avg_km": 8,
            "baseline_observation_days": 30,
        },
    )

    assert record["temperature_anomaly_c"] == 5
    assert record["rainfall_anomaly_mm"] == 9
    assert record["rainfall_anomaly_ratio"] == 4
    assert record["weather_anomaly_score"] is not None
    assert "not ML" in record["anomaly_components"]["method"]


def test_weather_intelligence_keeps_missing_baselines_unassessed() -> None:
    service = WeatherIntelligenceService()
    record = service._enrich({"observation_id": "open-meteo:test:now", "timestamp": datetime.now(timezone.utc), "temperature_c": 22}, None)

    assert record["temperature_anomaly_c"] is None
    assert record["weather_anomaly_score"] is None
