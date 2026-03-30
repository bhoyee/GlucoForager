from __future__ import annotations

from datetime import datetime
import io
import mimetypes
import os
import html
from html.parser import HTMLParser
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..admin_dependencies import get_current_staff_user, require_staff_permission
from ...database import get_db
from ...models.staff_audit_log import StaffAuditLog
from ...models.staff_inbox_message import StaffInboxMessage
from ...models.staff_notification import StaffNotification
from ...models.staff_user import StaffUser
from ...services.email_service import _send_email  # re-use configured provider
from ...services.ftp_storage_service import open_shared_ftp
from ...services.inbox_file_storage_service import store_inbox_attachment
from ...services.staff_rbac_service import StaffRBACService


router = APIRouter(prefix="/admin/inbox", tags=["admin-inbox"])


def _is_admin(db: Session, staff: StaffUser) -> bool:
    perms = StaffRBACService.get_user_permission_keys(db, staff.id)
    roles = StaffRBACService.get_user_role_keys(db, staff.id)
    return StaffRBACService.has_permission(perms, "*") or StaffRBACService.has_permission(perms, "admin.manage") or "admin" in roles


def _ensure_staff_email(email: str) -> str:
    e = str(email or "").strip().lower()
    if not e or "@" not in e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid recipient email")
    if not e.endswith("@glucoforager.com"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Recipient must be a @glucoforager.com address")
    return e[:254]


class _Sanitizer(HTMLParser):
    allowed_tags = {"b", "strong", "i", "em", "u", "br", "p", "div", "span", "ul", "ol", "li", "a"}
    allowed_attrs = {"a": {"href", "target", "rel"}}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        t = (tag or "").lower().strip()
        if t not in self.allowed_tags:
            return
        safe_attrs: list[str] = []
        allowed = self.allowed_attrs.get(t, set())
        for k, v in attrs:
            key = (k or "").lower().strip()
            if key not in allowed:
                continue
            val = str(v or "").strip()
            if key == "href":
                # allow http(s) and mailto only
                if val.startswith("mailto:"):
                    pass
                else:
                    try:
                        u = urlparse(val)
                        if u.scheme not in {"http", "https"}:
                            continue
                    except Exception:
                        continue
            if key in {"target", "rel"}:
                # enforce safe link behavior
                continue
            safe_val = val.replace('"', "&quot;")
            safe_attrs.append(f'{key}="{safe_val}"')

        if t == "a":
            safe_attrs.append('target="_blank"')
            safe_attrs.append('rel="noreferrer"')

        attr_str = (" " + " ".join(safe_attrs)) if safe_attrs else ""
        self.out.append(f"<{t}{attr_str}>")

    def handle_endtag(self, tag: str) -> None:
        t = (tag or "").lower().strip()
        if t not in self.allowed_tags:
            return
        if t == "br":
            return
        self.out.append(f"</{t}>")

    def handle_data(self, data: str) -> None:
        text = str(data or "")
        text = (
            text.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
        )
        self.out.append(text)

    def handle_entityref(self, name: str) -> None:
        self.out.append(f"&{name};")

    def handle_charref(self, name: str) -> None:
        self.out.append(f"&#{name};")


def sanitize_html(html: str) -> str:
    raw = str(html or "").strip()
    if not raw:
        return ""
    s = _Sanitizer()
    try:
        s.feed(raw)
    except Exception:
        # fallback: plain text
        return (
            raw.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\n", "<br/>")
        )
    return "".join(s.out)[:100_000]


class ComposePayload(BaseModel):
    to: str = Field(..., max_length=254)
    subject: str = Field(..., max_length=200)
    body_html: str = Field(..., max_length=100_000)


@router.post("/messages")
def compose_message(
    request: Request,
    payload: ComposePayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("notifications.read")),
):
    to_email = _ensure_staff_email(payload.to)
    subject = str(payload.subject or "").strip()
    if not subject:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Subject is required")

    recipient = db.query(StaffUser).filter(StaffUser.email == to_email, StaffUser.deleted_at.is_(None)).first()
    if not recipient or not StaffRBACService.is_active_staff(recipient):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Recipient not found or inactive")

    html_body = sanitize_html(payload.body_html)
    if not html_body.strip():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Message is required")

    msg = StaffInboxMessage(
        thread_id=None,
        parent_id=None,
        sender_staff_user_id=int(current_staff.id),
        recipient_staff_user_id=int(recipient.id),
        to_email=to_email,
        subject=subject[:200],
        body_html=html_body,
        created_at=datetime.utcnow(),
    )
    db.add(msg)
    db.flush()
    msg.thread_id = int(msg.id)

    db.add(
        StaffNotification(
            staff_user_id=int(recipient.id),
            type="mail.message",
            title=f"New mail: {subject[:80]}",
            body=None,
            data={"message_id": int(msg.id)},
            created_at=datetime.utcnow(),
        )
    )

    db.add(
        StaffAuditLog(
            actor_id=int(current_staff.id),
            action="inbox.compose",
            entity="staff_inbox_messages",
            entity_id=str(msg.id),
            details={"to": to_email, "subject": subject[:200]},
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            created_at=datetime.utcnow(),
        )
    )

    db.commit()

    # Also send external email (best-effort).
    try:
        sender_label = getattr(current_staff, "full_name", None) or current_staff.email
        _send_email(
            to_email,
            f"[GlucoForager Staff] {subject}",
            f"""
            <html><body style="font-family: Arial, sans-serif; color:#0C1824;">
              <div style="max-width:640px; margin:0 auto; border:1px solid #e5e7eb; border-radius:12px; padding:16px;">
                <p style="margin-top:0; color:#6b7280; font-size:12px;">From: {sender_label}</p>
                {html_body}
                <hr style="border:none;border-top:1px solid #e5e7eb; margin:16px 0;" />
                <p style="color:#6b7280; font-size:12px; margin:0;">This message is also available in your staff inbox.</p>
              </div>
            </body></html>
            """,
        )
    except Exception:
        pass

    return {"ok": True, "message_id": int(msg.id)}


