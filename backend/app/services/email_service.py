import logging
import smtplib
import ssl
import html as _html
import re
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from html.parser import HTMLParser

import httpx

from ..core.config import settings
from .newsletter_tokens import make_unsubscribe_token
from .user_email_tokens import make_dunning_unsubscribe_token

logger = logging.getLogger(__name__)
RESEND_API_URL = "https://api.resend.com/emails"


def _build_message(to_email: str, subject: str, html_body: str, reply_to: str | None = None) -> MIMEMultipart:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{settings.smtp_from_name or 'GlucoForager'} <{settings.smtp_from_address}>"
    msg["To"] = to_email
    if reply_to:
        msg["Reply-To"] = reply_to
    msg.attach(MIMEText(html_body, "html"))
    return msg


def _send_resend_email(to_email: str, subject: str, html_body: str, reply_to: str | None = None) -> str | None:
    """Returns Resend's id for this send (used to match a later open/click
    webhook back to it), or None if Resend wasn't used/failed."""
    if not settings.resend_api_key:
        return None

    sender_name = settings.smtp_from_name or "GlucoForager"
    sender_email = settings.smtp_from_address or "hello@glucoforager.com"
    payload = {
        "from": f"{sender_name} <{sender_email}>",
        "to": [to_email],
        "subject": subject,
        "html": html_body,
    }
    if reply_to:
        payload["reply_to"] = [reply_to]
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
            return None
        try:
            return response.json().get("id")
        except Exception:
            return None
    except Exception:
        logger.exception("Resend API request failed")
        return None


def _send_email(to_email: str, subject: str, html_body: str, reply_to: str | None = None) -> str | None:
    """Returns Resend's email id when sent via the Resend API, else None (SMTP
    fallback, or provider not configured) - there's no per-message id to track
    opens/clicks against in the SMTP path. Preserves the original fallback
    behavior: any Resend failure (missing key or API error) still falls through
    to SMTP rather than giving up on the send entirely."""
    resend_id = _send_resend_email(to_email, subject, html_body, reply_to=reply_to)
    if resend_id:
        return resend_id

    if not settings.smtp_host or not settings.smtp_from_address:
        logger.info("Email not sent (provider not configured) for %s", to_email)
        return None

    msg = _build_message(to_email, subject, html_body, reply_to=reply_to)
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


def send_welcome_email(to_email: str, full_name: str | None = None, *, welcome_days: int = 7) -> None:
    if welcome_days <= 0:
        return _send_plain_welcome_email(to_email, full_name)
    period = _days_phrase(welcome_days)
    body = f"""
      <p>Hi {_first_name(full_name)},</p>
      <p style="line-height:1.6;">Welcome to GlucoForager. Deciding what to eat with diabetes shouldn't mean guessing,
      and that's exactly what we're here to help with.</p>
      <p style="line-height:1.6;">For your first {period}, <strong>everything in Premium is unlocked, no card needed.</strong>
      Every meal idea and answer is shaped around the food profile you set up.</p>
      <p style="line-height:1.6;">The best way to start: open the app and ask it what to eat today.</p>
    """
    html = _welcome_week_shell(
        to_email=to_email,
        user_id=None,
        heading=f"Your first {period} of Premium is on us",
        body_html=body,
        button_label="Open GlucoForager",
        button_url=_site_url(),
        footer_note=f"After your first {period}, you'll still get free uses every week, and you can upgrade anytime.",
    )
    _send_email(to_email, f"Your first {period} of GlucoForager Premium is on us", html)
    logger.info("Sent welcome email to %s", to_email)


def send_admin_signup_alert(
    *,
    to_email: str,
    user_email: str,
    full_name: str | None = None,
    country: str | None = None,
    platform: str | None = None,
    app_version: str | None = None,
    build_number: str | None = None,
    os_version: str | None = None,
    device_model: str | None = None,
    ip_address: str | None = None,
) -> None:
    subject = f"New GlucoForager signup: {user_email}".strip()[:160]
    safe_name = (full_name or "").strip() or "--"
    safe_country = (country or "").strip() or "--"
    safe_platform = (platform or "").strip() or "--"
    safe_app = (app_version or "").strip() or "--"
    safe_build = (build_number or "").strip() or "--"
    safe_os = (os_version or "").strip() or "--"
    safe_device = (device_model or "").strip() or "--"
    safe_ip = (ip_address or "").strip() or "--"

    html_body = f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #0C1824;">
        <div style="max-width:640px; margin:0 auto; border:1px solid #e5e7eb; border-radius:14px; padding:22px;">
          <h2 style="color:#0FB7A5; margin-top:0;">New user signup</h2>
          <p style="margin:0 0 14px 0; color:#6b7280; font-size:12px;">
            This is an admin notification from GlucoForager.
          </p>
          <table style="width:100%; border-collapse:collapse; font-size:14px;">
            <tr><td style="padding:6px 0; color:#6b7280; width:160px;">Email</td><td style="padding:6px 0;"><strong>{user_email}</strong></td></tr>
            <tr><td style="padding:6px 0; color:#6b7280;">Name</td><td style="padding:6px 0;">{safe_name}</td></tr>
            <tr><td style="padding:6px 0; color:#6b7280;">Country</td><td style="padding:6px 0;">{safe_country}</td></tr>
            <tr><td style="padding:6px 0; color:#6b7280;">Platform</td><td style="padding:6px 0;">{safe_platform}</td></tr>
            <tr><td style="padding:6px 0; color:#6b7280;">App version</td><td style="padding:6px 0;">{safe_app}</td></tr>
            <tr><td style="padding:6px 0; color:#6b7280;">Build</td><td style="padding:6px 0;">{safe_build}</td></tr>
            <tr><td style="padding:6px 0; color:#6b7280;">OS</td><td style="padding:6px 0;">{safe_os}</td></tr>
            <tr><td style="padding:6px 0; color:#6b7280;">Device</td><td style="padding:6px 0;">{safe_device}</td></tr>
            <tr><td style="padding:6px 0; color:#6b7280;">IP</td><td style="padding:6px 0;">{safe_ip}</td></tr>
          </table>
        </div>
      </body>
    </html>
    """
    _send_email(to_email, subject, html_body)
    logger.info("Sent admin signup alert to %s for user=%s", to_email, user_email)


CONTACT_FORM_TO_ADDRESS = "hello@glucoforager.com"


def send_contact_form_email(*, name: str, email: str, subject: str, message: str) -> None:
    """Forwards a landing-page Contact form submission to the support inbox, with
    Reply-To set to the visitor's own address so a human can just hit reply.
    All fields are visitor-supplied and untrusted - always HTML-escaped."""
    safe_name = _html.escape(name.strip() or "there")
    safe_email = _html.escape(email.strip())
    safe_subject = _html.escape(subject.strip() or "General")
    safe_message = _html.escape(message.strip()).replace("\n", "<br/>")

    mail_subject = f"Contact form: {subject.strip() or 'General'} - {name.strip() or 'Anonymous'}"[:160]
    html_body = f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #0C1824;">
        <div style="max-width:640px; margin:0 auto; border:1px solid #e5e7eb; border-radius:14px; padding:22px;">
          <h2 style="color:#0FB7A5; margin-top:0;">New contact form message</h2>
          <table style="width:100%; border-collapse:collapse; font-size:14px; margin-bottom:14px;">
            <tr><td style="padding:6px 0; color:#6b7280; width:100px;">Name</td><td style="padding:6px 0;"><strong>{safe_name}</strong></td></tr>
            <tr><td style="padding:6px 0; color:#6b7280;">Email</td><td style="padding:6px 0;"><strong>{safe_email}</strong></td></tr>
            <tr><td style="padding:6px 0; color:#6b7280;">Subject</td><td style="padding:6px 0;">{safe_subject}</td></tr>
          </table>
          <div style="background:#f7fafc; border-radius:10px; padding:14px; line-height:1.6; font-size:14px;">
            {safe_message}
          </div>
          <p style="margin-top:20px; color:#6b7280; font-size:12px;">Reply directly to this email to respond to {safe_name}.</p>
        </div>
      </body>
    </html>
    """
    _send_email(CONTACT_FORM_TO_ADDRESS, mail_subject, html_body, reply_to=email.strip())
    logger.info("Sent contact form email from %s", email)


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


