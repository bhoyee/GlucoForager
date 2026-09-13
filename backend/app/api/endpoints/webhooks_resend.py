import base64
import hashlib
import hmac
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from ...core.config import settings
from ...database import get_db
from ...models.dunning_email_log import DunningEmailLog

router = APIRouter(prefix="/webhooks/resend", tags=["webhooks-resend"])
logger = logging.getLogger("glucoforager.webhooks.resend")

# Resend delivers webhooks signed via Svix (svix-id/svix-timestamp/svix-signature),
# not a simple bearer token like RevenueCat's - see
# https://resend.com/docs/dashboard/webhooks/verify-webhooks-requests
TRACKED_EVENT_TYPES = {"email.opened", "email.clicked"}


def _verify_svix_signature(*, secret: str, svix_id: str, svix_timestamp: str, svix_signature: str, body: bytes) -> bool:
    # Secret arrives as "whsec_<base64>" - only the part after the prefix is the
    # actual signing key.
    key_part = secret.split("_", 1)[1] if secret.startswith("whsec_") else secret
    try:
        secret_bytes = base64.b64decode(key_part)
    except Exception:
        return False

    signed_content = f"{svix_id}.{svix_timestamp}.{body.decode('utf-8')}".encode("utf-8")
    expected = base64.b64encode(hmac.new(secret_bytes, signed_content, hashlib.sha256).digest()).decode("utf-8")

    # svix-signature is space-separated "v1,<base64sig>" entries - compare against all of them.
    for part in svix_signature.split(" "):
        candidate = part.split(",", 1)[1] if "," in part else part
        if hmac.compare_digest(candidate, expected):
            return True
    return False


@router.post("", status_code=200)
async def resend_webhook(
    request: Request,
    db: Session = Depends(get_db),
    svix_id: str | None = Header(None, alias="svix-id"),
    svix_timestamp: str | None = Header(None, alias="svix-timestamp"),
    svix_signature: str | None = Header(None, alias="svix-signature"),
):
    body = await request.body()

    secret = settings.resend_webhook_secret
    if secret:
        if not (svix_id and svix_timestamp and svix_signature):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing webhook signature")
        if not _verify_svix_signature(
            secret=secret, svix_id=svix_id, svix_timestamp=svix_timestamp, svix_signature=svix_signature, body=body
        ):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook signature")
    else:
        logger.warning("RESEND_WEBHOOK_SECRET not configured - accepting webhook without verifying signature")

    payload = await request.json()
    event_type = payload.get("type")
    if event_type not in TRACKED_EVENT_TYPES:
        # Not an error - delivered/bounced/complained/etc. just aren't tracked here.
        return {"ok": True, "handled": False}

    data = payload.get("data") or {}
    email_id = data.get("email_id")
    if not email_id:
        return {"ok": True, "handled": False}

    log_row = db.query(DunningEmailLog).filter(DunningEmailLog.resend_email_id == email_id).first()
    if not log_row:
        # Not a dunning email we're tracking (could be a newsletter/other send) - fine.
        return {"ok": True, "handled": False}

    if event_type == "email.opened" and not log_row.opened_at:
        log_row.opened_at = datetime.utcnow()
        db.add(log_row)
        db.commit()
    elif event_type == "email.clicked" and not log_row.clicked_at:
        log_row.clicked_at = datetime.utcnow()
        log_row.clicked_link = (data.get("click") or {}).get("link")
        db.add(log_row)
        db.commit()

    return {"ok": True, "handled": True}
