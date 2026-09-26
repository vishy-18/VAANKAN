from __future__ import annotations

import os
import smtplib
from datetime import datetime, timezone
from email.message import EmailMessage
from typing import Any

from dotenv import load_dotenv

load_dotenv()


def get_smtp_config() -> dict[str, Any]:
    host = os.getenv("VAANKAN_SMTP_HOST")
    username = os.getenv("VAANKAN_SMTP_USERNAME")
    password = os.getenv("VAANKAN_SMTP_PASSWORD")
    sender = os.getenv("VAANKAN_SMTP_FROM", username or "")
    port_str = os.getenv("VAANKAN_SMTP_PORT", "587")
    try:
        port = int(port_str)
    except ValueError:
        port = 587

    configured = bool(host and username and password and sender and not username.startswith("your-"))
    return {
        "host": host,
        "port": port,
        "username": username,
        "password": password,
        "sender": sender,
        "configured": configured,
    }


def render_weather_alert_html(
    title: str,
    location: str,
    event_type: str,
    severity: str = "High",
    description: str = "",
    distance_km: float | None = None,
    report_id: str | None = None,
) -> str:
    badge_color = "#ef4444" if severity.lower() in ("high", "severe", "critical") else "#f59e0b"
    distance_badge = f'<span style="background-color: #0369a1; color: #ffffff; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; margin-left: 8px;">{distance_km:.1f} km away</span>' if distance_km is not None else ""
    
    return f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>VAANKAN Weather Alert</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; color: #1e293b;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 24px 12px;">
        <tr>
            <td align="center">
                <table width="100%" max-width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06);">
                    <!-- Header -->
                    <tr>
                        <td style="background-color: #0f172a; padding: 28px 32px; text-align: left;">
                            <div style="display: flex; align-items: center; justify-content: space-between;">
                                <span style="color: #38bdf8; font-size: 22px; font-weight: 800; letter-spacing: 1.5px;">VAANKAN</span>
                                <span style="color: #94a3b8; font-size: 11px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase;">Weather Intelligence</span>
                            </div>
                            <h2 style="color: #f8fafc; font-size: 20px; font-weight: 600; margin: 16px 0 0 0;">Verified Severe Weather Advisory</h2>
                        </td>
                    </tr>

                    <!-- Alert Badge Bar -->
                    <tr>
                        <td style="padding: 20px 32px 10px 32px;">
                            <span style="background-color: {badge_color}; color: #ffffff; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                                {severity} Priority · {event_type.upper()}
                            </span>
                            {distance_badge}
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 10px 32px 28px 32px;">
                            <h1 style="color: #0f172a; font-size: 22px; font-weight: 700; margin: 0 0 12px 0;">{title}</h1>
                            <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
                                {description or f"A verified severe {event_type} event has been confirmed in your immediate area ({location}). Please take necessary precautions and follow local authority directives."}
                            </p>

                            <!-- Information Box -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 24px;">
                                <tr>
                                    <td style="padding: 16px 20px;">
                                        <div style="font-size: 13px; color: #64748b; margin-bottom: 6px;"><strong>Location:</strong> {location}</div>
                                        {f'<div style="font-size: 13px; color: #64748b; margin-bottom: 6px;"><strong>Alert Reference ID:</strong> {report_id}</div>' if report_id else ''}
                                        <div style="font-size: 13px; color: #64748b;"><strong>Verification Source:</strong> VAANKAN Verified Ground Observation & Meteorological Consensus</div>
                                    </td>
                                </tr>
                            </table>

                            <!-- Safety Tips -->
                            <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 14px 16px; border-radius: 4px; margin-bottom: 24px;">
                                <strong style="color: #991b1b; font-size: 14px; display: block; margin-bottom: 6px;">Recommended Safety Actions:</strong>
                                <ul style="margin: 0; padding-left: 20px; color: #7f1d1d; font-size: 13px; line-height: 1.5;">
                                    <li>Stay indoors and away from exposed or low-lying flood-prone areas.</li>
                                    <li>Keep mobile devices charged and enable emergency broadcast channels.</li>
                                    <li>Report live ground conditions safely via the VAANKAN Citizen Portal.</li>
                                </ul>
                            </div>

                            <!-- CTA Button -->
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td align="center">
                                        <a href="http://localhost:5173/citizen" target="_blank" style="background-color: #0284c7; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">
                                            View Live Map & Alert Details &rarr;
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 32px; text-align: center;">
                            <p style="color: #94a3b8; font-size: 12px; margin: 0 0 6px 0;">
                                Sent by VAANKAN Weather Intelligence Platform &bull; Ministry Emergency Response
                            </p>
                            <p style="color: #cbd5e1; font-size: 11px; margin: 0;">
                                You are receiving this advisory based on your registered location or active GPS subscription.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>"""


def render_welcome_html(name: str, email: str, address: str) -> str:
    return f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to VAANKAN</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f1f5f9; color: #1e293b;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 24px 12px;">
        <tr>
            <td align="center">
                <table width="100%" max-width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                    <tr>
                        <td style="background-color: #0f172a; padding: 28px 32px;">
                            <span style="color: #38bdf8; font-size: 22px; font-weight: 800;">VAANKAN</span>
                            <h2 style="color: #f8fafc; font-size: 20px; margin: 12px 0 0 0;">Welcome to Citizen Weather Intelligence</h2>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 28px 32px;">
                            <p style="font-size: 16px; margin: 0 0 16px 0;">Hello <strong>{name}</strong>,</p>
                            <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
                                Thank you for registering with VAANKAN. Your account is now active and ready to receive real-time verified severe weather alerts for your area.
                            </p>
                            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 24px;">
                                <tr>
                                    <td style="padding: 16px 20px; font-size: 13px; color: #475569;">
                                        <div style="margin-bottom: 6px;"><strong>Registered Email:</strong> {email}</div>
                                        <div><strong>Registered Address:</strong> {address}</div>
                                    </td>
                                </tr>
                            </table>
                            <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0;">
                                When severe rainfall, flooding, or storms impact your region, VAANKAN will send automated notifications directly to this email address.
                            </p>
                            <td align="center" style="padding-bottom: 28px;">
                                <a href="http://localhost:5173/citizen" style="background-color: #0284c7; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">
                                    Open Citizen Dashboard
                                </a>
                            </td>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>"""


