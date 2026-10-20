"""The user's country: detected quietly (IP + phone region) and confirmed at most twice.

POST /app/me/region   - the app calls this on open with the phone's region; we also note
                        today's IP country. Returns the country in use and whether to show
                        the one-off "Are you in ...?" card.
POST /app/me/country  - the card's answer: confirm / set / snooze.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ...database import get_db
from ...models.user import User
from ...services import geo_country
from ..dependencies import get_current_user

router = APIRouter(prefix="/app/me", tags=["app"])

SNOOZE_DAYS = 14
MAX_PROMPTS = 2


class RegionPayload(BaseModel):
    phone_region: str | None = Field(None, max_length=8)


class CountryAnswer(BaseModel):
    action: str = Field(..., pattern="^(confirm|set|snooze)$")
    country_code: str | None = Field(None, min_length=2, max_length=2)


def _should_ask(user: User, now: datetime) -> tuple[bool, str | None]:
    """Ask only when we have no chosen country, haven't asked too often, and the IP and
    phone disagree (or we know nothing). Returns (ask, suggested country)."""
    if (user.country_code or "").strip():
        return False, None
    if (user.country_prompt_count or 0) >= MAX_PROMPTS:
        return False, None
    if user.country_prompt_snoozed_until and user.country_prompt_snoozed_until > now:
        return False, None
    ip_country = geo_country.usual_country(user.detected_countries)
    phone = (user.phone_region or "").upper() or None
    if ip_country and phone and ip_country == phone:
        return False, ip_country  # both agree: confident, no need to ask
    # Prefer the IP country: phones are often left on the default "United States" region.
    return True, ip_country or phone


def _state(user: User, now: datetime) -> dict:
    code, source = geo_country.effective_country(user)
    ask, suggested = _should_ask(user, now)
    return {"country_code": code, "source": source, "ask": ask, "suggested_country": suggested}


@router.post("/region")
def report_region(
    payload: RegionPayload,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.utcnow()
    region = (payload.phone_region or "").strip().upper()
    if len(region) == 2 and region.isalpha():
        current_user.phone_region = region
    ip_country = geo_country.country_for_ip(geo_country.client_ip(request))
    if ip_country:
        current_user.detected_countries = geo_country.record_observation(
            current_user.detected_countries, ip_country, now.date().isoformat()
        )
    db.add(current_user)
    db.commit()
    return _state(current_user, now)


@router.post("/country")
def answer_country(
    payload: CountryAnswer,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.utcnow()
    if payload.action in ("confirm", "set"):
        code = (payload.country_code or "").strip().upper()
        if len(code) != 2 or not code.isalpha():
            raise HTTPException(status_code=422, detail={"code": "invalid_country", "message": "Pick a country."})
        current_user.country_code = code
    else:
        current_user.country_prompt_count = (current_user.country_prompt_count or 0) + 1
        current_user.country_prompt_snoozed_until = now + timedelta(days=SNOOZE_DAYS)
    db.add(current_user)
    db.commit()
    return _state(current_user, now)
