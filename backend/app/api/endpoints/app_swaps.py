import json
import hashlib
from datetime import datetime, timezone
import logging
import re
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from openai import OpenAIError
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ...api.dependencies import get_current_user
from ...database import get_db
from ...models.ai_request import AIRequest
from ...models.user import User
from ...services.ai_swaps_service import AISwapsService, fallback_swaps, has_fallback_swaps
from ...services.food_profile_service import extract_food_profile
from ...services.cache_service import CacheService
from ...services.cost_tracker import record_ai_request
from ...services.swaps_ai_warmup import enqueue_swaps_ai_warmup
from ...services.subscription_service import get_effective_subscription_tier
from ...services.system_log_service import log_system_event


router = APIRouter(prefix="/app", tags=["app"])
logger = logging.getLogger(__name__)


class SwapsRequest(BaseModel):
    # Allow users to type short phrases (e.g. "Semolina (swallow)") and normalize server-side.
    # Keeping this too small causes FastAPI/Pydantic 422 before we can normalize.
    food: str = Field(..., min_length=1, max_length=120)
    force_swaps: bool = False


def _normalize_food_input(value: str) -> str:
    s = " ".join((value or "").strip().split())
    if not s:
        return ""
    # Prefer just the "food name" portion if user adds explanatory text.
    # Examples:
    # - "Semolina (used for swallow like semo)" -> "Semolina"
    # - "fufu, swallow" -> "fufu"
    for sep in ("(", ")", "|", ";", ",", ":", "\n", "\r", "\t"):
        if sep in s:
            s = s.split(sep, 1)[0].strip()
    s = s.strip().strip("?").strip()
    # Remove emojis / punctuation so common inputs like "ice cream🍦" don't fail validation.
    # Keep unicode letters/digits, spaces, hyphen, apostrophe.
    s = s.replace("_", " ")
    s = re.sub(r"[^\w\s'\-]", " ", s, flags=re.UNICODE)
    s = " ".join(s.split())
    # Keep the swaps query short and cacheable.
    return s[:25]


def _looks_like_food_query(value: str) -> bool:
    """Cheap validation to avoid calling AI on unrelated input."""
    s = _normalize_food_input(value)
    if not s:
        return False
    lowered = s.lower()
    if "http://" in lowered or "https://" in lowered or "www." in lowered:
        return False
    # Reject if it's mostly non-alphanumeric.
    alnum = sum(1 for ch in s if ch.isalnum())
    if alnum < 2:
        return False
    return True


def _http_error(*, status_code: int, code: str, message: str, **extra):
    detail = {"code": code, "message": message, **extra}
    raise HTTPException(status_code=status_code, detail=detail)


