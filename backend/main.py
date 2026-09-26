from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware

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
)
from .store import store

app = FastAPI(title="VAANKAN API", version="0.1.0", description="Demo API seam for the SIH26069 weather intelligence platform.")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", mode="demo-memory", version=app.version)


@app.post("/api/auth/citizen/register", status_code=status.HTTP_201_CREATED)
def register(request: CitizenRegister) -> dict[str, object]:
    try:
        user = store.add_user(request.email, request.password, name=request.name, address=request.address, phone=request.phone)
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
        return user
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@app.post("/api/auth/citizen/login")
def login(request: LoginRequest) -> dict[str, str]:
    user = store.authenticate(request.email, request.password)
    if not user:
        raise HTTPException(status_code=401, detail="invalid credentials")
    return {"access_token": f"demo-{user['user_id']}", "token_type": "bearer", "user_id": user["user_id"]}


@app.post("/api/reports", response_model=CommonReport, status_code=status.HTTP_201_CREATED)
def create_report(report: CommonReport) -> CommonReport:
    try:
        return store.add_report(report)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@app.get("/api/reports", response_model=list[CommonReport])
def list_reports(event_type: str | None = Query(default=None), verification_status: VerificationStatus | None = None) -> list[CommonReport]:
    reports = list(store.reports.values())
    if event_type:
        reports = [report for report in reports if report.event_type_claimed.value == event_type]
    if verification_status:
        reports = [report for report in reports if report.verification_status == verification_status]
    return reports


@app.get("/api/reports/{report_id}", response_model=CommonReport)
def get_report(report_id: str) -> CommonReport:
    if report_id not in store.reports:
        raise HTTPException(status_code=404, detail="report not found")
    return store.reports[report_id]


@app.post("/api/admin/reports/{report_id}/submit-verification")
def submit_verification(report_id: str, request: VerificationSubmissionRequest) -> dict[str, object]:
    if report_id not in store.reports:
        raise HTTPException(status_code=404, detail="report not found")

    report = store.reports[report_id]
    notified_users: list[dict[str, object]] = []
    overall_email_status = "not_triggered"

    # Automatically send email ONLY IF status is VERIFIED
    if request.status == VerificationStatus.verified:
        users_in_range = store.find_users_within_radius(report.latitude, report.longitude, radius_km=10.0)

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

    submission = store.add_submission(
        report_id=report_id,
        status=request.status,
        reason=request.reason,
        operator=request.operator,
        notified_users=notified_users,
        email_status=overall_email_status,
    )
    return submission


@app.post("/api/admin/reports/{report_id}/decision", response_model=CommonReport)
def decide_report(report_id: str, decision: VerificationDecision) -> CommonReport:
    sub = submit_verification(
        report_id=report_id,
        request=VerificationSubmissionRequest(status=decision.status, reason=decision.reason, operator="Admin Operator"),
    )
    return store.reports[report_id]


@app.post("/api/admin/reports/{report_id}/verify", response_model=CommonReport)
def verify_report(report_id: str, decision: VerificationDecision) -> CommonReport:
    submit_verification(
        report_id=report_id,
        request=VerificationSubmissionRequest(status=VerificationStatus.verified, reason=decision.reason, operator="Admin Operator"),
    )
    return store.reports[report_id]


@app.post("/api/admin/reports/{report_id}/review", response_model=CommonReport)
def review_report(report_id: str, decision: VerificationDecision) -> CommonReport:
    submit_verification(
        report_id=report_id,
        request=VerificationSubmissionRequest(status=VerificationStatus.pending, reason=decision.reason, operator="Admin Operator"),
    )
    return store.reports[report_id]


@app.post("/api/admin/reports/{report_id}/suspicious", response_model=CommonReport)
def suspicious_report(report_id: str, decision: VerificationDecision) -> CommonReport:
    submit_verification(
        report_id=report_id,
        request=VerificationSubmissionRequest(status=VerificationStatus.suspicious, reason=decision.reason, operator="Admin Operator"),
    )
    return store.reports[report_id]


@app.get("/api/admin/submission-history")
def get_submission_history() -> list[dict[str, object]]:
    return store.submissions


@app.get("/api/admin/audit-logs")
def audit_logs() -> list[dict[str, object]]:
    return store.submissions or store.actions


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
def dispatch_notifications(request: NotificationDispatch) -> dict[str, object]:
    email_status = "failed"
    sms_status = "failed"
    errors: list[str] = []

    report = store.reports.get(request.report_id)
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
def vista_verify(report: CommonReport) -> dict[str, object]:
    score = 0.55 if report.source_type == "citizen" else 0.65
    return {
        "report_id": report.record_id,
        "verification_probability": score,
        "verification_status": "PENDING",
        "engine": "VISTA-demo",
        "generated_at": datetime.now(timezone.utc).isoformat(),
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
) -> dict[str, object]:
    reports = list(store.reports.values())

    if event_type and event_type not in ("All events", "All"):
        reports = [r for r in reports if r.event_type_claimed.value.lower() == event_type.lower()]
    if verification_status and verification_status not in ("All statuses", "All"):
        reports = [r for r in reports if r.verification_status.value.upper() == verification_status.upper()]
    if region and region not in ("All India", "All"):
        reports = [r for r in reports if region.lower() in (r.state.lower(), r.city.lower(), r.district.lower())]

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
        "dataset_type": "in-memory-db",
        "total_reports": len(reports),
        "verified_reports": verified_count,
        "pending_reports": pending_count,
        "suspicious_reports": suspicious_count,
        "event_distribution": event_distribution,
        "source_distribution": source_distribution,
        "hotspots": hotspots,
        "submissions_logged": len(store.submissions),
        "last_updated_at": datetime.now(timezone.utc).isoformat(),
    }