def send_staff_ticket_notification(
    *,
    to_email: str,
    ticket_id: int,
    ticket_subject: str,
    title: str,
    message: str | None = None,
) -> None:
    subject = f"[Ticket #{ticket_id}] {title}"
    safe_subject = (ticket_subject or "").strip()
    safe_message = (message or "").strip()
    html_body = f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #0C1824;">
        <div style="max-width:620px; margin:0 auto; border:1px solid #e5e7eb; border-radius:14px; padding:22px;">
          <h2 style="color:#0FB7A5; margin-top:0;">{title}</h2>
          <p style="margin:10px 0; font-size:14px; color:#0C1824;">
            <strong>Ticket #{ticket_id}</strong>: {safe_subject}
          </p>
          {f"<div style='margin-top:14px; padding:12px; background:#f8fafc; border-radius:12px; border:1px solid #e5e7eb; white-space:pre-wrap; font-size:14px;'>{safe_message}</div>" if safe_message else ""}
          <p style="margin-top:18px; color:#6b7280; font-size:12px;">
            You can open the Admin Console to view and reply.
          </p>
        </div>
      </body>
    </html>
    """
    _send_email(to_email, subject, html_body)
    logger.info("Sent staff ticket notification to %s ticket=%s", to_email, ticket_id)


def send_staff_notification_email(*, to_email: str, title: str, body: str | None = None) -> None:
    subject = title.strip()[:140] or "Notification"
    raw_body = (body or "").strip()

    def _extract_open_url(text: str) -> tuple[str, str]:
        s = str(text or "").strip()
        if not s:
            return "", ""
        lines = [ln.rstrip() for ln in s.splitlines()]
        open_url = ""
        kept: list[str] = []
        for ln in lines:
            m = re.match(r"^\s*open:\s*(\S+)\s*$", ln, flags=re.IGNORECASE)
            if m and not open_url:
                open_url = m.group(1).strip()
                continue
            kept.append(ln)
        return "\n".join(kept).strip(), open_url

    def _looks_like_html(text: str) -> bool:
        s = str(text or "").strip()
        if not s:
            return False
        if "<" not in s or ">" not in s:
            return False
        return bool(re.match(r"^\s*<", s))

    def _auto_link(escaped_text: str) -> str:
        if not escaped_text:
            return ""
        # Replace URL-like substrings with <a> tags. Input must already be HTML-escaped.
        url_re = re.compile(r"(https?://[^\s<]+)", flags=re.IGNORECASE)

        def _repl(m: re.Match) -> str:
            url = m.group(1)
            # Trim trailing punctuation.
            trimmed = url.rstrip(").,;:!?'\"")
            tail = url[len(trimmed) :]
            return f"<a href=\"{trimmed}\" style=\"color:#0b3d91; text-decoration:underline;\">{trimmed}</a>{tail}"

        return url_re.sub(_repl, escaped_text)

    class _Sanitizer(HTMLParser):
        allowed_tags = {"p", "br", "strong", "b", "em", "i", "u", "s", "a", "ol", "ul", "li", "h1", "h2", "h3", "blockquote", "div", "span"}

        def __init__(self) -> None:
            super().__init__(convert_charrefs=True)
            self.out: list[str] = []

        def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
            t = (tag or "").lower()
            if t not in self.allowed_tags:
                return
            if t == "br":
                self.out.append("<br/>")
                return
            if t == "a":
                href = ""
                for k, v in attrs or []:
                    if str(k or "").lower() == "href" and v:
                        href = str(v).strip()
                        break
                safe_href = href.startswith("http://") or href.startswith("https://") or href.startswith("/")
                if not safe_href:
                    self.out.append("<span>")
                    return
                self.out.append(f"<a href=\"{_html.escape(href, quote=True)}\" style=\"color:#0b3d91; text-decoration:underline;\" rel=\"noreferrer noopener\">")
                return
            # Strip all attributes for other tags (avoid style injection).
            self.out.append(f"<{t}>")

        def handle_endtag(self, tag: str) -> None:
            t = (tag or "").lower()
            if t not in self.allowed_tags:
                return
            if t == "br":
                return
            if t == "a":
                # We may have opened <span> if href was unsafe.
                if self.out and self.out[-1] == "<span>":
                    self.out.append("</span>")
                else:
                    self.out.append("</a>")
                return
            self.out.append(f"</{t}>")

        def handle_data(self, data: str) -> None:
            if data:
                self.out.append(_html.escape(data))

        def handle_entityref(self, name: str) -> None:
            self.out.append(f"&{name};")

        def handle_charref(self, name: str) -> None:
            self.out.append(f"&#{name};")

    def _render_body_html(text: str) -> str:
        s = str(text or "").strip()
        if not s:
            return ""
        if _looks_like_html(s):
            p = _Sanitizer()
            try:
                p.feed(s)
                safe_html = "".join(p.out).strip()
            except Exception:
                safe_html = ""
            return safe_html or _auto_link(_html.escape(s)).replace("\n", "<br/>")
        # plain text -> escaped + links + line breaks
        escaped = _html.escape(s)
        return _auto_link(escaped).replace("\n", "<br/>")

    safe_text, open_url = _extract_open_url(raw_body)
    body_html = _render_body_html(safe_text)
    safe_open_url = open_url.strip()
    if safe_open_url and not (safe_open_url.startswith("http://") or safe_open_url.startswith("https://") or safe_open_url.startswith("/")):
        safe_open_url = ""

    body_block = (
        f"<div style='margin-top:14px; padding:12px; background:#f8fafc; border-radius:12px; border:1px solid #e5e7eb; font-size:14px; line-height:1.55;'>{body_html}</div>"
        if body_html
        else ""
    )
    open_block = ""
    if safe_open_url:
        esc_url_attr = _html.escape(safe_open_url, quote=True)
        esc_url_text = _html.escape(safe_open_url)
        open_block = f"""
          <div style='margin-top:16px;'>
            <a href='{esc_url_attr}'
               style='display:inline-block; background:#0FB7A5; color:#ffffff; text-decoration:none; padding:10px 14px; border-radius:10px; font-weight:700; font-size:13px;'>
              Open in Admin Console
            </a>
            <div style='margin-top:10px; font-size:12px; color:#6b7280;'>
              Link: <a href='{esc_url_attr}' style='color:#0b3d91; text-decoration:underline;'>{esc_url_text}</a>
            </div>
          </div>
        """
    html_body = f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #0C1824;">
        <div style="max-width:620px; margin:0 auto; border:1px solid #e5e7eb; border-radius:14px; padding:22px;">
          <h2 style="color:#0FB7A5; margin-top:0;">{subject}</h2>
          {body_block}
          {open_block}
          <p style="margin-top:18px; color:#6b7280; font-size:12px;">
            Open the Admin Console to view more details.
          </p>
        </div>
      </body>
    </html>
    """
    _send_email(to_email, subject, html_body)
    logger.info("Sent staff notification email to %s", to_email)


