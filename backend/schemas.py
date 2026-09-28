from datetime import date, datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class SourceType(str, Enum):
    citizen = "citizen"
    weather_api = "weather_api"
    public_dataset = "public_dataset"
    social = "social"
    website = "website"


class VerificationStatus(str, Enum):
    verified = "VERIFIED"
    suspicious = "SUSPICIOUS"
    unsupported = "UNSUPPORTED"
    pending = "PENDING"
    verified_and_submitted_to_vayu = "VERIFIED_AND_SUBMITTED_TO_VAYU"


class EventType(str, Enum):
    rainfall = "rainfall"
    thunderstorm = "thunderstorm"
    flooding = "flooding"
    heatwave = "heatwave"
    fog = "fog"
    dust_storm = "dust_storm"
    strong_winds = "strong_winds"


class CommonReport(BaseModel):
    model_config = ConfigDict(extra="allow")

    record_id: str = Field(min_length=1)
    source_type: SourceType
    source_name: str = Field(min_length=1)
    timestamp: datetime
    text: str = Field(min_length=1)
    language: str = Field(min_length=2, max_length=16)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    city: str = Field(min_length=1)
    district: str = Field(min_length=1)
    state: str = Field(min_length=1)
    event_type_claimed: EventType
    image_url: str | None = None
    video_url: str | None = None
    verification_status: VerificationStatus = VerificationStatus.pending
    submitted: bool = False
    submitted_at: datetime | None = None
    citizen_id: str | None = None
    description: str | None = None
    locality: str | None = None
    pincode: str | None = None
    event_start_time: datetime | None = None
    event_end_time: datetime | None = None
    is_ongoing: bool | None = None
    citizen_reported_severity: str | None = None
    reported_latitude: float | None = None
    reported_longitude: float | None = None
    status: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    vista_status: str | None = None
    admin_final_decision: str | None = None
    vayu_submission_status: str | None = None


class CitizenRegister(BaseModel):
    name: str = Field(min_length=2)
    email: str = Field(min_length=5)
    password: str = Field(min_length=8)
    address: str = Field(min_length=3)
    phone: str = Field(min_length=7)
    government_id: str = Field(min_length=4, max_length=80)


class LoginRequest(BaseModel):
    email: str = Field(min_length=5)
    password: str = Field(min_length=8)


class VerificationDecision(BaseModel):
    status: Literal[VerificationStatus.verified, VerificationStatus.suspicious, VerificationStatus.unsupported, VerificationStatus.pending]
    reason: str = Field(min_length=3)


class VayuSubmissionResponse(BaseModel):
    report_id: str
    status: VerificationStatus
    submitted: bool = True
    submitted_at: datetime | None = None
    vayu_status: str = "SUBMITTED"
    verified_ground_observation_id: str
    alert_id: str | None = None
    notified_count: int = 0
    email_status: str = "not_triggered"
    message: str