@router.post("/messages/form")
def compose_message_form(
    request: Request,
    to: str = Form(...),
    subject: str = Form(...),
    body_html: str = Form(...),
    attachment: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("notifications.read")),
):
    payload = ComposePayload(to=to, subject=subject, body_html=body_html)

    to_email = _ensure_staff_email(payload.to)
    subj = str(payload.subject or "").strip()
    if not subj:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Subject is required")

    recipient = db.query(StaffUser).filter(StaffUser.email == to_email, StaffUser.deleted_at.is_(None)).first()
    if not recipient or not StaffRBACService.is_active_staff(recipient):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Recipient not found or inactive")

    html_body = sanitize_html(payload.body_html)
    if not html_body.strip():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Message is required")

    stored = None
    if attachment and (attachment.filename or "").strip():
        try:
            stored = store_inbox_attachment(attachment)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
        except Exception:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to store attachment")

    msg = StaffInboxMessage(
        thread_id=None,
        parent_id=None,
        sender_staff_user_id=int(current_staff.id),
        recipient_staff_user_id=int(recipient.id),
        to_email=to_email,
        subject=subj[:200],
        body_html=html_body,
        attachment_original_name=getattr(stored, "original_name", None) if stored else None,
        attachment_filename=getattr(stored, "filename", None) if stored else None,
        attachment_url=getattr(stored, "url", None) if stored else None,
        attachment_content_type=getattr(stored, "content_type", None) if stored else None,
        attachment_size_bytes=getattr(stored, "size_bytes", None) if stored else None,
        attachment_storage_backend=getattr(stored, "storage_backend", None) if stored else None,
        attachment_remote_dir=getattr(stored, "remote_dir", None) if stored else None,
        created_at=datetime.utcnow(),
    )
    db.add(msg)
    db.flush()
    msg.thread_id = int(msg.id)

    db.add(
        StaffNotification(
            staff_user_id=int(recipient.id),
            type="mail.message",
            title=f"New mail: {subj[:80]}",
            body=None,
            data={"message_id": int(msg.id)},
            created_at=datetime.utcnow(),
        )
    )

    db.add(
        StaffAuditLog(
            actor_id=int(current_staff.id),
            action="inbox.compose",
            entity="staff_inbox_messages",
            entity_id=str(msg.id),
            details={"to": to_email, "subject": subj[:200], "has_attachment": bool(stored)},
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            created_at=datetime.utcnow(),
        )
    )

    db.commit()

    try:
        sender_label = getattr(current_staff, "full_name", None) or current_staff.email
        attachment_line = ""
        if stored and getattr(stored, "url", None):
            attachment_line = f'<p style="margin:10px 0 0 0; font-size:12px; color:#6b7280;">Attachment: <a href="{html.escape(str(stored.url))}" target="_blank" rel="noreferrer">Download</a></p>'
        _send_email(
            to_email,
            f"[GlucoForager Staff] {subj}",
            f"""
            <html><body style="font-family: Arial, sans-serif; color:#0C1824;">
              <div style="max-width:640px; margin:0 auto; border:1px solid #e5e7eb; border-radius:12px; padding:16px;">
                <p style="margin-top:0; color:#6b7280; font-size:12px;">From: {sender_label}</p>
                {html_body}
                {attachment_line}
                <hr style="border:none;border-top:1px solid #e5e7eb; margin:16px 0;" />
                <p style="color:#6b7280; font-size:12px; margin:0;">This message is also available in your staff inbox.</p>
              </div>
            </body></html>
            """,
        )
    except Exception:
        pass

    return {"ok": True, "message_id": int(msg.id)}