def send_staff_portal_credentials_email(
    *,
    to_email: str,
    temp_password: str,
    full_name: str | None = None,
    login_url: str,
) -> None:
    subject = "Your GF-Staff Portal login details"
    greeting_name = full_name.strip().split(" ")[0] if full_name else "there"
    safe_login = (login_url or "").strip().rstrip("/")
    safe_email = (to_email or "").strip().lower()
    safe_pwd = (temp_password or "").strip()
    profile_url = f"{safe_login}/profile" if safe_login else ""
    html_body = f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #0C1824;">
        <div style="max-width:620px; margin:0 auto; border:1px solid #e5e7eb; border-radius:14px; padding:22px;">
          <h2 style="color:#0FB7A5; margin-top:0;">GF-Staff Portal access</h2>
          <p>Hi {greeting_name},</p>
          <p>Your staff portal account has been created. Use the login details below:</p>
          <table style="width:100%; border-collapse:collapse; font-size:14px; margin-top:12px;">
            <tr><td style="padding:8px 0; color:#6b7280; width:160px;">Login URL</td><td style="padding:8px 0;"><a href="{safe_login}" style="color:#0b3d91; text-decoration:none;">{safe_login}</a></td></tr>
            <tr><td style="padding:8px 0; color:#6b7280;">Email</td><td style="padding:8px 0;"><strong>{safe_email}</strong></td></tr>
            <tr><td style="padding:8px 0; color:#6b7280;">Temporary password</td><td style="padding:8px 0;"><strong>{safe_pwd}</strong></td></tr>
          </table>
          <div style="margin-top:16px; padding:12px; border-radius:12px; border:1px solid rgba(229,57,53,0.22); background:rgba(229,57,53,0.06); color:#8e1513;">
            <strong>Important:</strong> After you log in, please change your password and update your profile immediately.
            {f"<br/><a href='{profile_url}' style='color:#8e1513; text-decoration:underline;'>{profile_url}</a>" if profile_url else ""}
          </div>
          <p style="margin-top:20px; color:#6b7280; font-size:12px;">
            If you did not expect this email, please contact your admin.
          </p>
        </div>
      </body>
    </html>
    """
    _send_email(to_email, subject, html_body)
    logger.info("Sent staff portal credentials email to %s", to_email)


def send_staff_mfa_code(*, to_email: str, code: str) -> None:
    subject = "Your GlucoForager admin verification code"
    html_body = f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #0C1824;">
        <div style="max-width:520px; margin:0 auto; border:1px solid #e5e7eb; border-radius:12px; padding:20px;">
          <h2 style="color:#0FB7A5; margin-top:0;">Admin sign-in verification</h2>
          <p>Enter this code to finish signing in:</p>
          <div style="font-size:28px; font-weight:700; letter-spacing:4px; margin:16px 0;">{code}</div>
          <p>This code expires soon. If you did not try to sign in, you can ignore this email.</p>
          <p style="margin-top:24px; color:#6b7280;">GlucoForager Admin Console</p>
        </div>
      </body>
    </html>
    """
    _send_email(to_email, subject, html_body)
    logger.info("Sent staff MFA code to %s", to_email)


def send_staff_password_reset_code(to_email: str, code: str) -> None:
    subject = "Your GlucoForager admin password reset code"
    html_body = f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #0C1824;">
        <div style="max-width:520px; margin:0 auto; border:1px solid #e5e7eb; border-radius:12px; padding:20px;">
          <h2 style="color:#0FB7A5; margin-top:0;">Reset your admin password</h2>
          <p>Use the code below to reset your GlucoForager admin password:</p>
          <div style="font-size:28px; font-weight:700; letter-spacing:4px; margin:16px 0;">{code}</div>
          <p>This code expires soon. If you did not request a reset, you can ignore this email.</p>
          <p style="margin-top:24px; color:#6b7280;">GlucoForager Admin Console</p>
        </div>
      </body>
    </html>
    """
    _send_email(to_email, subject, html_body)
    logger.info("Sent staff password reset email to %s", to_email)


def send_staff_payroll_available_email(*, to_email: str, period_label: str, portal_url: str | None = None) -> None:
    subject = f"Your payslip is available ({period_label})"
    safe_url = (portal_url or "").strip()
    html_body = f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #0C1824;">
        <div style="max-width:620px; margin:0 auto; border:1px solid #e5e7eb; border-radius:14px; padding:22px;">
          <h2 style="color:#0FB7A5; margin-top:0;">Payslip available</h2>
          <p>Your payslip for <strong>{period_label}</strong> is now available.</p>
          <p style="margin-top:14px;">
            {f"<a href='{safe_url}' style='display:inline-block; padding:10px 14px; border-radius:12px; background:#2e7d32; color:#ffffff; text-decoration:none; font-weight:700;'>View payslip</a>" if safe_url else ""}
          </p>
          <p style="margin-top:18px; color:#6b7280; font-size:12px;">
            If you did not expect this email, please contact your admin.
          </p>
        </div>
      </body>
    </html>
    """
    _send_email(to_email, subject, html_body)
    logger.info("Sent staff payroll email to %s period=%s", to_email, period_label)


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


