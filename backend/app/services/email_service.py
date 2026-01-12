import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from ..core.config import settings

logger = logging.getLogger(__name__)


def _build_message(to_email: str, subject: str, html_body: str) -> MIMEMultipart:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{settings.smtp_from_name or 'GlucoForager'} <{settings.smtp_from_address}>"
    msg["To"] = to_email
    msg.attach(MIMEText(html_body, "html"))
    return msg


def send_welcome_email(to_email: str, full_name: str | None = None) -> None:
    if not settings.smtp_host or not settings.smtp_username or not settings.smtp_password:
        logger.info("SMTP not configured; skipping welcome email for %s", to_email)
        return

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
    msg = _build_message(to_email, subject, html_body)

    try:
        if (settings.smtp_encryption or "").lower() == "ssl":
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port) as server:
                server.login(settings.smtp_username, settings.smtp_password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
                server.starttls()
                server.login(settings.smtp_username, settings.smtp_password)
                server.send_message(msg)
        logger.info("Sent welcome email to %s", to_email)
    except Exception as exc:
        logger.exception("Failed to send welcome email to %s", to_email)


def send_password_reset_code(to_email: str, code: str) -> None:
    if not settings.smtp_host or not settings.smtp_username or not settings.smtp_password:
        logger.info("SMTP not configured; skipping password reset email for %s", to_email)
        return

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
    msg = _build_message(to_email, subject, html_body)

    try:
        if (settings.smtp_encryption or "").lower() == "ssl":
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port) as server:
                server.login(settings.smtp_username, settings.smtp_password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
                server.starttls()
                server.login(settings.smtp_username, settings.smtp_password)
                server.send_message(msg)
        logger.info("Sent password reset email to %s", to_email)
    except Exception as exc:
        logger.exception("Failed to send password reset email to %s", to_email)
