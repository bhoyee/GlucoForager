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
          <p>Welcome to GlucoForager. Your account is ready, and your next step is to start your 7-day free trial in the app.</p>
          <ul>
            <li>Scan your fridge or type ingredients to get diabetes-friendly meal ideas</li>
            <li>Use food swaps, daily meal planning, GlucoGuide AI, favourites, and recipe history</li>
            <li>Trial and billing are handled securely through the App Store or Google Play</li>
          </ul>
          <p style="margin-top:16px;">Open the app to start your trial and make daily food decisions simpler.</p>
          <p style="margin-top:24px; color:#6b7280;">Stay steady, eat well.<br/>The GlucoForager team</p>
        </div>
      </body>
    </html>
    """
    _send_email(to_email, subject, html_body)
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