def render_test_email_html(recipient: str, timestamp_str: str) -> str:
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: sans-serif; background-color: #f8fafc; padding: 24px;">
    <div style="max-width: 550px; margin: 0 auto; background: #ffffff; padding: 24px; border-radius: 8px; border: 1px solid #e2e8f0;">
        <h2 style="color: #0284c7; margin-top: 0;">VAANKAN Mail Service Test</h2>
        <p>This is a test message generated by the VAANKAN Weather Intelligence Platform backend.</p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 16px 0;" />
        <ul style="color: #475569; font-size: 13px;">
            <li><strong>Recipient:</strong> {recipient}</li>
            <li><strong>Dispatched At:</strong> {timestamp_str}</li>
            <li><strong>Status:</strong> SMTP connection active & verified</li>
        </ul>
    </div>
</body>
</html>"""


def send_email_service(
    recipient: str,
    subject: str,
    body: str,
    html_body: str | None = None,
    template_type: str = "custom",
    template_data: dict[str, Any] | None = None,
) -> tuple[str, str | None]:
    config = get_smtp_config()
    if not config["configured"]:
        return "not_configured", "SMTP credentials (VAANKAN_SMTP_HOST, USERNAME, PASSWORD) are missing or incomplete in environment."

    # If html_body is not explicitly passed, try rendering based on template_type
    if not html_body and template_data:
        if template_type == "weather_alert":
            html_body = render_weather_alert_html(
                title=template_data.get("title", subject),
                location=template_data.get("location", "Your registered area"),
                event_type=template_data.get("event_type", "weather advisory"),
                severity=template_data.get("severity", "High"),
                description=template_data.get("description", body),
                distance_km=template_data.get("distance_km"),
                report_id=template_data.get("report_id"),
            )
        elif template_type == "welcome":
            html_body = render_welcome_html(
                name=template_data.get("name", "Citizen"),
                email=recipient,
                address=template_data.get("address", "Registered location"),
            )
        elif template_type == "test":
            html_body = render_test_email_html(recipient, datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"))

    message = EmailMessage()
    message["From"] = config["sender"]
    message["To"] = recipient
    message["Subject"] = subject
    message.set_content(body)

    if html_body:
        message.add_alternative(html_body, subtype="html")

    host = config["host"]
    port = config["port"]
    username = config["username"]
    password = config["password"]

    try:
        if port == 465:
            with smtplib.SMTP_SSL(host, port, timeout=15) as server:
                server.login(username, password)
                server.send_message(message)
        else:
            with smtplib.SMTP(host, port, timeout=15) as server:
                server.starttls()
                server.login(username, password)
                server.send_message(message)
        return "sent", None
    except Exception as exc:
        return "failed", str(exc)