def send_free_guide_email(to_email: str, subscriber_id: int) -> None:
    site_url = (settings.site_url or "https://www.glucoforager.com").rstrip("/")
    token = make_unsubscribe_token(subscriber_id, to_email)
    unsubscribe_url = f"{site_url}/unsubscribe?token={token}"
    logo_url = f"{site_url}/images/logo.png"
    guide_url = "https://drive.google.com/file/d/1aQgpyBQGNMgmhAWCz1_ezZEYcklURYE2/view?usp=sharing"

    subject = "Your free diabetic meal prep guide"
    html_body = f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #0C1824;">
        <div style="max-width:620px; margin:0 auto; border:1px solid #e5e7eb; border-radius:14px; padding:22px;">
          <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px;">
            <img src="{logo_url}" alt="GlucoForager" width="36" height="36" style="display:block; border-radius:10px;" />
            <div style="font-weight:800; font-size:18px; color:#0C1824;">GlucoForager</div>
          </div>
          <h2 style="color:#0FB7A5; margin-top:0;">Your free guide is ready</h2>
          <p style="line-height:1.6; font-size:14px; color:#0C1824;">
            Thanks for requesting The Free Diabetic Meal Prep Guide.
          </p>
          <p style="line-height:1.6; font-size:14px; color:#0C1824;">
            Use the button below to open the guide:
          </p>
          <p style="margin:24px 0;">
            <a href="{guide_url}" style="display:inline-block; background:#0D9488; color:#ffffff; text-decoration:none; font-weight:800; padding:12px 18px; border-radius:10px;">
              Open the free guide
            </a>
          </p>
          <p style="line-height:1.6; font-size:13px; color:#6b7280;">
            If the button does not work, copy and paste this link into your browser:<br />
            <a href="{guide_url}" style="color:#0D9488;">{guide_url}</a>
          </p>
          <p style="margin-top:24px; color:#6b7280; font-size:12px;">
            You are also subscribed to GlucoForager updates. Unsubscribe anytime:
            <a href="{unsubscribe_url}" style="color:#0FB7A5;">Unsubscribe</a>
          </p>
        </div>
      </body>
    </html>
    """
    _send_email(to_email, subject, html_body)
    logger.info("Sent free guide email to %s", to_email)


_BLOG_SKIP_HEADINGS = re.compile(r"frequently asked|faq|make it easier|references|sources|further reading", re.I)


def _plain(value: str | None) -> str:
    text = re.sub(r"<[^>]*>", " ", value or "")
    return re.sub(r"\s+", " ", _html.unescape(text)).strip()


_BOLD_LINE = re.compile(r"<p[^>]*>\s*<(?:strong|b)>(.*?)</(?:strong|b)>\s*</p>", re.I | re.S)


def _is_sentence(text: str) -> bool:
    return len(text.split()) >= 15 or text.rstrip("\"')”").endswith((".", "!", "?"))


def _email_headings(content: str, title: str) -> list[str]:
    """Section titles for 'In this article': H2s, else H3s, else short bold-only lines
    (older posts use bold paragraphs as headings). Skips FAQ questions, the post title
    repeated, and promo blocks."""
    for pattern in (r"<h2[^>]*>(.*?)</h2>", r"<h3[^>]*>(.*?)</h3>"):
        found = [_plain(h) for h in re.findall(pattern, content, flags=re.I | re.S)]
        found = [h for h in found if h and not _BLOG_SKIP_HEADINGS.search(h)]
        if len(found) >= 2:
            return found[:5]
    title_words = set(_plain(title).lower().split())
    out = []
    for raw in _BOLD_LINE.findall(content):
        text = _plain(raw).rstrip(":")
        words = text.lower().split()
        if not text or len(words) > 12 or text.endswith("?") or _BLOG_SKIP_HEADINGS.search(text):
            continue
        if re.search(r"glucoguide|feature highlight|download|the app", text, re.I):
            continue
        if title_words and len(set(words) & title_words) / max(len(set(words)), 1) >= 0.4:
            continue
        out.append(text)
    return out[:5] if len(out) >= 3 else []


def blog_email_teaser(content: str | None, excerpt: str | None, *, title: str = "", max_words: int = 110) -> dict:
    """What the email shows from the article: an opening teaser (cut off part-way so
    readers click through), up to 5 section headings, and the reading time."""
    content = content or ""
    excerpt_text = _plain(excerpt)
    body = re.split(r"<h[23][^>]*>\s*(?:frequently asked|faq)", content, maxsplit=1, flags=re.I)[0]
    paragraphs = []
    for raw in re.findall(r"<p[^>]*>(.*?)</p>", body, flags=re.I | re.S):
        if re.fullmatch(r"\s*<(strong|b)>.*?</>\s*", raw, flags=re.I | re.S):
            continue  # a bold line used as a heading, not body text
        text = _plain(raw)
        if len(text.split()) >= 6 and text != excerpt_text and _is_sentence(text):
            paragraphs.append(text)

    teaser, used = [], 0
    for p in paragraphs:
        words = p.split()
        if used + len(words) <= max_words:
            teaser.append(p)
            used += len(words)
            continue
        room = max_words - used
        if room >= 15:
            teaser.append(" ".join(words[:room]).rstrip(",;:.") + "…")
        elif teaser:
            teaser[-1] = teaser[-1].rstrip(".") + "…"
        break

    words_total = len(_plain(content).split())
    return {
        "lead": excerpt_text,
        "paragraphs": teaser,
        "headings": _email_headings(content, title),
        "read_minutes": max(1, round(words_total / 220)) if words_total else None,
    }


def _blog_post_email(
    *,
    post_title: str,
    post_excerpt: str | None,
    post_url: str,
    image_url: str | None,
    reason_html: str,
    unsubscribe_url: str,
    post_content: str | None = None,
    author_name: str | None = None,
) -> tuple[str, str]:
    """Professional teaser email for a blog post. Table-based, inline-styled layout so it
    renders the same in Gmail, Outlook and Apple Mail. The full article is never emailed:
    readers get the opening, what the article covers, and a button to read the rest."""
    site = _site_url()
    esc = _html.escape
    title = (post_title or "New article").strip()
    teaser = blog_email_teaser(post_content, post_excerpt, title=title)
    url = esc(post_url)
    preheader = esc((teaser["lead"] or (teaser["paragraphs"] or [""])[0])[:140])

    byline_bits = [esc((author_name or "").strip() or "The GlucoForager Team")]
    if teaser["read_minutes"]:
        byline_bits.append(f"{teaser['read_minutes']} min read")
    byline = " &nbsp;&middot;&nbsp; ".join(byline_bits)

    image_row = ""
    if (image_url or "").strip():
        image_row = f"""
        <tr><td style="padding:0;">
          <a href="{url}" target="_blank"><img src="{esc(image_url.strip())}" width="600" alt="{esc(title)}"
            style="display:block; width:100%; max-width:600px; height:auto; border:0;" /></a>
        </td></tr>"""

    lead_html = (
        f'<p style="margin:0 0 16px 0; font-size:18px; line-height:28px; color:#0f172a; font-weight:600;">{esc(teaser["lead"])}</p>'
        if teaser["lead"]
        else ""
    )
    paragraphs_html = "".join(
        f'<p style="margin:0 0 16px 0; font-size:16px; line-height:26px; color:#334155;">{esc(p)}</p>'
        for p in teaser["paragraphs"]
    )
    headings_html = ""
    if teaser["headings"]:
        items = "".join(
            f"""<tr><td width="24" valign="top" style="padding:4px 0; color:#0d9488; font-size:15px; line-height:24px; font-weight:700;">&#10003;</td>
              <td style="padding:4px 0; font-size:15px; line-height:24px; color:#0f172a;">{esc(h)}</td></tr>"""
            for h in teaser["headings"]
        )
        headings_html = f"""
        <tr><td style="padding:8px 32px 0 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdfa; border:1px solid #ccfbf1; border-radius:12px;">
            <tr><td style="padding:18px 20px;">
              <p style="margin:0 0 8px 0; font-size:12px; letter-spacing:1.2px; text-transform:uppercase; font-weight:700; color:#0f766e;">In this article</p>
              <table role="presentation" cellpadding="0" cellspacing="0">{items}</table>
            </td></tr>
          </table>
        </td></tr>"""

    subject = title[:160]
    html_body = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>{esc(title)}</title>
</head>
<body style="margin:0; padding:0; background:#eef2f5; -webkit-text-size-adjust:100%;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:#eef2f5;">{preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f5;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0"
        style="width:100%; max-width:600px; background:#ffffff; border-radius:16px; overflow:hidden; font-family:Helvetica, Arial, sans-serif;">

        <tr><td style="padding:16px 32px; background:#0f766e;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td valign="middle">
              <a href="{site}" target="_blank" style="text-decoration:none;">
                <img src="{site}/images/logo.png" width="32" height="32" alt="" style="display:inline-block; vertical-align:middle; border-radius:8px; background:#ffffff; border:0;" />
                <span style="display:inline-block; vertical-align:middle; margin-left:8px; font-size:18px; font-weight:700; color:#ffffff;">GlucoForager</span>
              </a>
            </td>
            <td align="right" valign="middle" style="font-size:12px; color:#ccfbf1; letter-spacing:1px; text-transform:uppercase;">The Blog</td>
          </tr></table>
        </td></tr>
        {image_row}

        <tr><td style="padding:28px 32px 4px 32px;">
          <p style="margin:0 0 10px 0; font-size:12px; letter-spacing:1.2px; text-transform:uppercase; font-weight:700; color:#0d9488;">New article</p>
          <h1 style="margin:0 0 10px 0; font-size:28px; line-height:36px; font-weight:800; color:#0f172a;">
            <a href="{url}" target="_blank" style="color:#0f172a; text-decoration:none;">{esc(title)}</a>
          </h1>
          <p style="margin:0 0 22px 0; font-size:13px; color:#64748b;">{byline}</p>
          {lead_html}
          {paragraphs_html}
        </td></tr>
        {headings_html}

        <tr><td align="center" style="padding:28px 32px 8px 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td align="center" style="border-radius:999px; background:#0d9488;">
              <a href="{url}" target="_blank"
                style="display:inline-block; padding:15px 34px; font-size:16px; font-weight:700; color:#ffffff; text-decoration:none; border-radius:999px;">
                Continue reading &rarr;
              </a>
            </td>
          </tr></table>
        </td></tr>

        <tr><td style="padding:24px 32px 8px 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0;"><tr>
            <td style="padding:22px 0 0 0;">
              <p style="margin:0 0 6px 0; font-size:16px; font-weight:700; color:#0f172a;">Put it into practice with GlucoForager</p>
              <p style="margin:0 0 12px 0; font-size:14px; line-height:22px; color:#475569;">
                Snap the food you already have and get diabetes-friendly recipes with carbs per serving,
                smart swaps and a glucose log that shows how meals affect you.
              </p>
              <a href="{site}/download" target="_blank" style="font-size:14px; font-weight:700; color:#0d9488; text-decoration:none;">Try it free &rarr;</a>
              &nbsp;&nbsp;&nbsp;
              <a href="{site}/recipes" target="_blank" style="font-size:14px; font-weight:700; color:#0d9488; text-decoration:none;">Browse free recipes &rarr;</a>
            </td>
          </tr></table>
        </td></tr>

        <tr><td style="padding:24px 32px 28px 32px; background:#f8fafc; border-top:1px solid #e2e8f0;">
          <p style="margin:0 0 8px 0; font-size:13px; font-weight:700; color:#0f172a;">GlucoForager</p>
          <p style="margin:0 0 12px 0; font-size:12px; line-height:18px; color:#64748b;">
            Diabetes-friendly recipes, meal ideas and blood sugar insights.<br/>
            <a href="{site}/blog" target="_blank" style="color:#0f766e; text-decoration:none;">Blog</a> &nbsp;&middot;&nbsp;
            <a href="{site}/recipes" target="_blank" style="color:#0f766e; text-decoration:none;">Recipes</a> &nbsp;&middot;&nbsp;
            <a href="{site}/download" target="_blank" style="color:#0f766e; text-decoration:none;">Get the app</a> &nbsp;&middot;&nbsp;
            <a href="mailto:hello@glucoforager.com" style="color:#0f766e; text-decoration:none;">hello@glucoforager.com</a>
          </p>
          <p style="margin:0 0 12px 0; font-size:11px; line-height:17px; color:#94a3b8;">
            Our articles are general information, not medical advice. Talk to your doctor, diabetes nurse or dietitian
            before making changes to your diet or treatment.
          </p>
          <p style="margin:0; font-size:11px; line-height:17px; color:#94a3b8;">
            {reason_html}
            <a href="{esc(unsubscribe_url)}" target="_blank" style="color:#64748b; text-decoration:underline;">Unsubscribe</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""
    return subject, html_body


def render_blog_post_newsletter_email(
    *,
    post_title: str,
    post_excerpt: str | None,
    post_url: str,
    image_url: str | None,
    unsubscribe_url: str,
    post_content: str | None = None,
    author_name: str | None = None,
) -> tuple[str, str]:
    return _blog_post_email(
        post_title=post_title,
        post_excerpt=post_excerpt,
        post_url=post_url,
        image_url=image_url,
        post_content=post_content,
        author_name=author_name,
        reason_html="You're receiving this because you subscribed to GlucoForager updates.",
        unsubscribe_url=unsubscribe_url,
    )


def render_blog_post_to_user_email(
    *,
    user_id: int,
    to_email: str,
    post_title: str,
    post_excerpt: str | None,
    post_url: str,
    image_url: str | None,
    post_content: str | None = None,
    author_name: str | None = None,
) -> tuple[str, str]:
    """For app users (not newsletter subscribers). The unsubscribe link sets the same
    per-user marketing opt-out the welcome-week and win-back emails respect."""
    from .user_email_tokens import make_dunning_unsubscribe_token

    return _blog_post_email(
        post_title=post_title,
        post_excerpt=post_excerpt,
        post_url=post_url,
        image_url=image_url,
        post_content=post_content,
        author_name=author_name,
        reason_html="You're receiving this because you have a GlucoForager account.",
        unsubscribe_url=f"{_site_url()}/unsubscribe?type=dunning&token={make_dunning_unsubscribe_token(user_id, to_email)}",
    )


def send_blog_post_newsletter_email(to_email: str, unsubscribe_url: str, **post) -> None:
    subject, html_body = render_blog_post_newsletter_email(unsubscribe_url=unsubscribe_url, **post)
    _send_email(to_email, subject, html_body)
    logger.info("Sent blog post newsletter email to %s", to_email)


def send_blog_post_to_user_email(to_email: str, user_id: int, **post) -> None:
    subject, html_body = render_blog_post_to_user_email(user_id=user_id, to_email=to_email, **post)
    _send_email(to_email, subject, html_body)
    logger.info("Sent blog post user-broadcast email to %s", to_email)


def _dunning_shell(*, to_email: str, user_id: int, heading: str, body_html: str) -> str:
    """Shared HTML wrapper for the win-back sequence - logo header, teal heading,
    caller-supplied body, then a resubscribe button and an unsubscribe footer scoped
    to this user (not the website newsletter list - see user_email_tokens.py)."""
    site_url = (settings.site_url or "https://www.glucoforager.com").rstrip("/")
    logo_url = f"{site_url}/images/logo.png"
    # openPremium=1 is picked up by the mobile app's Universal Links config (App.js) to jump
    # straight to the paywall when the link opens in-app instead of the web fallback page.
    resubscribe_url = f"{site_url}/resubscribe?openPremium=1"
    unsubscribe_token = make_dunning_unsubscribe_token(user_id, to_email)
    unsubscribe_url = f"{site_url}/unsubscribe?type=dunning&token={unsubscribe_token}"

    return f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #0C1824;">
        <div style="max-width:560px; margin:0 auto; border:1px solid #e5e7eb; border-radius:14px; padding:22px;">
          <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px;">
            <img src="{logo_url}" alt="GlucoForager" width="36" height="36" style="display:block; border-radius:10px;" />
            <div style="font-weight:800; font-size:18px; color:#0C1824;">GlucoForager</div>
          </div>
          <h2 style="color:#0FB7A5; margin-top:0;">{heading}</h2>
          {body_html}
          <p style="margin:24px 0;">
            <a href="{resubscribe_url}" style="display:inline-block; background:#0D9488; color:#ffffff; text-decoration:none; font-weight:800; padding:12px 18px; border-radius:10px;">
              Resubscribe to Premium
            </a>
          </p>
          <p style="margin-top:20px; color:#6b7280;">Stay steady, eat well.<br/>The GlucoForager team</p>
          <p style="margin-top:24px; color:#6b7280; font-size:12px;">
            Don't want these emails?
            <a href="{unsubscribe_url}" style="color:#0FB7A5;">Unsubscribe</a>
          </p>
        </div>
      </body>
    </html>
    """


