from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from .database import check_database_readiness, get_configured_engine, get_database_session, get_storage_backend
from .email_service import get_smtp_config, send_email_service
from .notifications import send_email, send_sms
from .schemas import (
    CitizenRegister,
    CommonReport,
    HealthResponse,
    LoginRequest,
    NotificationDispatch,
    SendEmailRequest,
    SendEmailResponse,
    VerificationDecision,
    VerificationStatus,
    VerificationSubmissionRequest,
    GroundObservation,
    WeatherEvent,
)
from .store import store
from .services import PersistenceService
from .ingestion.adapters import DemoCitizenAdapter, DemoImdAdapter
from .ingestion.pipeline import IngestionPreviewPipeline
from .ingestion.schemas import IngestionBatchResponse

app = FastAPI(title="VAANKAN API", version="0.1.0", description="Demo API seam for the SIH26069 weather intelligence platform.")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(IntegrityError)
def handle_integrity_error(_request, _error: IntegrityError) -> JSONResponse:
    return JSONResponse(status_code=409, content={"detail": "A record with the same identifier already exists"})


@app.exception_handler(SQLAlchemyError)
def handle_database_error(_request, _error: SQLAlchemyError) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": "Database operation failed"})


def get_data_store(session: Session | None):
    if get_storage_backend() == "postgres":
        if session is None:
            raise HTTPException(status_code=503, detail="Database storage is not available")
        return PersistenceService(session)
    return store


def commit_database_session(session: Session | None) -> None:
    if session is not None:
        session.commit()


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    mode = "postgres" if get_storage_backend() == "postgres" else "demo-memory"
    return HealthResponse(status="ok", mode=mode, version=app.version)


@app.get("/api/system/health")
def system_health() -> dict[str, object]:
    if get_storage_backend() != "postgres":
        return {"status": "ok", "storage": "memory", "database": "not_configured", "postgis": "not_configured"}
    try:
        engine = get_configured_engine()
        if engine is None:
            raise RuntimeError("PostgreSQL storage is not configured")
        return {"status": "ok", "storage": "postgres", **check_database_readiness(engine)}
    except Exception as error:
        raise HTTPException(status_code=503, detail="Database or PostGIS is unavailable") from error


@app.get("/api/ingestion/sources")
def ingestion_sources() -> dict[str, object]:
    return {
        "mode": "DEMO",
        "sources": [
            DemoImdAdapter().get_metadata(),
            DemoCitizenAdapter().get_metadata(),
            {"source_id": "imd-api", "source_name": "India Meteorological Department", "status": "NOT_CONFIGURED", "mode": "UNAVAILABLE"},
            {"source_id": "mosdac", "source_name": "MOSDAC / ISRO", "status": "NOT_CONFIGURED", "mode": "UNAVAILABLE"},
            {"source_id": "data-gov-in", "source_name": "Government Open Data", "status": "NOT_CONFIGURED", "mode": "UNAVAILABLE"},
        ],
    }


@app.post("/api/ingestion/demo-preview", response_model=IngestionBatchResponse)
def ingestion_demo_preview() -> IngestionBatchResponse:
    pipeline = IngestionPreviewPipeline([DemoImdAdapter(), DemoCitizenAdapter()])
    return pipeline.run()


@app.post("/api/auth/citizen/register", status_code=status.HTTP_201_CREATED)
def register(request: CitizenRegister, session: Session | None = Depends(get_database_session)) -> dict[str, object]:
    data_store = get_data_store(session)
    try:
        user = data_store.add_user(request.email, request.password, name=request.name, address=request.address, phone=request.phone)
        try:
            send_email_service(
                recipient=request.email,
                subject="Welcome to VAANKAN Citizen Weather Intelligence",
                body=f"Hello {request.name}, your registration with VAANKAN is complete.",
                template_type="welcome",
                template_data={"name": request.name, "address": request.address},
            )
        except Exception:
            pass
        commit_database_session(session)
        return user
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except IntegrityError as error:
        raise HTTPException(status_code=409, detail="email already registered") from error


@app.post("/api/auth/citizen/login")
def login(request: LoginRequest, session: Session | None = Depends(get_database_session)) -> dict[str, str]:
    user = get_data_store(session).authenticate(request.email, request.password)
    if not user:
        raise HTTPException(status_code=401, detail="invalid credentials")
    return {"access_token": f"demo-{user['user_id']}", "token_type": "bearer", "user_id": user["user_id"]}