@router.post("/swaps")
def generate_food_swaps(
    payload: SwapsRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    trace_id = uuid.uuid4().hex[:12]
    try:
        response.headers["X-Swaps-Trace-Id"] = trace_id
    except Exception:
        pass

    raw_food = payload.food or ""
    food = _normalize_food_input(raw_food)
    if not _looks_like_food_query(food):
        logger.warning("Swaps 422 invalid_food_input raw_len=%s normalized=%r", len(str(raw_food)), food)
        log_system_event(
            {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "level": "warn",
                "source": "swaps",
                "message": "Swaps rejected (invalid_food_input)",
                "details": f"trace={trace_id} user_id={user.id} normalized={food!r} raw_len={len(str(raw_food))}",
                "path": request.url.path,
                "method": request.method,
                "ip": request.client.host if request.client else None,
            }
        )
        _http_error(
            status_code=422,
            code="invalid_food_input",
            message="Enter a single food or drink (e.g. 'rice', 'spinach', 'soda').",
            trace_id=trace_id,
        )

    tier = get_effective_subscription_tier(db, user)
    per_minute_limit = 3 if tier != "premium" else 8
    per_day_limit = 10 if tier != "premium" else 50

    food_profile = extract_food_profile(user)

    def _maybe_fill_swaps_from_fallback(result_payload: dict) -> dict:
        """
        If AI provides no usable swaps, fill swaps from the deterministic fallback catalog.

        This endpoint is explicitly "Food swaps" — users expect swap options even if the
        AI thinks the original food is a "good_choice". The fallback catalog is our safety
        net for always showing something actionable.
        """
        try:
            has_swaps = bool((result_payload.get("swaps") or {}).get("better_options"))
            if not has_swaps and has_fallback_swaps(food):
                fb = fallback_swaps(food=food, food_profile=food_profile, force_swaps=True)
                if fb.get("swaps"):
                    result_payload["should_show_swaps"] = True
                    result_payload["swaps"] = fb.get("swaps")
        except Exception:
            pass
        return result_payload

    def _to_client_payload(result_payload: dict) -> dict:
        """
        Mobile UX wants swaps, not an "assessment" object.

        Return a compact, swaps-first payload:
        {
          "food": "...",
          "message": "..." | null,
          "suggested_query": "..." | null,
          "swaps": {...} | null
        }
        """
        try:
            assessment = result_payload.get("assessment") or {}
            if isinstance(assessment, dict) and bool(assessment.get("needs_clarification")):
                msg = (
                    (assessment.get("clarification_question") or "").strip()
                    or "What exactly do you mean? (e.g. 'unripe plantain', 'unripe banana')"
                )
                suggested = assessment.get("suggested_query")
                return {
                    "food": str(result_payload.get("food") or food),
                    "message": msg[:160],
                    "suggested_query": (str(suggested).strip()[:25] if isinstance(suggested, str) and suggested.strip() else None),
                    "swaps": None,
                }
        except Exception:
            pass

        swaps = result_payload.get("swaps")
        swaps_obj = swaps if isinstance(swaps, dict) else None
        return {
            "food": str(result_payload.get("food") or food),
            "message": None,
            "suggested_query": None,
            "swaps": swaps_obj,
        }
    # Cache key must include the user's profile; otherwise different users can see each other's personalized swaps.
    profile_hash = "none"
    try:
        meaningful = any(
            food_profile.get(k)
            for k in (
                "blood_sugar_profile",
                "country_code",
                "preferred_cuisines",
                "meal_goals",
                "dietary_pattern",
                "allergens",
                "food_exclusions",
                "available_equipment",
                "cook_time_preference",
            )
        )
        if meaningful:
            profile_hash = hashlib.sha256(
                json.dumps(food_profile, sort_keys=True, ensure_ascii=False).encode("utf-8")
            ).hexdigest()[:16]
    except Exception:
        profile_hash = "none"

    cache = CacheService()
    # Burst limit (per minute).
    minute_key = f"swaps:rl:v1:user:{user.id}"
    minute_count = cache.incr(minute_key, ttl_seconds=60)
    if minute_count > per_minute_limit:
        _http_error(
            status_code=429,
            code="rate_limited",
            message="You're searching too fast. Please wait a moment and try again.",
            limit_per_minute=per_minute_limit,
        )

    # Daily quota (UTC-ish; uses server UTC time).
    now = datetime.utcnow()
    start_of_day = datetime(year=now.year, month=now.month, day=now.day)
    used_today = (
        db.query(AIRequest)
        .filter(
            AIRequest.user_id == user.id,
            AIRequest.request_type == "swaps",
            AIRequest.created_at >= start_of_day,
        )
        .count()
    )
    if used_today >= per_day_limit:
        if tier != "premium":
            _http_error(
                status_code=429,
                code="daily_limit_reached",
                message="Daily Food swaps limit reached. Upgrade to Premium for more.",
                limit_per_day=per_day_limit,
                upgrade=True,
            )
        _http_error(
            status_code=429,
            code="daily_limit_reached",
            message="Daily Food swaps limit reached. Please try again tomorrow.",
            limit_per_day=per_day_limit,
            upgrade=False,
        )

    # Cache v11: swaps-only client payload (no assessment fields returned to mobile).
    # We keep fallback cache only for AI failures, but we never serve it
    # ahead of AI so OpenAI remains the primary engine.
    cache_key_base = f"swaps:cache:v11:tier:{tier}:profile:{profile_hash}:force:{int(bool(payload.force_swaps))}:q:{food.lower()}"
    cache_key_ai = f"{cache_key_base}:ai"
    cache_key_fb = f"{cache_key_base}:fb"

    cached_ai = cache.get(cache_key_ai)
    if cached_ai:
        try:
            data = json.loads(cached_ai)
            device_id = request.headers.get("x-device-id")
            # Cached responses still count towards quota to prevent abuse.
            record_ai_request(
                db,
                user_id=user.id,
                tier=tier,
                request_type="swaps",
                model_used="cache",
                tokens_used=0,
                cost_estimate=0.0,
                device_id=device_id,
            )
            return data
        except Exception:
            pass

    try:
        # AI-first (your requirement): always call OpenAI and wait up to ~1 minute.
        # Fallback is only used when OpenAI errors/times out.
        started = time.perf_counter()
        service = AISwapsService()
        result = service.generate_swaps(
            food=food,
            force_swaps=bool(payload.force_swaps),
            timeout_seconds=55.0,
            food_profile=food_profile,
        )
        elapsed_ms = (time.perf_counter() - started) * 1000.0
        assessment = result.get("assessment") or {}
        if not isinstance(assessment, dict):
            _http_error(status_code=502, code="swaps_failed", message="Couldn't generate swaps right now. Please try again.")

        if bool(assessment.get("needs_clarification")):
            # Behave more like "normal GPT": don't hard-fail with a 422 for clarification.
            # Return 200 with a question so the app can display it without "Request failed".
            suggested_query = assessment.get("suggested_query")
            logger.warning("Swaps needs_clarification normalized=%r suggested=%r", food, suggested_query)
            log_system_event(
                {
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "level": "warn",
                    "source": "swaps",
                    "message": "Swaps needs_clarification (200)",
                    "details": f"trace={trace_id} user_id={user.id} food={food!r} suggested={suggested_query!r}",
                    "path": request.url.path,
                    "method": request.method,
                    "ip": request.client.host if request.client else None,
                }
            )
            response_payload = {
                "food": result.get("food"),
                "assessment": result.get("assessment"),
                "should_show_swaps": False,
                "swaps": None,
            }
            client_payload = _to_client_payload(response_payload)
            cache.set(cache_key_ai, json.dumps(client_payload, ensure_ascii=False), ttl_seconds=15 * 60)
            return client_payload
        is_food_or_drink = bool(assessment.get("is_food_or_drink", True))
        confidence = 1.0
        try:
            confidence = float(assessment.get("confidence", 1.0))
        except Exception:
            confidence = 1.0
        if not is_food_or_drink or confidence < 0.65:
            # Also return 200 for non-food inputs so the app can display guidance without a hard error.
            logger.warning("Swaps not_food_or_drink normalized=%r confidence=%.2f", food, confidence)
            log_system_event(
                {
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "level": "warn",
                    "source": "swaps",
                    "message": "Swaps not_food_or_drink (200)",
                    "details": f"trace={trace_id} user_id={user.id} food={food!r} confidence={confidence:.2f}",
                    "path": request.url.path,
                    "method": request.method,
                    "ip": request.client.host if request.client else None,
                }
            )
            response_payload = {
                "food": result.get("food"),
                "assessment": result.get("assessment"),
                "should_show_swaps": False,
                "swaps": None,
            }
            client_payload = _to_client_payload(response_payload)
            cache.set(cache_key_ai, json.dumps(client_payload, ensure_ascii=False), ttl_seconds=15 * 60)
            return client_payload

        device_id = request.headers.get("x-device-id")
        record_ai_request(
            db,
            user_id=user.id,
            tier=tier,
            request_type="swaps",
            model_used=str(result.get("model") or "unknown"),
            tokens_used=0,
            cost_estimate=0.0,
            device_id=device_id,
        )

        # Do not expose model/provider in the app response.
        response_payload = {
            "food": result.get("food"),
            "assessment": result.get("assessment"),
            "should_show_swaps": result.get("should_show_swaps"),
            "swaps": result.get("swaps"),
        }
        response_payload = _maybe_fill_swaps_from_fallback(response_payload)
        client_payload = _to_client_payload(response_payload)
        cache.set(cache_key_ai, json.dumps(client_payload, ensure_ascii=False), ttl_seconds=6 * 60 * 60)
        log_system_event(
            {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "level": "info",
                "source": "swaps",
                "message": "Swaps served by OpenAI",
                "details": f"trace={trace_id} user_id={user.id} food={food!r} ms={elapsed_ms:.1f}",
                "path": request.url.path,
                "method": request.method,
                "ip": request.client.host if request.client else None,
            }
        )
        return client_payload
    except OpenAIError as e:
        msg = str(e or "")
        logger.warning("Swaps OpenAI call failed (%s): %s", e.__class__.__name__, msg[:200])
        log_system_event(
            {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "level": "warn",
                "source": "swaps",
                "message": "Swaps OpenAI call failed",
                "details": f"trace={trace_id} user_id={user.id} food={food!r} err={e.__class__.__name__}:{msg[:160]}",
                "path": request.url.path,
                "method": request.method,
                "ip": request.client.host if request.client else None,
            }
        )
        # Prefer a deterministic fallback over returning 5xx so the feature stays usable.
        fb = fallback_swaps(food=food, food_profile=food_profile, force_swaps=bool(payload.force_swaps))
        # Never show provider/latency issues to users; keep messaging neutral and actionable.
        try:
            if isinstance(fb.get("assessment"), dict):
                summary = str(fb["assessment"].get("summary") or "").strip()
                if summary:
                    fb["assessment"]["summary"] = summary[:240]
        except Exception:
            pass
        response_payload = {
            "food": fb.get("food"),
            "assessment": fb.get("assessment"),
            "should_show_swaps": fb.get("should_show_swaps"),
            "swaps": fb.get("swaps"),
        }
        client_payload = _to_client_payload(response_payload)
        # Cache the fallback for a short period to prevent repeated slow upstream calls.
        try:
            cache.set(cache_key_fb, json.dumps(client_payload, ensure_ascii=False), ttl_seconds=15 * 60)
        except Exception:
            pass
        return client_payload
    except ValueError as e:
        msg = str(e or "")
        logger.warning("Swaps generation returned invalid output: %s", msg)
        if msg in {"food is required"}:
            _http_error(
                status_code=422,
                code="invalid_food_input",
                message="Enter a single food or drink (e.g. 'rice', 'spinach', 'soda').",
            )
        # If the model returns malformed/partial JSON, do not throw a 502 to mobile.
        # Return deterministic fallback swaps instead so the feature stays usable.
        log_system_event(
            {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "level": "warn",
                "source": "swaps",
                "message": "Swaps AI output invalid; serving fallback",
                "details": f"trace={trace_id} user_id={user.id} food={food!r} err={msg[:160]}",
                "path": request.url.path,
                "method": request.method,
                "ip": request.client.host if request.client else None,
            }
        )
        fb = fallback_swaps(food=food, food_profile=food_profile, force_swaps=True)
        client_payload = _to_client_payload(
            {
                "food": fb.get("food"),
                "assessment": fb.get("assessment"),
                "should_show_swaps": True,
                "swaps": fb.get("swaps"),
            }
        )
        try:
            cache.set(cache_key_fb, json.dumps(client_payload, ensure_ascii=False), ttl_seconds=15 * 60)
        except Exception:
            pass
        return client_payload
    except HTTPException:
        raise
    except Exception:
        _http_error(
            status_code=502,
            code="swaps_failed",
            message="Couldn't generate swaps right now. Please try again in a moment.",
        )