def send_dunning_template_email(
    to_email: str,
    full_name: str | None,
    user_id: int,
    *,
    subject: str,
    heading: str,
    body_html: str,
    placeholders: dict[str, str] | None = None,
) -> str | None:
    """Sends one win-back email from admin-editable content (see
    DunningEmailTemplate / /admin/win-back/templates) - the caller (the dunning
    scheduler) resolves which stage's subject/heading/body_html to pass in, so an
    edit saved there takes effect on the very next scheduled send with no deploy.
    {{name}} in body_html is always replaced with the recipient's first name (or
    "there"); any additional {{token}} the caller passes in `placeholders` (e.g.
    {{usage_summary}} for day0) is substituted the same way. Returns Resend's email
    id for later open/click matching (see DunningEmailLog)."""
    greeting_name = full_name.strip().split(" ")[0] if full_name else "there"
    resolved_body = body_html.replace("{{name}}", greeting_name)
    for token, value in (placeholders or {}).items():
        resolved_body = resolved_body.replace(f"{{{{{token}}}}}", value)
    html_body = _dunning_shell(to_email=to_email, user_id=user_id, heading=heading, body_html=resolved_body)
    resend_id = _send_email(to_email, subject, html_body)
    logger.info("Sent dunning email to %s (subject=%r)", to_email, subject)
    return resend_id