@app.post("/api/reports", response_model=CommonReport, status_code=status.HTTP_201_CREATED)
def create_report(report: CommonReport, session: Session | None = Depends(get_database_session)) -> CommonReport:
    try:
        created = get_data_store(session).add_report(report)
        commit_database_session(session)
        return created
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except IntegrityError as error:
        raise HTTPException(status_code=409, detail="record_id already exists") from error
    except SQLAlchemyError as error:
        raise HTTPException(status_code=503, detail="Report could not be persisted") from error


@app.get("/api/reports", response_model=list[CommonReport])
def list_reports(
    event_type: str | None = Query(default=None),
    verification_status: VerificationStatus | None = None,
    region: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: Session | None = Depends(get_database_session),
) -> list[CommonReport]:
    return get_data_store(session).list_reports(
        event_type=event_type,
        verification_status=verification_status,
        region=region,
        limit=limit,
        offset=offset,
    )


@app.get("/api/reports/nearby", response_model=list[CommonReport])
def nearby_reports(
    latitude: float = Query(ge=-90, le=90),
    longitude: float = Query(ge=-180, le=180),
    radius_km: float = Query(gt=0, le=500),
    verification_status: VerificationStatus | None = None,
    event_type: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    session: Session | None = Depends(get_database_session),
) -> list[CommonReport]:
    return get_data_store(session).nearby_reports(
        latitude,
        longitude,
        radius_km,
        verification_status=verification_status,
        event_type=event_type,
        limit=limit,
    )


@app.get("/api/reports/{report_id}", response_model=CommonReport)
def get_report(report_id: str, session: Session | None = Depends(get_database_session)) -> CommonReport:
    report = get_data_store(session).get_report(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="report not found")
    return report


def _submit_verification(report_id: str, request: VerificationSubmissionRequest, data_store) -> dict[str, object]:
    report = data_store.get_report(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="report not found")

    notified_users: list[dict[str, object]] = []
    overall_email_status = "not_triggered"

    # Automatically send email ONLY IF status is VERIFIED
    if request.status == VerificationStatus.verified:
        users_in_range = data_store.find_users_within_radius(report.latitude, report.longitude, radius_km=10.0)

        # Build target map
        target_emails = {user["email"]: user for user in users_in_range}
        if request.additional_emails:
            for extra in request.additional_emails:
                if extra not in target_emails:
                    target_emails[extra] = {"email": extra, "name": "Citizen", "distance_km": 0.0}

        successful_emails = 0
        email_statuses = []
        for recipient_info in target_emails.values():
            recip_email = str(recipient_info["email"])
            dist_km = float(recipient_info.get("distance_km", 0.0))
            status_str, err = send_email_service(
                recipient=recip_email,
                subject=f"[VAANKAN VERIFIED ALERT] {report.event_type_claimed.value.upper()} at {report.city}",
                body=f"Verified weather alert: {report.text}. Please take safety precautions.",
                template_type="weather_alert",
                template_data={
                    "title": report.text,
                    "location": f"{report.city}, {report.district}, {report.state}",
                    "event_type": report.event_type_claimed.value,
                    "severity": "High",
                    "description": f"Verified weather event confirmed by admin operator ({request.operator}). Operator note: {request.reason}.",
                    "distance_km": dist_km,
                    "report_id": report_id,
                },
            )
            email_statuses.append(status_str)
            if status_str == "sent":
                successful_emails += 1
            notified_users.append({
                "email": recip_email,
                "distance_km": dist_km,
                "status": status_str,
                "error": err,
            })

        if successful_emails > 0:
            overall_email_status = "sent"
        elif "not_configured" in email_statuses:
            overall_email_status = "not_configured"
        elif email_statuses:
            overall_email_status = "failed"
        else:
            overall_email_status = "no_users_in_range"

    submission = data_store.apply_decision(
        report_id,
        status=request.status,
        reason=request.reason,
        operator=request.operator,
        notified_users=notified_users,
        email_status=overall_email_status,
    )
    if submission is None:
        raise HTTPException(status_code=404, detail="report not found")
    commit_database_session(getattr(data_store, "session", None))
    return submission


@app.post("/api/admin/reports/{report_id}/submit-verification")
def submit_verification(
    report_id: str,
    request: VerificationSubmissionRequest,
    session: Session | None = Depends(get_database_session),
) -> dict[str, object]:
    return _submit_verification(report_id, request, get_data_store(session))


@app.post("/api/admin/reports/{report_id}/decision", response_model=CommonReport)
def decide_report(report_id: str, decision: VerificationDecision, session: Session | None = Depends(get_database_session)) -> CommonReport:
    data_store = get_data_store(session)
    _submit_verification(
        report_id=report_id,
        request=VerificationSubmissionRequest(status=decision.status, reason=decision.reason, operator="Admin Operator"),
        data_store=data_store,
    )
    return data_store.get_report(report_id)