@router.get("/messages")
def list_messages(
    box: str = "inbox",
    unread_only: int = 0,
    include_deleted: int = 0,
    all: int = 0,  # noqa: A002
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("notifications.read")),
):
    limit = max(1, min(int(limit or 50), 200))
    offset = max(0, int(offset or 0))

    box = str(box or "inbox").strip().lower()
    if box not in {"inbox", "sent"}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid box")

    q = db.query(StaffInboxMessage)
    if all and not _is_admin(db, current_staff):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")

    if box == "sent":
        if not all:
            q = q.filter(StaffInboxMessage.sender_staff_user_id == int(current_staff.id))
        # Note: deleted_at represents the recipient soft-delete. Do not filter it out for sent mail.
    else:
        if not all:
            q = q.filter(StaffInboxMessage.recipient_staff_user_id == int(current_staff.id))

        if unread_only:
            q = q.filter(StaffInboxMessage.read_at.is_(None))

        if not include_deleted:
            q = q.filter(StaffInboxMessage.deleted_at.is_(None))

    rows = q.order_by(StaffInboxMessage.created_at.desc()).offset(offset).limit(limit).all()

    # sender info map
    sender_ids = {int(r.sender_staff_user_id) for r in rows if r.sender_staff_user_id is not None}
    senders = db.query(StaffUser).filter(StaffUser.id.in_(list(sender_ids))).all() if sender_ids else []
    sender_map = {int(s.id): {"email": s.email, "full_name": getattr(s, "full_name", None)} for s in senders}

    recipient_ids = {int(r.recipient_staff_user_id) for r in rows if r.recipient_staff_user_id is not None}
    recipients = db.query(StaffUser).filter(StaffUser.id.in_(list(recipient_ids))).all() if recipient_ids else []
    recipient_map = {int(s.id): {"email": s.email, "full_name": getattr(s, "full_name", None)} for s in recipients}

    def _sender_label(sender_id: int) -> str:
        s = sender_map.get(int(sender_id))
        if not s:
            return f"Staff #{sender_id}"
        name = str(s.get("full_name") or "").strip()
        email = str(s.get("email") or "").strip()
        if name and email:
            return f"{name} ({email})"
        return email or f"Staff #{sender_id}"

    def _recipient_label(recipient_id: int) -> str:
        s = recipient_map.get(int(recipient_id))
        if not s:
            return f"Staff #{recipient_id}"
        name = str(s.get("full_name") or "").strip()
        email = str(s.get("email") or "").strip()
        if name and email:
            return f"{name} ({email})"
        return email or f"Staff #{recipient_id}"

    return {
        "items": [
            {
                "id": int(r.id),
                "thread_id": int(r.thread_id or r.id),
                "subject": r.subject,
                "from": _sender_label(int(r.sender_staff_user_id)),
                "to": _recipient_label(int(r.recipient_staff_user_id)),
                "box": box,
                "has_attachment": bool(getattr(r, "attachment_url", None)),
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "read_at": r.read_at.isoformat() if r.read_at else None,
                "is_deleted": bool(r.deleted_at) if box == "inbox" else False,
            }
            for r in rows
        ]
    }