# ── Welcome week (no-card 7-day Premium) lifecycle emails ─────────────────────
# Sent by welcome_week_scheduler.py (day 5 and day 7) and the one-off relaunch
# script (scripts/welcome_week_relaunch.py). They share the win-back unsubscribe
# (dunning_opt_out), so one opt-out stops all lifecycle marketing for that user.


def _welcome_week_shell(
    *,
    to_email: str,
    user_id: int | None,
    heading: str,
    body_html: str,
    button_label: str,
    button_url: str,
    footer_note: str | None = None,
) -> str:
    """user_id=None for transactional mail (the signup welcome), which has no unsubscribe link."""
    site_url = (settings.site_url or "https://www.glucoforager.com").rstrip("/")
    logo_url = f"{site_url}/images/logo.png"
    note_html = f'<p style="line-height:1.6; color:#374151;">{footer_note}</p>' if footer_note else ""
    unsubscribe_html = ""
    if user_id is not None:
        unsubscribe_url = f"{site_url}/unsubscribe?type=dunning&token={make_dunning_unsubscribe_token(user_id, to_email)}"
        unsubscribe_html = (
            '<p style="margin-top:24px; color:#6b7280; font-size:12px;">'
            f"Don't want these emails? <a href=\"{unsubscribe_url}\" style=\"color:#0FB7A5;\">Unsubscribe</a></p>"
        )
    return f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #0C1824;">
        <div style="max-width:560px; margin:0 auto; border:1px solid #e5e7eb; border-radius:14px; padding:22px;">
          <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px;">
            <img src="{logo_url}" alt="GlucoForager" width="36" height="36" style="display:block; border-radius:10px;" />
            <div style="font-weight:800; font-size:18px; color:#0C1824;">GlucoForager</div>
          </div>
          <h2 style="color:#0FB7A5; margin-top:0;">{heading}</h2>
          {body_html}
          <p style="margin:24px 0;">
            <a href="{button_url}" style="display:inline-block; background:#0D9488; color:#ffffff; text-decoration:none; font-weight:800; padding:12px 18px; border-radius:10px;">
              {button_label}
            </a>
          </p>
          {note_html}
          <p style="margin-top:20px; color:#6b7280;">Stay steady, eat well.<br/>The GlucoForager team</p>
          {unsubscribe_html}
        </div>
      </body>
    </html>
    """


def _first_name(full_name: str | None) -> str:
    return full_name.strip().split(" ")[0] if full_name and full_name.strip() else "there"


def _site_url() -> str:
    return (settings.site_url or "https://www.glucoforager.com").rstrip("/")


def send_welcome_week_reminder_email(to_email: str, full_name: str | None, user_id: int, *, days_left: int) -> str | None:
    """Day 5: the welcome week is ending soon."""
    days = f"{days_left} day{'s' if days_left != 1 else ''}"
    body = f"""
      <p>Hi {_first_name(full_name)},</p>
      <p style="line-height:1.6;">Your GlucoForager Premium welcome week ends in <strong>{days}</strong>.
      Until then, everything is still unlocked: fridge scans, GlucoGuide, recipes, food swaps and your daily meal planner.</p>
      <p style="line-height:1.6;">If GlucoForager is making your food decisions easier, upgrade to keep unlimited access,
      including the daily meal planner, which is Premium only.</p>
    """
    html = _welcome_week_shell(
        to_email=to_email,
        user_id=user_id,
        heading=f"{days} left of your welcome week",
        body_html=body,
        button_label="Keep Premium",
        button_url=f"{_site_url()}/resubscribe?openPremium=1",
    )
    return _send_email(to_email, f"{days} left of your GlucoForager welcome week", html)


def send_welcome_week_ended_email(
    to_email: str, full_name: str | None, user_id: int, *, weekly_limits: dict[str, int]
) -> str | None:
    """Day 7: the welcome week is over - here's what stays free (live admin limits)."""
    labels = [
        ("glucoguide", "GlucoGuide question", "GlucoGuide questions"),
        ("recipe_generation", "recipe generation", "recipe generations"),
        ("ingredient_scan", "fridge scan", "fridge scans"),
        ("food_scan", "food scan", "food scans"),
        ("swaps", "food swap search", "food swap searches"),
    ]
    items = "".join(
        f"<li><strong>{n}</strong> {one if n == 1 else many}</li>"
        for key, one, many in labels
        if (n := int(weekly_limits.get(key, 0))) > 0
    )
    body = f"""
      <p>Hi {_first_name(full_name)},</p>
      <p style="line-height:1.6;">Your Premium welcome week has ended, but GlucoForager isn't going anywhere.
      Every week you still get free uses of our AI features:</p>
      <ul style="line-height:1.7;">{items}</ul>
      <p style="line-height:1.6;">Glucose and meal logging stay free, always. Free uses refresh every Monday.</p>
      <p style="line-height:1.6;">Want unlimited access and your daily meal planner back? Upgrade anytime.</p>
    """
    html = _welcome_week_shell(
        to_email=to_email,
        user_id=user_id,
        heading="Your welcome week has ended. Here's what's still free",
        body_html=body,
        button_label="Upgrade to Premium",
        button_url=f"{_site_url()}/resubscribe?openPremium=1",
    )
    return _send_email(to_email, "Your welcome week has ended. Here's what's still free", html)