class WeatherObservation(BaseModel):
    observation_id: str = Field(min_length=1)
    source_id: str = Field(min_length=1)
    source_type: str = Field(min_length=1)
    source_name: str = Field(min_length=1)
    timestamp: datetime
    ingested_at: datetime | None = None
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    city: str | None = None
    district: str | None = None
    state: str | None = None
    temperature_c: float | None = Field(default=None, ge=-90, le=70)
    feels_like_c: float | None = Field(default=None, ge=-90, le=80)
    humidity_percent: float | None = Field(default=None, ge=0, le=100)
    precipitation_mm: float | None = Field(default=None, ge=0)
    rainfall_mm: float | None = Field(default=None, ge=0)
    rainfall_1h_mm: float | None = Field(default=None, ge=0)
    rainfall_3h_mm: float | None = Field(default=None, ge=0)
    rainfall_24h_mm: float | None = Field(default=None, ge=0)
    wind_speed_kmh: float | None = Field(default=None, ge=0)
    wind_direction_deg: float | None = Field(default=None, ge=0, le=360)
    wind_gust_kmh: float | None = Field(default=None, ge=0)
    pressure_hpa: float | None = Field(default=None, ge=700, le=1200)
    cloud_cover_percent: float | None = Field(default=None, ge=0, le=100)
    visibility_km: float | None = Field(default=None, ge=0)
    dew_point_c: float | None = Field(default=None, ge=-100, le=70)
    weather_condition: str | None = None
    weather_condition_code: int | None = None
    historical_rainfall_avg_mm: float | None = Field(default=None, ge=0)
    historical_temperature_avg_c: float | None = None
    historical_wind_speed_avg_kmh: float | None = Field(default=None, ge=0)
    historical_visibility_avg_km: float | None = Field(default=None, ge=0)
    historical_rainfall_daily_avg_mm: float | None = Field(default=None, ge=0)
    baseline_start_date: date | None = None
    baseline_end_date: date | None = None
    baseline_observation_days: int = Field(default=0, ge=0)
    baseline_source: str | None = None
    rainfall_anomaly_mm: float | None = None
    rainfall_anomaly_ratio: float | None = None
    temperature_anomaly_c: float | None = None
    wind_anomaly_kmh: float | None = None
    visibility_anomaly_km: float | None = None
    weather_anomaly_score: float | None = Field(default=None, ge=0, le=100)
    anomaly_components: dict[str, float | str | None] = Field(default_factory=dict)
    data_quality_flag: str = "UNKNOWN"
    freshness_status: str = "UNKNOWN"
    data_mode: str = "UNKNOWN"
    source_units: dict[str, str] = Field(default_factory=dict)


class GroundObservation(BaseModel):
    observation_id: str
    source: Literal["ADMIN_REVIEW"] = "ADMIN_REVIEW"
    report_id: str
    event_type: EventType
    timestamp: datetime
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    city: str
    district: str
    state: str
    verification_status: Literal["VERIFIED"] = "VERIFIED"
    verification_method: Literal["admin"] = "admin"
    verification_confidence: float | None = None
    vayu_status: str = "READY_FOR_ANALYSIS"
    verified_by: str | None = None
    verified_at: datetime | None = None
    submitted_to_vayu_at: datetime | None = None


class WeatherEvent(BaseModel):
    event_id: str
    event_type: EventType
    title: str
    city: str
    district: str
    state: str
    latitude: float
    longitude: float
    first_seen_at: datetime
    last_updated_at: datetime
    status: Literal["DETECTED", "CORRELATED", "ACTIVE"]
    severity: Literal["UNASSESSED"] = "UNASSESSED"
    verified_report_count: int
    verified_media_count: int
    observation_ids: list[str]
    meteorological_evidence: dict[str, float | None]
    vayu_analysis: dict[str, float | None]
    data_mode: Literal["DEMO"] = "DEMO"


class CitizenAlertAcknowledgement(BaseModel):
    id: str
    citizen_id: str
    alert_id: str
    acknowledged_at: datetime
    source: str | None = None


class CitizenActivity(BaseModel):
    id: str
    citizen_id: str
    type: str
    title: str
    description: str
    timestamp: datetime
    related_id: str | None = None
    status: str = "ACTIVE"


class HealthResponse(BaseModel):
    status: str
    mode: str
    version: str


class NotificationDispatch(BaseModel):
    report_id: str = Field(min_length=1)
    email: str = Field(min_length=5)
    phone: str = Field(min_length=7)
    subject: str = Field(min_length=1)
    body: str = Field(min_length=1)


class SendEmailRequest(BaseModel):
    recipient: str = Field(min_length=5)
    subject: str = Field(min_length=1)
    body: str = Field(default="")
    template_type: Literal["weather_alert", "welcome", "admin_verification", "test", "custom"] = "weather_alert"
    template_data: dict[str, object] | None = None


class SendEmailResponse(BaseModel):
    status: str
    recipient: str
    subject: str
    error: str | None = None


class VerificationSubmissionRequest(BaseModel):
    status: VerificationStatus
    reason: str = Field(min_length=2)
    operator: str = Field(default="A. Sharma")
    additional_emails: list[str] | None = None


