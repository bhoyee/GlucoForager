"""In-app feedback from the rating prompt ("Not really" -> "What could be better?").

Goes to the same support inbox as the website contact form, with Reply-To set to the
signed-in user's email, so unhappy users reach us privately instead of a store review.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ...models.user import User
from ...services.cache_service import CacheService
from ...services.email_service import send_contact_form_email
from ..dependencies import get_current_user

router = APIRouter(prefix="/app", tags=["app"])
cache = CacheService()

FEEDBACK_LIMIT_PER_DAY = 5


class FeedbackPayload(BaseModel):
    message: str = Field(..., min_length=1, max_length=3000)
    source: str = Field("rating_prompt", max_length=40)
    app_version: str | None = Field(None, max_length=40)
    platform: str | None = Field(None, max_length=20)


@router.post("/feedback")
def send_feedback(payload: FeedbackPayload, current_user: User = Depends(get_current_user)):
    message = payload.message.strip()
    if not message:
        raise HTTPException(status_code=422, detail="Please write a short message.")
    if cache.incr(f"feedback:user:{current_user.id}", ttl_seconds=24 * 60 * 60) > FEEDBACK_LIMIT_PER_DAY:
        raise HTTPException(status_code=429, detail="Thanks, we've got your messages. Please try again tomorrow.")

    context = f"\n\n---\nUser #{current_user.id} · source: {payload.source}"
    if payload.platform or payload.app_version:
        context += f" · {payload.platform or '?'} {payload.app_version or ''}".rstrip()
    try:
        send_contact_form_email(
            name=current_user.full_name or current_user.email.split("@")[0],
            email=current_user.email,
            subject="In-app feedback",
            message=message + context,
        )
    except Exception:
        raise HTTPException(
            status_code=502,
            detail="Couldn't send your feedback right now. Please email hello@glucoforager.com.",
        ) from None
    return {"ok": True}