_UPDATE_HIGHLIGHTS = [
    ("A brand-new Home", "Your day at a glance: carbs, glucose and three quick ways to log or find a meal."),
    ("Glucose insights", "Trends, the foods that affect you most, patterns, and after-meal reminders."),
    ("Meal planner", "Plan two days ahead, swap any meal, and get your shopping list built for you."),
    ("Faster recipes and a recipe library", "Search and filter by meal or by quick options, with your allergies applied."),
    ("Scan anything", "Fridge photos, plates of food and barcodes, with an instant diabetes-friendly verdict."),
]

_UPDATE_ALSO_NEW = [
    "Daily challenge with streaks to keep you on track",
    "Food swaps with real photos of each option",
    "GlucoGuide AI for any food or blood sugar question",
    "200+ free diabetes-friendly recipes on our website",
]


def render_welcome_week_relaunch_email(
    to_email: str, full_name: str | None, user_id: int, *, welcome_days: int = 7
) -> tuple[str, str]:
    """"Your Friday update": what's new in the app, plus a fresh welcome week of Premium
    (already granted by the relaunch script) as the reason to come back and try it.
    Text-led, table-based and inline-styled so it stays short and renders everywhere."""
    from .user_email_tokens import make_dunning_unsubscribe_token

    esc = _html.escape
    site = _site_url()
    period = f"{welcome_days} day{'' if welcome_days == 1 else 's'}"
    first = esc(_first_name(full_name))
    download_url = f"{site}/download"
    unsubscribe_url = f"{site}/unsubscribe?type=dunning&token={make_dunning_unsubscribe_token(user_id, to_email)}"
    subject = f"Your Friday update: a new GlucoForager (and {period} of Premium on us)"
    preheader = f"Here's what we've been building, and {period} of Premium is already unlocked on your account."

    highlights = "".join(
        f"""<tr>
              <td width="36" valign="top" style="padding:9px 0;">
                <div style="width:26px; height:26px; line-height:26px; border-radius:8px; background:#ccfbf1; color:#0f766e; font-size:13px; font-weight:800; text-align:center;">{i}</div>
              </td>
              <td valign="top" style="padding:9px 0;">
                <p style="margin:0; font-size:15px; font-weight:700; color:#0f172a;">{esc(title)}</p>
                <p style="margin:2px 0 0 0; font-size:14px; line-height:21px; color:#475569;">{esc(text)}</p>
              </td>
            </tr>"""
        for i, (title, text) in enumerate(_UPDATE_HIGHLIGHTS, start=1)
    )
    also_new = "".join(
        f"""<tr>
              <td width="20" valign="top" style="padding:3px 0; color:#0d9488; font-size:14px; line-height:21px; font-weight:700;">&#10003;</td>
              <td valign="top" style="padding:3px 0; font-size:14px; line-height:21px; color:#334155;">{esc(item)}</td>
            </tr>"""
        for item in _UPDATE_ALSO_NEW
    )

    html_body = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>{esc(subject)}</title>
