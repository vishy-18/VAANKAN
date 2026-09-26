from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, field_validator


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


class EventType(str, Enum):
    rainfall = "rainfall"
    thunderstorm = "thunderstorm"
    flooding = "flooding"
    heatwave = "heatwave"
    fog = "fog"
    dust_storm = "dust_storm"
    strong_winds = "strong_winds"


class CommonReport(BaseModel):
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


class CitizenRegister(BaseModel):
    name: str = Field(min_length=2)
    email: str = Field(min_length=5)
    password: str = Field(min_length=8)
    address: str = Field(min_length=3)
    phone: str = Field(min_length=7)


class LoginRequest(BaseModel):
    email: str = Field(min_length=5)
    password: str = Field(min_length=8)


class VerificationDecision(BaseModel):
    status: Literal[VerificationStatus.verified, VerificationStatus.suspicious, VerificationStatus.unsupported, VerificationStatus.pending]
    reason: str = Field(min_length=3)


class WeatherObservation(BaseModel):
    observation_id: str
    timestamp: datetime
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    rainfall_mm: float = Field(ge=0)
    temperature_c: float = Field(ge=-60, le=60)
    humidity_percent: float = Field(ge=0, le=100)
    wind_speed_kmh: float = Field(ge=0)
    event_type: EventType


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


