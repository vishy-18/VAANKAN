from __future__ import annotations

import base64
import os
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from dotenv import load_dotenv

from .email_service import send_email_service

load_dotenv()


def send_email(
    recipient: str,
    subject: str,
    body: str,
    html_body: str | None = None,
    template_type: str = "custom",
    template_data: dict | None = None,
) -> str:
    status, _error = send_email_service(
        recipient=recipient,
        subject=subject,
        body=body,
        html_body=html_body,
        template_type=template_type,
        template_data=template_data,
    )
    return status


def send_sms(recipient: str, body: str) -> str:
    account_sid = os.getenv("VAANKAN_TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("VAANKAN_TWILIO_AUTH_TOKEN")
    sender = os.getenv("VAANKAN_TWILIO_FROM")
    if not all((account_sid, auth_token, sender)) or any(
        value.startswith(("ACxxxx", "your-", "+1000"))
        for value in (account_sid or "", auth_token or "", sender or "")
    ):
        return "not_configured"
    payload = urlencode({"To": recipient, "From": sender, "Body": body}).encode()
    token = base64.b64encode(f"{account_sid}:{auth_token}".encode()).decode()
    request = Request(
        f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json",
        data=payload,
        headers={"Authorization": f"Basic {token}"},
        method="POST",
    )
    with urlopen(request, timeout=15):
        return "sent"