</head>
<body style="margin:0; padding:0; background:#eef2f5; -webkit-text-size-adjust:100%;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:#eef2f5;">{esc(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f5;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0"
        style="width:100%; max-width:600px; background:#ffffff; border-radius:16px; overflow:hidden; font-family:Helvetica, Arial, sans-serif;">

        <tr><td style="padding:16px 32px; background:#0f766e;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td valign="middle">
              <a href="{site}" target="_blank" style="text-decoration:none;">
                <img src="{site}/images/logo.png" width="32" height="32" alt="" style="display:inline-block; vertical-align:middle; border-radius:8px; background:#ffffff; border:0;" />
                <span style="display:inline-block; vertical-align:middle; margin-left:8px; font-size:18px; font-weight:700; color:#ffffff;">GlucoForager</span>
              </a>
            </td>
            <td align="right" valign="middle" style="font-size:12px; color:#ccfbf1; letter-spacing:1px; text-transform:uppercase;">Friday update</td>
          </tr></table>
        </td></tr>

        <tr><td style="padding:30px 32px 6px 32px;">
          <p style="margin:0 0 10px 0; font-size:12px; letter-spacing:1.2px; text-transform:uppercase; font-weight:700; color:#0d9488;">Your Friday update</p>
          <h1 style="margin:0 0 12px 0; font-size:28px; line-height:35px; font-weight:800; color:#0f172a;">A lot has changed in GlucoForager</h1>
          <p style="margin:0; font-size:16px; line-height:26px; color:#334155;">
            Hi {first}, here's what we've been building since you last looked, and a gift so you can try all of it.
          </p>
        </td></tr>

        <tr><td style="padding:20px 32px 0 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f766e; border-radius:14px;">
            <tr><td align="center" style="padding:22px 20px;">
              <p style="margin:0 0 4px 0; font-size:18px; line-height:25px; font-weight:800; color:#ffffff;">{period} of Premium, on us</p>
              <p style="margin:0 0 16px 0; font-size:14px; line-height:21px; color:#ccfbf1;">Already unlocked on your account. No card needed, nothing to cancel.</p>
              <table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr>
                <td align="center" style="border-radius:999px; background:#ffffff;">
                  <a href="{download_url}" target="_blank"
                    style="display:inline-block; padding:13px 30px; font-size:15px; font-weight:700; color:#0f766e; text-decoration:none; border-radius:999px;">
                    Open GlucoForager
                  </a>
                </td>
              </tr></table>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:26px 32px 0 32px;">
          <p style="margin:0 0 4px 0; font-size:12px; letter-spacing:1.2px; text-transform:uppercase; font-weight:700; color:#0d9488;">What we've been building</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">{highlights}</table>
        </td></tr>

        <tr><td style="padding:12px 32px 0 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 6px 0; font-size:12px; letter-spacing:1.2px; text-transform:uppercase; font-weight:700; color:#0f766e;">Also new</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">{also_new}</table>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:24px 32px 0 32px;">
          <p style="margin:0 0 6px 0; font-size:15px; font-weight:700; color:#0f172a;">What happens after {period}?</p>
          <p style="margin:0 0 14px 0; font-size:14px; line-height:22px; color:#475569;">
            You go back to the free plan automatically, which still includes free uses every week. You won't be
            charged: there's no card on file.
          </p>
          <p style="margin:0; font-size:14px; line-height:22px; color:#475569;">
            <strong style="color:#0f172a;">Update to the latest version</strong> in the
            <a href="https://apps.apple.com/us/app/glucoforager/id6758808427" target="_blank" style="color:#0d9488; font-weight:700; text-decoration:none;">App Store</a>
            or
            <a href="https://play.google.com/store/apps/details?id=com.glucoforager.app" target="_blank" style="color:#0d9488; font-weight:700; text-decoration:none;">Google Play</a>
            to see everything new.
          </p>
        </td></tr>

        <tr><td style="padding:24px 32px 28px 32px;">
          <p style="margin:0; font-size:15px; line-height:24px; color:#334155;">
            Have a great weekend, and if anything could be better, just reply. I read every message.<br/><br/>
            <strong style="color:#0f172a;">Adey</strong><br/>
            <span style="color:#64748b;">Founder, GlucoForager</span>
          </p>
        </td></tr>

        <tr><td style="padding:24px 32px 28px 32px; background:#f8fafc; border-top:1px solid #e2e8f0;">
          <p style="margin:0 0 8px 0; font-size:13px; font-weight:700; color:#0f172a;">GlucoForager</p>
          <p style="margin:0 0 12px 0; font-size:12px; line-height:18px; color:#64748b;">
            Diabetes-friendly recipes, meal ideas and blood sugar insights.<br/>
            <a href="{site}/recipes" target="_blank" style="color:#0f766e; text-decoration:none;">Recipes</a> &nbsp;&middot;&nbsp;
            <a href="{site}/blog" target="_blank" style="color:#0f766e; text-decoration:none;">Blog</a> &nbsp;&middot;&nbsp;
            <a href="{download_url}" target="_blank" style="color:#0f766e; text-decoration:none;">Get the app</a> &nbsp;&middot;&nbsp;
            <a href="mailto:hello@glucoforager.com" style="color:#0f766e; text-decoration:none;">hello@glucoforager.com</a>
          </p>
          <p style="margin:0 0 12px 0; font-size:11px; line-height:17px; color:#94a3b8;">
            GlucoForager offers general guidance, not medical advice. Talk to your doctor, diabetes nurse or dietitian
            before making changes to your diet or treatment.
          </p>
          <p style="margin:0; font-size:11px; line-height:17px; color:#94a3b8;">
            You're receiving this because you have a GlucoForager account.
            <a href="{esc(unsubscribe_url)}" target="_blank" style="color:#64748b; text-decoration:underline;">Unsubscribe</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""
    return subject, html_body


def send_welcome_week_relaunch_email(to_email: str, full_name: str | None, user_id: int, *, welcome_days: int = 7) -> str | None:
    """One-off: existing non-paying users get a fresh welcome week."""
    subject, html_body = render_welcome_week_relaunch_email(to_email, full_name, user_id, welcome_days=welcome_days)
    return _send_email(to_email, subject, html_body, reply_to="hello@glucoforager.com")


def _days_phrase(days: int) -> str:
    """7 -> "week", 14 -> "2 weeks", 3 -> "3 days" (admin-configurable welcome week length)."""
    if days % 7 == 0:
        weeks = days // 7
        return "week" if weeks == 1 else f"{weeks} weeks"
    return "day" if days == 1 else f"{days} days"


def _send_plain_welcome_email(to_email: str, full_name: str | None) -> None:
    """Welcome week switched off in admin (0 days): plain welcome, no Premium promise."""
    body = f"""
      <p>Hi {_first_name(full_name)},</p>
      <p style="line-height:1.6;">Welcome to GlucoForager. Deciding what to eat with diabetes shouldn't mean guessing,
      and that's exactly what we're here to help with.</p>
      <p style="line-height:1.6;">Open the app and ask it what to eat today. Every week you get free uses of our AI features.</p>
    """
    html = _welcome_week_shell(
        to_email=to_email, user_id=None, heading="Welcome to GlucoForager", body_html=body,
        button_label="Open GlucoForager", button_url=_site_url(),
    )
    _send_email(to_email, "Welcome to GlucoForager", html)


def _blog_autopilot_shell(heading: str, body_html: str, button_url: str, button_label: str) -> str:
    return f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #0C1824;">
        <div style="max-width:640px; margin:0 auto; border:1px solid #e5e7eb; border-radius:14px; padding:22px;">
          <h2 style="color:#0FB7A5; margin-top:0;">{heading}</h2>
          {body_html}
          <p style="margin:22px 0 6px 0;">
            <a href="{button_url}" style="background:#0F766E; color:#ffffff; padding:12px 20px; border-radius:999px; text-decoration:none; font-weight:bold;">{button_label}</a>
          </p>
          <p style="margin-top:20px; color:#6b7280; font-size:12px;">Blog autopilot - nothing is published until you publish it.</p>
        </div>
      </body>
    </html>
    """


def send_blog_week_plan_email(to_email: str, topics: list) -> None:
    """Admin-only: the week's researched blog topics, so they can be swapped before drafting."""
    planned = sorted((t for t in topics if t.status == "planned"), key=lambda t: t.planned_for)
    reserves = [t for t in topics if t.status == "reserve"]
    rows = "".join(
        f"""<tr>
          <td style="padding:10px 8px 10px 0; vertical-align:top; color:#6b7280; width:90px;">{t.planned_for.strftime('%a %d %b')}</td>
          <td style="padding:10px 0; vertical-align:top;"><strong>{_html.escape(t.title_idea or t.keyword)}</strong><br/>
            <span style="color:#0F766E; font-size:13px;">Keyword: {_html.escape(t.keyword)}</span><br/>
            <span style="color:#6b7280; font-size:13px;">{_html.escape(t.reason or '')}</span></td>
        </tr>"""
        for t in planned
    )
    spare = ", ".join(_html.escape(t.keyword) for t in reserves) or "none"
    body = f"""
      <p>Here's next week's plan, picked from what people in the US and UK are searching. Drafts arrive by email at 6am on each day.</p>
      <table style="width:100%; border-collapse:collapse; font-size:14px;">{rows}</table>
      <p style="font-size:13px; color:#6b7280;">Reserves (used if you swap a topic): {spare}</p>
    """
    _send_email(
        to_email,
        f"Blog plan for next week: {len(planned)} topics",
        _blog_autopilot_shell("This week's blog topics", body, f"{_site_url()}/admin/blog/autopilot", "Review or swap topics"),
    )


def send_blog_draft_ready_email(to_email: str, post, topic) -> None:
    checks = (topic.signals or {}).get("checks") or []
    words = (topic.signals or {}).get("words")
    checks_html = (
        "<p style='font-size:13px;'><strong>Worth a look:</strong></p><ul style='font-size:13px; color:#92400e;'>"
        + "".join(f"<li>{_html.escape(c)}</li>" for c in checks)
        + "</ul>"
        if checks
        else "<p style='font-size:13px; color:#15803d;'>All automatic checks passed.</p>"
    )
    body = f"""
      <p style="font-size:18px; margin:0 0 6px 0;"><strong>{_html.escape(post.title)}</strong></p>
      <p style="color:#6b7280; margin:0 0 14px 0;">Keyword: {_html.escape(topic.keyword)}{f" &middot; {words:,} words" if words else ""}</p>
      <p>{_html.escape(post.excerpt or '')}</p>
      {checks_html}
      <p style="font-size:13px;">Before publishing: check the facts and numbers, add a personal touch if you like, then Publish or Schedule.</p>
    """
    _send_email(
        to_email,
        f"New blog draft ready: {post.title}"[:160],
        _blog_autopilot_shell("A new draft is ready to review", body, f"{_site_url()}/admin/blog/{post.id}", "Review the draft"),
    )


def send_blog_autopilot_failed_email(to_email: str, topic) -> None:
    body = f"""
      <p>The draft for <strong>{_html.escape(topic.keyword)}</strong> couldn't be written.</p>
      <p style="font-size:13px; color:#6b7280;">{_html.escape(topic.error or 'Unknown error')}</p>
      <p>You can retry it from the autopilot page.</p>
    """
    _send_email(
        to_email,
        f"Blog draft failed: {topic.keyword}"[:160],
        _blog_autopilot_shell("A blog draft failed", body, f"{_site_url()}/admin/blog/autopilot", "Open autopilot"),
    )
