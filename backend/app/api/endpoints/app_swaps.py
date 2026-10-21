import json
import hashlib
from datetime import datetime, timezone
import logging
import re
import time
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, Response
from openai import OpenAIError
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ...api.dependencies import get_current_user, require_ai_feature_access
from ...services import food_image_library, glucose_impact
from ...services import free_tier_service
from ...database import get_db
from ...models.user import User
from ...services.ai_swaps_service import AISwapsService
from ...services.food_profile_service import extract_food_profile
from ...services.cache_service import CacheService
from ...services.cost_tracker import record_ai_request
from ...services.rate_limit_service import check_ai_daily_limit, daily_limit_detail
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
    # Keep the swaps query short and cacheable, but allow common multi-word foods.
    return s[:60]


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


def _absolute(url: str | None, request: Request) -> str | None:
    if url and url.startswith("/"):
        return f"{str(request.base_url).rstrip('/')}{url}"
    return url


def _with_images(payload: dict, *, db: Session, request: Request, background_tasks: BackgroundTasks) -> dict:
    """Add library photos for the searched food and each swap; queue any that are missing."""
    try:
        swaps = payload.get("swaps") if isinstance(payload.get("swaps"), dict) else None
        options = swaps.get("options") if swaps and isinstance(swaps.get("options"), list) else []
        if not options:
            return payload
        food_name = str(payload.get("food") or "").strip()
        original = payload.get("original") if isinstance(payload.get("original"), dict) else None
        items: list[tuple[str, str | None]] = []
        if food_name:
            items.append((food_name, (original or {}).get("serving")))
        for opt in options:
            if isinstance(opt, dict) and str(opt.get("name") or "").strip():
                items.append((str(opt["name"]).strip(), opt.get("serving")))
        found = food_image_library.lookup(db, [n for n, _ in items])
        missing = [(n, s) for n, s in items if not found.get(n) and food_image_library.needs_generation(db, n)]
        if missing:
            background_tasks.add_task(food_image_library.generate_missing, missing)
        pending = {n for n, _ in missing}

        out = dict(payload)
        if food_name:
            out["original"] = {**(original or {}), "image_url": _absolute(found.get(food_name), request)}
        out["swaps"] = {
            **swaps,
            "options": [
                {**opt, "image_url": _absolute(found.get(str(opt.get("name") or "").strip()), request)}
                if isinstance(opt, dict)
                else opt
                for opt in options
            ],
        }
        out["images_pending"] = sorted(pending)
        return out
    except Exception as exc:  # noqa: BLE001 - photos are optional; never break swaps.
        logger.warning("Swap images failed: %s", str(exc)[:200])
        return payload


@router.get("/food-images")
def get_food_images(
    request: Request,
    background_tasks: BackgroundTasks,
    name: list[str] = Query(default=[]),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),  # noqa: ARG001
):
    """Poll for library photos by food name; queues generation for any still missing."""
    names = [n.strip()[:120] for n in name if n and n.strip()][:8]
    found = food_image_library.lookup(db, names)
    missing = [(n, None) for n in names if not found.get(n) and food_image_library.needs_generation(db, n)]
    queue = [(n, s) for n, s in missing if not food_image_library.is_generating(n)]
    if queue:
        background_tasks.add_task(food_image_library.generate_missing, queue)
    return {
        "images": {n: _absolute(found.get(n), request) for n in names},
        "pending": [n for n, _ in missing],
    }