class ReplyPayload(BaseModel):
    body_html: str = Field(..., max_length=100_000)


@router.get("/messages/{message_id}")
def get_thread(
    message_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("notifications.read")),
):
    root = db.query(StaffInboxMessage).filter(StaffInboxMessage.id == int(message_id)).first()
    if not root:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    is_admin = _is_admin(db, current_staff)
    if not is_admin:
        if int(root.recipient_staff_user_id) != int(current_staff.id) and int(root.sender_staff_user_id) != int(current_staff.id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")

    thread_id = int(root.thread_id or root.id)
    q = db.query(StaffInboxMessage).filter(StaffInboxMessage.thread_id == thread_id).order_by(StaffInboxMessage.created_at.asc())
    if not is_admin:
        q = q.filter(
            (StaffInboxMessage.sender_staff_user_id == int(current_staff.id))
            | (StaffInboxMessage.recipient_staff_user_id == int(current_staff.id))
        ).filter(StaffInboxMessage.deleted_at.is_(None) | (StaffInboxMessage.recipient_staff_user_id != int(current_staff.id)))

    msgs = q.all()
    staff_ids = {int(m.sender_staff_user_id) for m in msgs} | {int(m.recipient_staff_user_id) for m in msgs}
    staff_rows = db.query(StaffUser).filter(StaffUser.id.in_(list(staff_ids))).all() if staff_ids else []
    staff_map = {int(s.id): {"email": s.email, "full_name": getattr(s, "full_name", None)} for s in staff_rows}

    def _label(staff_id: int) -> str:
        s = staff_map.get(int(staff_id))
        if not s:
            return f"Staff #{staff_id}"
        name = str(s.get("full_name") or "").strip()
        email = str(s.get("email") or "").strip()
        if name and email:
            return f"{name} ({email})"
        return email or f"Staff #{staff_id}"

    return {
        "thread_id": thread_id,
        "messages": [
            {
                "id": int(m.id),
                "parent_id": int(m.parent_id) if m.parent_id else None,
                "sender_id": int(m.sender_staff_user_id),
                "recipient_id": int(m.recipient_staff_user_id),
                "is_mine": int(m.sender_staff_user_id) == int(current_staff.id),
                "from": _label(int(m.sender_staff_user_id)),
                "to": _label(int(m.recipient_staff_user_id)),
                "subject": m.subject,
                "body_html": m.body_html,
                "attachment": (
                    {
                        "original_name": getattr(m, "attachment_original_name", None),
                        "filename": getattr(m, "attachment_filename", None),
                        "url": getattr(m, "attachment_url", None),
                        "content_type": getattr(m, "attachment_content_type", None),
                        "size_bytes": getattr(m, "attachment_size_bytes", None),
                    }
                    if getattr(m, "attachment_url", None)
                    else None
                ),
                "created_at": m.created_at.isoformat() if m.created_at else None,
                "read_at": m.read_at.isoformat() if m.read_at else None,
                "is_deleted": bool(m.deleted_at),
            }
            for m in msgs
        ],
    }


@router.get("/messages/{message_id}/attachment/download")
def download_attachment(
    request: Request,
    message_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("notifications.read")),
):
    msg = db.query(StaffInboxMessage).filter(StaffInboxMessage.id == int(message_id)).first()
    if not msg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    is_admin = _is_admin(db, current_staff)
    if not is_admin:
        if int(msg.recipient_staff_user_id) != int(current_staff.id) and int(msg.sender_staff_user_id) != int(current_staff.id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")

    url = str(getattr(msg, "attachment_url", None) or "").strip()
    if not url:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No attachment")

    backend = str(getattr(msg, "attachment_storage_backend", None) or settings.inbox_file_storage_backend or "local").strip().lower()
    download_name = str(getattr(msg, "attachment_original_name", None) or getattr(msg, "attachment_filename", None) or "attachment").strip() or "attachment"
    media_type = str(getattr(msg, "attachment_content_type", None) or "").strip() or None

    try:
        p = urlparse(url if (url.startswith("http://") or url.startswith("https://")) else "https://" + url.lstrip("/"))
        ext = os.path.splitext(p.path or "")[1].strip()
        if ext and "." not in download_name:
            download_name = download_name + ext
        if not media_type and ext:
            guessed = mimetypes.guess_type("x" + ext)[0]
            if guessed:
                media_type = guessed
    except Exception:
        pass

    if backend == "ftp":
        base_url = str(settings.inbox_file_remote_base_url or "").strip().rstrip("/")
        if not base_url:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="INBOX_FILE_REMOTE_BASE_URL not configured")
        if not (base_url.startswith("http://") or base_url.startswith("https://")):
            base_url = "https://" + base_url.lstrip("/")

        base = urlparse(base_url)
        u = urlparse(url)
        if not (base.netloc and u.netloc and base.netloc.lower() == u.netloc.lower()):
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Cannot locate remote file")
        if not u.path.startswith(base.path.rstrip("/") + "/"):
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Cannot locate remote file")

        filename = u.path.split("/")[-1].strip()
        if not filename:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Cannot locate remote file")

        remote_dir = str(getattr(msg, "attachment_remote_dir", None) or settings.inbox_file_ftp_base_dir or "").strip()
        if not remote_dir:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="INBOX_FILE_FTP_BASE_DIR not configured")

        ftp = open_shared_ftp()
        try:
            try:
                ftp.cwd("/" + remote_dir.lstrip("/"))
            except Exception:
                raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Remote dir missing")

            buf = io.BytesIO()
            try:
                ftp.retrbinary(f"RETR {filename}", buf.write)
            except Exception as exc:
                if "550" in str(exc):
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
                raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to download file")
        finally:
            try:
                ftp.quit()
            except Exception:
                try:
                    ftp.close()
                except Exception:
                    pass

        try:
            db.add(
                StaffAuditLog(
                    actor_id=int(current_staff.id),
                    action="inbox.attachment_download",
                    entity="staff_inbox_messages",
                    entity_id=str(msg.id),
                    details={"subject": msg.subject, "filename": filename},
                    ip=request.client.host if request.client else None,
                    user_agent=request.headers.get("user-agent"),
                    created_at=datetime.utcnow(),
                )
            )
            db.commit()
        except Exception:
            try:
                db.rollback()
            except Exception:
                pass

        return Response(
            content=buf.getvalue(),
            media_type=media_type or "application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{download_name}"'},
        )

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")