@app.post("/api/admin/reports/{report_id}/verify", response_model=CommonReport)
def verify_report(report_id: str, decision: VerificationDecision, session: Session | None = Depends(get_database_session)) -> CommonReport:
    data_store = get_data_store(session)
    _submit_verification(
        report_id=report_id,
        request=VerificationSubmissionRequest(status=VerificationStatus.verified, reason=decision.reason, operator="Admin Operator"),
        data_store=data_store,
    )
    return data_store.get_report(report_id)


@app.post("/api/admin/reports/{report_id}/review", response_model=CommonReport)
def review_report(report_id: str, decision: VerificationDecision, session: Session | None = Depends(get_database_session)) -> CommonReport:
    data_store = get_data_store(session)
    _submit_verification(
        report_id=report_id,
        request=VerificationSubmissionRequest(status=VerificationStatus.pending, reason=decision.reason, operator="Admin Operator"),
        data_store=data_store,
    )
    return data_store.get_report(report_id)


@app.post("/api/admin/reports/{report_id}/suspicious", response_model=CommonReport)
def suspicious_report(report_id: str, decision: VerificationDecision, session: Session | None = Depends(get_database_session)) -> CommonReport:
    data_store = get_data_store(session)
    _submit_verification(
        report_id=report_id,
        request=VerificationSubmissionRequest(status=VerificationStatus.suspicious, reason=decision.reason, operator="Admin Operator"),
        data_store=data_store,
    )
    return data_store.get_report(report_id)


@app.get("/api/admin/submission-history")
def get_submission_history(session: Session | None = Depends(get_database_session)) -> list[dict[str, object]]:
    data_store = get_data_store(session)
    return data_store.submissions() if get_storage_backend() == "postgres" else data_store.submissions


@app.get("/api/admin/audit-logs")
def audit_logs(session: Session | None = Depends(get_database_session)) -> list[dict[str, object]]:
    data_store = get_data_store(session)
    if get_storage_backend() == "postgres":
        return data_store.audit_logs()
    return data_store.submissions or data_store.actions


@app.get("/api/notifications/smtp-status")
def smtp_status() -> dict[str, object]:
    config = get_smtp_config()
    return {
        "configured": config["configured"],
        "host": config["host"],
        "port": config["port"],
        "username": config["username"],
        "sender": config["sender"],
    }


@app.post("/api/notifications/send-email", response_model=SendEmailResponse)
def send_email_endpoint(request: SendEmailRequest) -> SendEmailResponse:
    email_status, error_msg = send_email_service(
        recipient=request.recipient,
        subject=request.subject,
        body=request.body,
        template_type=request.template_type,
        template_data=request.template_data,
    )
    return SendEmailResponse(
        status=email_status,
        recipient=request.recipient,
        subject=request.subject,
        error=error_msg,
    )