@router.post("/swaps")
def generate_food_swaps(
    payload: SwapsRequest,
    request: Request,
    response: Response,
    background_tasks: BackgroundTasks,
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
            message="Enter a food or drink (e.g. 'ice cream', 'unripe plantain', 'rice').",
            trace_id=trace_id,
        )

    require_ai_feature_access(user, db, feature=free_tier_service.SWAPS)
    tier = get_effective_subscription_tier(db, user)
    per_minute_limit = 3 if tier != "premium" else 8

    food_profile = extract_food_profile(user)

    def _maybe_fill_swaps_from_fallback(result_payload: dict) -> dict:
        """
        If AI provides no usable swaps, fill swaps from the deterministic fallback catalog.

        This endpoint is explicitly "Food swaps" — users expect swap options even if the
        AI thinks the original food is a "good_choice". The fallback catalog is our safety
        net for always showing something actionable.
        """
        return result_payload

    def _impact_for(macros, gi=None):
        if not isinstance(macros, dict):
            return None
        gi_obj = gi if isinstance(gi, dict) else {"min": macros.get("gi_min"), "max": macros.get("gi_max")}
        lo, hi = gi_obj.get("min"), gi_obj.get("max")
        gi_mid = (lo + hi) / 2 if isinstance(lo, (int, float)) and isinstance(hi, (int, float)) else (lo if isinstance(lo, (int, float)) else hi)
        # Swap macros give net carbs; add fibre back so the formula sees total carbs.
        net, fibre = macros.get("net_carbs_g"), macros.get("fiber_g")
        carbs = (net + (fibre or 0)) if isinstance(net, (int, float)) else None
        return glucose_impact.estimate_impact(
            carbs_g=carbs, fiber_g=fibre, protein_g=macros.get("protein_g"), fat_g=macros.get("fat_g"),
            sugars_g=macros.get("sugars_g"), gi=gi_mid,
        )

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
                    "suggested_query": (str(suggested).strip()[:60] if isinstance(suggested, str) and suggested.strip() else None),
                    "swaps": None,
                }
        except Exception:
            pass

        swaps = result_payload.get("swaps")
        swaps_obj = swaps if isinstance(swaps, dict) else None
        # The original food's own assessment, for the "what you searched" card above the swaps.
        assessment = result_payload.get("assessment") or {}
        original = None
        if isinstance(assessment, dict) and assessment.get("summary"):
            original = {
                "verdict": assessment.get("verdict"),
                "summary": assessment.get("summary"),
                "watch_outs": assessment.get("watch_outs") or [],
                "pair_with": assessment.get("pair_with") or [],
                "glucose_impact": _impact_for(assessment.get("original_estimate")),
                "serving": (assessment.get("original_estimate") or {}).get("serving"),
            }
        # Typical glucose impact for each swap, so the app can compare it with the original.
        if swaps_obj and isinstance(swaps_obj.get("options"), list):
            swaps_obj = {**swaps_obj, "options": [
                {**opt, "glucose_impact": _impact_for(opt.get("macros"), opt.get("gi"))} if isinstance(opt, dict) else opt
                for opt in swaps_obj["options"]
            ]}
        return {
            "food": str(result_payload.get("food") or food),
            "message": None,
            "suggested_query": None,
            "original": original,
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

    daily = check_ai_daily_limit(
        db,
        user_id=user.id,
        tier=tier,
        feature="swaps",
        request_types=["swaps"],
    )
    if not daily.allowed:
        detail = daily_limit_detail(daily, label="Food swaps")
        _http_error(
            status_code=429,
            code=detail.pop("code"),
            message=detail.pop("message"),
            **detail,
        )

    # Cache v11: swaps-only client payload (no assessment fields returned to mobile).
    cache_key_base = f"swaps:cache:v11:tier:{tier}:profile:{profile_hash}:force:{int(bool(payload.force_swaps))}:q:{food.lower()}"
    cache_key_ai = f"{cache_key_base}:ai3"  # ai3: original + glucose impact

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
            return _with_images(data, db=db, request=request, background_tasks=background_tasks)
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
        # Only real swap results count against the free allowance (not clarifications or cache hits).
        free_tier_service.record_use_if_free(db, user, free_tier_service.SWAPS)

        # Do not expose model/provider in the app response.
        response_payload = {
            "food": result.get("food"),
            "assessment": result.get("assessment"),
            "should_show_swaps": result.get("should_show_swaps"),
            "swaps": result.get("swaps"),
        }
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
        return _with_images(client_payload, db=db, request=request, background_tasks=background_tasks)
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
        _http_error(
            status_code=502,
            code="swaps_failed",
            message="Couldn't generate swaps right now. Please try again in a moment.",
            trace_id=trace_id,
        )
    except ValueError as e:
        msg = str(e or "")
        logger.warning("Swaps generation returned invalid output: %s", msg)
        if msg in {"food is required"}:
            _http_error(
                status_code=422,
                code="invalid_food_input",
                message="Enter a food or drink (e.g. 'ice cream', 'unripe plantain', 'rice').",
            )
        log_system_event(
            {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "level": "warn",
                "source": "swaps",
                "message": "Swaps AI output invalid",
                "details": f"trace={trace_id} user_id={user.id} food={food!r} err={msg[:160]}",
                "path": request.url.path,
                "method": request.method,
                "ip": request.client.host if request.client else None,
            }
        )
        _http_error(
            status_code=502,
            code="ai_output_invalid",
            message="Couldn't generate swaps right now. Please try again in a moment.",
            trace_id=trace_id,
        )
    except HTTPException:
        raise
    except Exception:
        _http_error(
            status_code=502,
            code="swaps_failed",
            message="Couldn't generate swaps right now. Please try again in a moment.",
        )