@router.post("/messages/{message_id}/read")
def mark_message_read(
    message_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("notifications.read")),
):
    msg = db.query(StaffInboxMessage).filter(StaffInboxMessage.id == int(message_id)).first()
    if not msg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if int(msg.recipient_staff_user_id) != int(current_staff.id) and not _is_admin(db, current_staff):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")
    if msg.read_at is None and int(msg.recipient_staff_user_id) == int(current_staff.id):
        msg.read_at = datetime.utcnow()
        db.commit()
    return {"ok": True}


@router.post("/messages/{message_id}/reply")
def reply(
    request: Request,
    message_id: int,
    payload: ReplyPayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("notifications.read")),
):
    root = db.query(StaffInboxMessage).filter(StaffInboxMessage.id == int(message_id)).first()
    if not root:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    if int(root.recipient_staff_user_id) != int(current_staff.id) and int(root.sender_staff_user_id) != int(current_staff.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")

    thread_id = int(root.thread_id or root.id)
    html_body = sanitize_html(payload.body_html)
    if not html_body.strip():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Message is required")

    # reply recipient is the "other" person
    if int(root.sender_staff_user_id) == int(current_staff.id):
        recipient_id = int(root.recipient_staff_user_id)
    else:
        recipient_id = int(root.sender_staff_user_id)

    recipient = db.query(StaffUser).filter(StaffUser.id == recipient_id, StaffUser.deleted_at.is_(None)).first()
    if not recipient or not StaffRBACService.is_active_staff(recipient):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Recipient not found or inactive")

    subject = root.subject
    if not subject.lower().startswith("re:"):
        subject = f"Re: {subject}"

    msg = StaffInboxMessage(
        thread_id=thread_id,
        parent_id=int(root.id),
        sender_staff_user_id=int(current_staff.id),
        recipient_staff_user_id=int(recipient.id),
        to_email=str(recipient.email),
        subject=subject[:200],
        body_html=html_body,
        created_at=datetime.utcnow(),
    )
    db.add(msg)
    db.flush()

    db.add(
        StaffNotification(
            staff_user_id=int(recipient.id),
            type="mail.message",
            title=f"New mail: {subject[:80]}",
            body=None,
            data={"message_id": int(msg.id)},
            created_at=datetime.utcnow(),
        )
    )
    db.add(
        StaffAuditLog(
            actor_id=int(current_staff.id),
            action="inbox.reply",
            entity="staff_inbox_messages",
            entity_id=str(msg.id),
            details={"to": str(recipient.email), "subject": subject[:200]},
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            created_at=datetime.utcnow(),
        )
    )
    db.commit()

    try:
        sender_label = getattr(current_staff, "full_name", None) or current_staff.email
        _send_email(
            str(recipient.email),
            f"[GlucoForager Staff] {subject}",
            f"""
            <html><body style="font-family: Arial, sans-serif; color:#0C1824;">
              <div style="max-width:640px; margin:0 auto; border:1px solid #e5e7eb; border-radius:12px; padding:16px;">
                <p style="margin-top:0; color:#6b7280; font-size:12px;">From: {sender_label}</p>
                {html_body}
                <hr style="border:none;border-top:1px solid #e5e7eb; margin:16px 0;" />
                <p style="color:#6b7280; font-size:12px; margin:0;">This message is also available in your staff inbox.</p>
              </div>
            </body></html>
            """,
        )
    except Exception:
        pass

    return {"ok": True, "message_id": int(msg.id)}


@router.post("/messages/{message_id}/reply/form")
def reply_form(
    request: Request,
    message_id: int,
    body_html: str = Form(...),
    attachment: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("notifications.read")),
):
    payload = ReplyPayload(body_html=body_html)

    root = db.query(StaffInboxMessage).filter(StaffInboxMessage.id == int(message_id)).first()
    if not root:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    if int(root.recipient_staff_user_id) != int(current_staff.id) and int(root.sender_staff_user_id) != int(current_staff.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")

    thread_id = int(root.thread_id or root.id)
    html_body = sanitize_html(payload.body_html)
    if not html_body.strip():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Message is required")

    if int(root.sender_staff_user_id) == int(current_staff.id):
        recipient_id = int(root.recipient_staff_user_id)
    else:
        recipient_id = int(root.sender_staff_user_id)

    recipient = db.query(StaffUser).filter(StaffUser.id == recipient_id, StaffUser.deleted_at.is_(None)).first()
    if not recipient or not StaffRBACService.is_active_staff(recipient):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Recipient not found or inactive")

    subject = root.subject
    if not subject.lower().startswith("re:"):
        subject = f"Re: {subject}"

    stored = None
    if attachment and (attachment.filename or "").strip():
        try:
            stored = store_inbox_attachment(attachment)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
        except Exception:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to store attachment")

    msg = StaffInboxMessage(
        thread_id=thread_id,
        parent_id=int(root.id),
        sender_staff_user_id=int(current_staff.id),
        recipient_staff_user_id=int(recipient.id),
        to_email=str(recipient.email),
        subject=subject[:200],
        body_html=html_body,
        attachment_original_name=getattr(stored, "original_name", None) if stored else None,
        attachment_filename=getattr(stored, "filename", None) if stored else None,
        attachment_url=getattr(stored, "url", None) if stored else None,
        attachment_content_type=getattr(stored, "content_type", None) if stored else None,
        attachment_size_bytes=getattr(stored, "size_bytes", None) if stored else None,
        attachment_storage_backend=getattr(stored, "storage_backend", None) if stored else None,
        attachment_remote_dir=getattr(stored, "remote_dir", None) if stored else None,
        created_at=datetime.utcnow(),
    )
    db.add(msg)
    db.flush()

    db.add(
        StaffNotification(
            staff_user_id=int(recipient.id),
            type="mail.message",
            title=f"New mail: {subject[:80]}",
            body=None,
            data={"message_id": int(msg.id)},
            created_at=datetime.utcnow(),
        )
    )
    db.add(
        StaffAuditLog(
            actor_id=int(current_staff.id),
            action="inbox.reply",
            entity="staff_inbox_messages",
            entity_id=str(msg.id),
            details={"to": str(recipient.email), "subject": subject[:200], "has_attachment": bool(stored)},
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            created_at=datetime.utcnow(),
        )
    )
    db.commit()

    try:
        sender_label = getattr(current_staff, "full_name", None) or current_staff.email
        attachment_line = ""
        if stored and getattr(stored, "url", None):
            attachment_line = f'<p style="margin:10px 0 0 0; font-size:12px; color:#6b7280;">Attachment: <a href="{html.escape(str(stored.url))}" target="_blank" rel="noreferrer">Download</a></p>'
        _send_email(
            str(recipient.email),
            f"[GlucoForager Staff] {subject}",
            f"""
            <html><body style="font-family: Arial, sans-serif; color:#0C1824;">
              <div style="max-width:640px; margin:0 auto; border:1px solid #e5e7eb; border-radius:12px; padding:16px;">
                <p style="margin-top:0; color:#6b7280; font-size:12px;">From: {sender_label}</p>
                {html_body}
                {attachment_line}
                <hr style="border:none;border-top:1px solid #e5e7eb; margin:16px 0;" />
                <p style="color:#6b7280; font-size:12px; margin:0;">This message is also available in your staff inbox.</p>
              </div>
            </body></html>
            """,
        )
    except Exception:
        pass

    return {"ok": True, "message_id": int(msg.id)}


@router.delete("/messages/{message_id}")
def soft_delete_message(
    request: Request,
    message_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("notifications.read")),
):
    msg = db.query(StaffInboxMessage).filter(StaffInboxMessage.id == int(message_id)).first()
    if not msg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if int(msg.recipient_staff_user_id) != int(current_staff.id) and not _is_admin(db, current_staff):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")
    if msg.deleted_at:
        return {"ok": True}
    msg.deleted_at = datetime.utcnow()
    msg.deleted_by_staff_user_id = int(current_staff.id)
    db.add(
        StaffAuditLog(
            actor_id=int(current_staff.id),
            action="inbox.soft_delete",
            entity="staff_inbox_messages",
            entity_id=str(msg.id),
            details={"subject": msg.subject},
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            created_at=datetime.utcnow(),
        )
    )
    db.commit()
    return {"ok": True}


@router.delete("/messages/{message_id}/purge")
def purge_message(
    request: Request,
    message_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("admin.manage")),
):
    if not _is_admin(db, current_staff):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")
    msg = db.query(StaffInboxMessage).filter(StaffInboxMessage.id == int(message_id)).first()
    if not msg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    db.add(
        StaffAuditLog(
            actor_id=int(current_staff.id),
            action="inbox.purge",
            entity="staff_inbox_messages",
            entity_id=str(msg.id),
            details={"subject": msg.subject, "to": msg.to_email},
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            created_at=datetime.utcnow(),
        )
    )
    db.delete(msg)
    db.commit()
    return {"ok": True}
