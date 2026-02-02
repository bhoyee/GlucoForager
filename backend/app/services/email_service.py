import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import httpx

from ..core.config import settings

logger = logging.getLogger(__name__)
RESEND_API_URL = "https://api.resend.com/emails"


def _build_message(to_email: str, subject: str, html_body: str) -> MIMEMultipart:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{settings.smtp_from_name or 'GlucoForager'} <{settings.smtp_from_address}>"
    msg["To"] = to_email
    msg.attach(MIMEText(html_body, "html"))
    return msg


def _send_resend_email(to_email: str, subject: str, html_body: str) -> bool:
    if not settings.resend_api_key:
        return False

    sender_name = settings.smtp_from_name or "GlucoForager"
    sender_email = settings.smtp_from_address or "hello@glucoforager.com"
    payload = {
        "from": f"{sender_name} <{sender_email}>",
        "to": [to_email],
        "subject": subject,
        "html": html_body,
    }
    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.post(
                RESEND_API_URL,
                json=payload,
                headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            )
        if response.status_code >= 400:
            logger.error(
                "Resend API failed (%s): %s",
                response.status_code,
                response.text[:200],
            )
            return False
        return True
    except Exception:
        logger.exception("Resend API request failed")
        return False


def _send_email(to_email: str, subject: str, html_body: str) -> None:
    if _send_resend_email(to_email, subject, html_body):
        return
    logger.info("Email not sent (Resend not configured) for %s", to_email)


def send_welcome_email(to_email: str, full_name: str | None = None) -> None:

    subject = "Welcome to GlucoForager"
    greeting_name = full_name.strip().split(" ")[0] if full_name else "there"
    html_body = f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #0C1824;">
        <div style="max-width:520px; margin:0 auto; border:1px solid #e5e7eb; border-radius:12px; padding:20px;">
          <h2 style="color:#0FB7A5; margin-top:0;">Welcome to GlucoForager</h2>
          <p>Hi {greeting_name},</p>
          <p>Welcome to GlucoForager. Your account is ready, and you can now explore diabetes-friendly recipes tailored to the ingredients in your kitchen.</p>
          <ul>
            <li>Free tier includes 3 recipe searches per day</li>
            <li>Upgrade anytime for camera ingredient recognition and unlimited searches</li>
          </ul>
          <p style="margin-top:16px;">Open the app to start planning your next meal in just a few taps.</p>
          <p style="margin-top:24px; color:#6b7280;">Stay steady, eat well.<br/>The GlucoForager team</p>
        </div>
      </body>
    </html>
    """
    _send_email(to_email, subject, html_body)
    logger.info("Sent welcome email to %s", to_email)


def send_password_reset_code(to_email: str, code: str) -> None:

    subject = "Your GlucoForager password reset code"
    html_body = f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #0C1824;">
        <div style="max-width:520px; margin:0 auto; border:1px solid #e5e7eb; border-radius:12px; padding:20px;">
          <h2 style="color:#0FB7A5; margin-top:0;">Reset your password</h2>
          <p>Use the code below to reset your GlucoForager password:</p>
          <div style="font-size:28px; font-weight:700; letter-spacing:4px; margin:16px 0;">{code}</div>
          <p>This code expires soon. If you did not request a password reset, you can ignore this email.</p>
          <p style="margin-top:24px; color:#6b7280;">Stay steady, eat well.<br/>The GlucoForager team</p>
        </div>
      </body>
    </html>
    """
    _send_email(to_email, subject, html_body)
    logger.info("Sent password reset email to %s", to_email)


def send_premium_activated_email(to_email: str, full_name: str | None = None) -> None:

    subject = "Your GlucoForager Premium is active"
    greeting_name = full_name.strip().split(" ")[0] if full_name else "there"
    html_body = f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #0C1824;">
        <div style="max-width:520px; margin:0 auto; border:1px solid #e5e7eb; border-radius:12px; padding:20px;">
          <h2 style="color:#0FB7A5; margin-top:0;">Premium activated</h2>
          <p>Hi {greeting_name},</p>
          <p>Your GlucoForager Premium subscription is now active.</p>
          <ul>
            <li>Unlimited recipe searches and scans</li>
            <li>Full access to diabetes-friendly meal planning</li>
          </ul>
          <p style="margin-top:16px;">Thanks for supporting GlucoForager.</p>
          <p style="margin-top:24px; color:#6b7280;">Stay steady, eat well.<br/>The GlucoForager team</p>
        </div>
      </body>
    </html>
    """
    _send_email(to_email, subject, html_body)
    logger.info("Sent premium activation email to %s", to_email)