@app.post("/api/notifications/test-email")
def test_email_endpoint(recipient: str = Query(default="skyware2025@gmail.com")) -> dict[str, object]:
    config = get_smtp_config()
    status_str, error_msg = send_email_service(
        recipient=recipient,
        subject="VAANKAN Mail Service Connection Test",
        body="This is an automated connection test email from VAANKAN Weather Intelligence Platform.",
        template_type="test",
    )
    return {
        "status": status_str,
        "recipient": recipient,
        "configured": config["configured"],
        "host": config["host"],
        "port": config["port"],
        "error": error_msg,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/api/notifications/dispatch")
def dispatch_notifications(
    request: NotificationDispatch,
    session: Session | None = Depends(get_database_session),
) -> dict[str, object]:
    email_status = "failed"
    sms_status = "failed"
    errors: list[str] = []

    report = get_data_store(session).get_report(request.report_id)
    location = f"{report.city}, {report.district}, {report.state}" if report else "Reported Area"
    event_type = report.event_type_claimed.value if report else "Weather Event"
    title = report.text[:60] + "..." if report and len(report.text) > 60 else (report.text if report else request.subject)

    template_data = {
        "title": title,
        "location": location,
        "event_type": event_type,
        "severity": "High",
        "description": request.body,
        "report_id": request.report_id,
    }

    try:
        email_status, err = send_email_service(
            recipient=request.email,
            subject=request.subject,
            body=request.body,
            template_type="weather_alert",
            template_data=template_data,
        )
        if err:
            errors.append(f"email: {err}")
    except Exception as error:
        errors.append(f"email: {error}")

    try:
        sms_status = send_sms(request.phone, request.body)
    except Exception as error:
        errors.append(f"sms: {error}")

    sent = email_status == "sent" or sms_status == "sent"
    return {
        "report_id": request.report_id,
        "email": email_status,
        "sms": sms_status,
        "sent": sent,
        "errors": errors,
    }


@app.post("/api/vista/verify", response_model=dict[str, object])
def vista_verify(report: CommonReport, session: Session | None = Depends(get_database_session)) -> dict[str, object]:
    score = 0.55 if report.source_type == "citizen" else 0.65
    generated_at = datetime.now(timezone.utc)
    if get_storage_backend() == "postgres":
        data_store = get_data_store(session)
        data_store.record_vista_result(
            report.record_id,
            score=score,
            status="PENDING",
            generated_at=generated_at,
        )
        commit_database_session(getattr(data_store, "session", None))
    return {
        "report_id": report.record_id,
        "verification_probability": score,
        "verification_status": "PENDING",
        "engine": "VISTA-demo",
        "generated_at": generated_at.isoformat(),
    }


@app.get("/api/vista/verify")
def vista_verify_info() -> dict[str, object]:
    return {
        "engine": "VISTA-demo",
        "message": "Submit a normalized report with POST to run verification.",
        "method": "POST",
        "endpoint": "/api/vista/verify",
        "example_report": "/api/reports/R10234",
        "docs": "/docs",
    }


@app.get("/api/vayu/analytics")
def vayu_analytics(
    event_type: str | None = Query(default=None),
    verification_status: str | None = Query(default=None),
    region: str | None = Query(default=None),
    session: Session | None = Depends(get_database_session),
) -> dict[str, object]:
    data_store = get_data_store(session)
    reports = data_store.list_reports(
        event_type=event_type if event_type not in ("All events", "All") else None,
        verification_status=VerificationStatus(verification_status.upper())
        if verification_status and verification_status not in ("All statuses", "All")
        else None,
        region=region if region not in ("All India", "All") else None,
        limit=500,
    )

    verified_count = sum(1 for r in reports if r.verification_status == VerificationStatus.verified)
    pending_count = sum(1 for r in reports if r.verification_status == VerificationStatus.pending)
    suspicious_count = sum(1 for r in reports if r.verification_status == VerificationStatus.suspicious)

    event_distribution: dict[str, int] = {}
    for r in reports:
        cat = r.event_type_claimed.value
        event_distribution[cat] = event_distribution.get(cat, 0) + 1

    source_distribution: dict[str, int] = {}
    for r in reports:
        src = r.source_type.value
        source_distribution[src] = source_distribution.get(src, 0) + 1

    hotspots = [
        {
            "id": r.record_id,
            "title": r.text,
            "city": r.city,
            "district": r.district,
            "state": r.state,
            "latitude": r.latitude,
            "longitude": r.longitude,
            "event_type": r.event_type_claimed.value,
            "status": r.verification_status.value,
        }
        for r in reports
    ]

    return {
        "engine": "VAYU-Weather-Analytics-v1.0",
        "dataset_type": "postgresql" if get_storage_backend() == "postgres" else "in-memory-db",
        "total_reports": len(reports),
        "verified_reports": verified_count,
        "pending_reports": pending_count,
        "suspicious_reports": suspicious_count,
        "event_distribution": event_distribution,
        "source_distribution": source_distribution,
        "hotspots": hotspots,
        "submissions_logged": len(data_store.submissions()) if get_storage_backend() == "postgres" else len(data_store.submissions),
        "last_updated_at": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/vayu/ground-observations", response_model=list[GroundObservation])
def vayu_ground_observations(session: Session | None = Depends(get_database_session)) -> list[GroundObservation]:
    data_store = get_data_store(session)
    if get_storage_backend() == "postgres":
        return data_store.ground_observation_items()
    return list(data_store.ground_observations.values())


@app.get("/api/vayu/events", response_model=list[WeatherEvent])
def vayu_events(
    event_type: str | None = Query(default=None),
    region: str | None = Query(default=None),
    session: Session | None = Depends(get_database_session),
) -> list[WeatherEvent]:
    data_store = get_data_store(session)
    if get_storage_backend() == "postgres":
        return data_store.weather_event_items(event_type=event_type, region=region)
    events = list(data_store.weather_events.values())
    if event_type and event_type not in ("All events", "All"):
        events = [event for event in events if event.event_type.value.lower() == event_type.lower()]
    if region and region not in ("All India", "All"):
        events = [
            event for event in events
            if region.casefold() in (event.state.casefold(), event.city.casefold(), event.district.casefold())
        ]
    return events

