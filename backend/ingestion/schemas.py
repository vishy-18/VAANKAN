from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from ..schemas import EventType, SourceType


class SourceClass(str, Enum):
    authoritative_meteorological = "AUTHORITATIVE_METEOROLOGICAL"
    approved_meteorological = "APPROVED_METEOROLOGICAL_DATASET"
    untrusted_external = "UNTRUSTED_EXTERNAL_REPORT"


class DataQualityFlag(str, Enum):
    good = "GOOD"
    questionable = "QUESTIONABLE"
    missing = "MISSING"
    outlier = "OUTLIER"
    cross_source_mismatch = "CROSS_SOURCE_MISMATCH"


class NormalizedWeatherRecord(BaseModel):
    record_id: str = Field(min_length=1)
    source_id: str = Field(min_length=1)
    source_type: SourceType
    source_name: str = Field(min_length=1)
    source_class: SourceClass
    timestamp: datetime
    ingestion_timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    text: str = ""
    language: str = "und"
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    country: str = "India"
    state: str = Field(min_length=1)
    district: str = Field(min_length=1)
    city: str = Field(min_length=1)
    pincode: str | None = None
    event_type: EventType
    temperature_c: float | None = Field(default=None, ge=-90, le=60)
    humidity_percent: float | None = Field(default=None, ge=0, le=100)
    rainfall_mm: float | None = Field(default=None, ge=0, le=5000)
    wind_speed_kmh: float | None = Field(default=None, ge=0, le=500)
    wind_direction_deg: float | None = Field(default=None, ge=0, le=360)
    pressure_hpa: float | None = Field(default=None, ge=800, le=1200)
    visibility_km: float | None = Field(default=None, ge=0, le=100)
    cloud_cover_percent: float | None = Field(default=None, ge=0, le=100)
    image_url: str | None = None
    video_url: str | None = None
    raw_source_reference: str | None = None
    content_hash: str = Field(min_length=64, max_length=64)
    data_quality_flag: DataQualityFlag = DataQualityFlag.good
    demo: bool = False

    @model_validator(mode="after")
    def external_reports_are_not_preverified(self) -> NormalizedWeatherRecord:
        if self.source_class == SourceClass.untrusted_external and self.source_type in {
            SourceType.weather_api,
            SourceType.public_dataset,
        }:
            raise ValueError("meteorological source types cannot be classified as untrusted reports")
        if self.source_class != SourceClass.untrusted_external and self.source_type in {
            SourceType.citizen,
            SourceType.social,
            SourceType.website,
        }:
            raise ValueError("citizen, social, and website reports must pass through VISTA")
        return self


class IngestionReceipt(BaseModel):
    record_id: str
    source_id: str
    source_name: str
    source_class: SourceClass
    route: Literal["VAYU_METEOROLOGY", "VISTA_REVIEW"]
    verification_status: Literal["TRUSTED_SOURCE", "PENDING"]
    deduplication: Literal["NEW_RECORD", "EXACT_DUPLICATE"]
    canonical_record_id: str
    data_quality_flag: DataQualityFlag
    provenance_steps: list[str]
    demo: bool


class IngestionBatchResponse(BaseModel):
    mode: Literal["DEMO"] = "DEMO"
    source_states: dict[str, str]
    received_count: int
    new_record_count: int
    duplicate_count: int
    trusted_meteorological_count: int
    vista_pending_count: int
    receipts: list[IngestionReceipt]