import logging
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import httpx

from ..core.config import settings
from .newsletter_tokens import make_unsubscribe_token

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

    if not settings.smtp_host or not settings.smtp_from_address:
        logger.info("Email not sent (provider not configured) for %s", to_email)
        return

    msg = _build_message(to_email, subject, html_body)
    encryption = (settings.smtp_encryption or "ssl").strip().lower()
    port = int(settings.smtp_port or (465 if encryption == "ssl" else 587))

    try:
        if encryption == "ssl":
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(settings.smtp_host, port, context=context, timeout=10) as server:
                if settings.smtp_username and settings.smtp_password:
                    server.login(settings.smtp_username, settings.smtp_password)
                server.sendmail(settings.smtp_from_address, [to_email], msg.as_string())
            return

        with smtplib.SMTP(settings.smtp_host, port, timeout=10) as server:
            server.ehlo()
            if encryption in {"starttls", "tls"}:
                context = ssl.create_default_context()
                server.starttls(context=context)
                server.ehlo()
            if settings.smtp_username and settings.smtp_password:
                server.login(settings.smtp_username, settings.smtp_password)
            server.sendmail(settings.smtp_from_address, [to_email], msg.as_string())
    except Exception:
        logger.exception("SMTP send failed for %s", to_email)
        return


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
            <li>Free tier includes 3 recipes per day (camera ingredient scan + ingredient search)</li>
            <li>Upgrade anytime for unlimited recipes (camera ingredient scan + ingredient search)</li>
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


def send_newsletter_email(to_email: str, subject: str, html_body: str) -> None:
    _send_email(to_email, subject, html_body)
    logger.info("Sent newsletter email to %s", to_email)


def send_newsletter_subscribed_email(to_email: str, subscriber_id: int) -> None:
    site_url = (settings.site_url or "https://www.glucoforager.com").rstrip("/")
    token = make_unsubscribe_token(subscriber_id, to_email)
    unsubscribe_url = f"{site_url}/unsubscribe?token={token}"
    logo_url = f"{site_url}/images/logo.png"

    subject = "You're subscribed to GlucoForager updates"
    html_body = f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #0C1824;">
        <div style="max-width:620px; margin:0 auto; border:1px solid #e5e7eb; border-radius:14px; padding:22px;">
          <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px;">
            <img src="{logo_url}" alt="GlucoForager" width="36" height="36" style="display:block; border-radius:10px;" />
            <div style="font-weight:800; font-size:18px; color:#0C1824;">GlucoForager</div>
          </div>
          <h2 style="color:#0FB7A5; margin-top:0;">Subscription confirmed</h2>
          <p style="line-height:1.6; font-size:14px; color:#0C1824;">
            Thanks for subscribing — you'll now receive new blog posts, diabetes-friendly tips, and product updates.
          </p>
          <p style="margin-top:24px; color:#6b7280; font-size:12px;">
            Unsubscribe anytime:
            <a href="{unsubscribe_url}" style="color:#0FB7A5;">Unsubscribe</a>
          </p>
        </div>
      </body>
    </html>
    """
    _send_email(to_email, subject, html_body)
    logger.info("Sent newsletter confirmation email to %s", to_email)


def send_blog_post_newsletter_email(
    to_email: str,
    post_title: str,
    post_excerpt: str | None,
    post_url: str,
    image_url: str | None,
    unsubscribe_url: str,
) -> None:
    site_url = (settings.site_url or "https://www.glucoforager.com").rstrip("/")
    logo_url = f"{site_url}/images/logo.png"
    def _escape(value: str) -> str:
        return (
            (value or "")
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
            .replace("'", "&#39;")
        )

    def _strip_tags(value: str) -> str:
        import re

        return re.sub(r"<[^>]*>", "", value or "").strip()

    safe_title = _escape((post_title or "New post").strip())
    safe_excerpt = _escape(_strip_tags((post_excerpt or "").strip()))
    safe_image = (image_url or "").strip()

    image_block = ""
    if safe_image:
        image_block = f"""
          <div style="margin-top:14px; overflow:hidden; border-radius:14px; border:1px solid #e5e7eb;">
            <img src="{safe_image}" alt="{safe_title}" style="width:100%; display:block;" />
          </div>
        """

    excerpt_block = ""
    if safe_excerpt:
        excerpt_block = f"""
          <p style="margin-top:12px; line-height:1.6; font-size:14px; color:#0C1824;">{safe_excerpt}</p>
        """

    subject = f"New on GlucoForager: {_strip_tags(post_title or 'New post')}".strip()[:160]
    html_body = f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #0C1824;">
        <div style="max-width:640px; margin:0 auto; border:1px solid #e5e7eb; border-radius:14px; padding:22px;">
          <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px;">
            <img src="{logo_url}" alt="GlucoForager" width="36" height="36" style="display:block; border-radius:10px;" />
            <div style="font-weight:800; font-size:18px; color:#0C1824;">GlucoForager</div>
          </div>

          <h2 style="color:#0FB7A5; margin-top:0; margin-bottom:0;">New blog post</h2>
          <h1 style="margin-top:10px; font-size:22px; line-height:1.2; color:#0C1824;">{safe_title}</h1>
          {excerpt_block}
          {image_block}

          <div style="margin-top:18px;">
            <a href="{_escape(post_url)}" style="display:inline-block; background:#0D9488; color:white; text-decoration:none; padding:12px 16px; border-radius:999px; font-weight:700;">
              Read the post
            </a>
          </div>

          <p style="margin-top:22px; color:#6b7280; font-size:12px; line-height:1.5;">
            You received this email because you subscribed to GlucoForager updates.
            <br/>
            Unsubscribe anytime:
            <a href="{_escape(unsubscribe_url)}" style="color:#0FB7A5;">Unsubscribe</a>
          </p>
        </div>
      </body>
    </html>
    """
    _send_email(to_email, subject, html_body)
    logger.info("Sent blog post newsletter email to %s", to_email)
