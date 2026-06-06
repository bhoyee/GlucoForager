from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from openai import OpenAI, OpenAIError
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ...api.dependencies import get_current_user, require_ai_feature_access
from ...core.config import settings
from ...database import get_db
from ...models.favorite import Favorite
from ...models.meal_plan import MealPlan
from ...models.recipe_history import RecipeHistory
from ...models.user import User
from ...services.cost_tracker import record_ai_request
from ...services.rate_limit_service import check_ai_daily_limit, check_ai_rate_limit, daily_limit_detail
from ...services.subscription_service import get_effective_subscription_tier

router = APIRouter(prefix="/agent", tags=["agent"])


class AgentMessage(BaseModel):
    role: str = Field(..., max_length=16)
    content: str = Field(..., max_length=2400)


class AgentChatPayload(BaseModel):
    message: str = Field(..., min_length=1, max_length=1200)
    history: list[AgentMessage] = Field(default_factory=list, max_length=8)
    use_profile_context: bool = True


def _compact(value: Any, max_len: int = 500) -> str:
    if value is None:
        return ""
    if isinstance(value, (list, dict)):
        text = json.dumps(value, ensure_ascii=True)
    else:
        text = str(value)
    text = " ".join(text.split())
    return text[:max_len]


def _titles_from_recipes(recipes: list[Any], limit: int = 5) -> list[str]:
    titles: list[str] = []
    for item in recipes or []:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or item.get("name") or "").strip()
        if title:
            titles.append(title)
        if len(titles) >= limit:
            break
    return titles


def _build_user_context(db: Session, user: User, *, include_profile: bool) -> str:
    lines: list[str] = []
    if include_profile:
        lines.extend(
            [
                f"Blood sugar profile: {_compact(user.blood_sugar_profile) or 'not set'}",
                f"Country: {_compact(user.country or user.country_code) or 'not set'}",
                f"Dietary pattern: {_compact(user.dietary_pattern) or 'not set'}",
                f"Meal goals: {_compact(user.meal_goals) or 'not set'}",
                f"Allergens: {_compact(user.allergens) or 'not set'}",
                f"Food exclusions: {_compact(user.food_exclusions) or 'not set'}",
                f"Preferred cuisines: {_compact(user.preferred_cuisines) or 'not set'}",
                f"Cook time preference: {_compact(user.cook_time_preference) or 'not set'}",
            ]
        )

    latest_history = (
        db.query(RecipeHistory)
        .filter(RecipeHistory.user_id == user.id)
        .order_by(RecipeHistory.created_at.desc(), RecipeHistory.id.desc())
        .first()
    )
    if latest_history and isinstance(latest_history.recipes, list):
        titles = _titles_from_recipes(latest_history.recipes, limit=4)
        if titles:
            lines.append(f"Recent generated recipes: {', '.join(titles)}")

    favorites = (
        db.query(Favorite)
        .filter(Favorite.user_id == user.id)
        .order_by(Favorite.created_at.desc(), Favorite.id.desc())
        .limit(5)
        .all()
    )
    favorite_titles = [str(f.title or "").strip() for f in favorites if str(f.title or "").strip()]
    if favorite_titles:
        lines.append(f"Saved recipes: {', '.join(favorite_titles)}")

    today = datetime.utcnow().date()
    plan = (
        db.query(MealPlan)
        .filter(MealPlan.user_id == user.id, MealPlan.plan_date == today)
        .order_by(MealPlan.id.desc())
        .first()
    )
    if plan and isinstance(plan.recipes, dict):
        meals = plan.recipes.get("meals") if isinstance(plan.recipes.get("meals"), list) else []
        titles = _titles_from_recipes(meals, limit=4)
        if titles:
            lines.append(f"Today's meal plan: {', '.join(titles)}")

    return "\n".join(lines[:12])


def _suggest_actions(message: str, answer: str) -> list[dict]:
    text = f"{message} {answer}".lower()
    actions: list[dict] = []
    if any(word in text for word in ("recipe", "cook", "dinner", "breakfast", "lunch", "snack")):
        actions.append({"label": "Generate recipes", "target": "ManualInput", "kind": "navigate"})
    if any(word in text for word in ("swap", "instead", "replace", "alternative")):
        actions.append({"label": "Find swaps", "target": "CarbSwaps", "kind": "navigate"})
    if any(word in text for word in ("plan", "meal plan", "tomorrow", "today")):
        actions.append({"label": "Open meal plan", "target": "DailyPlan", "kind": "tab"})
    actions.append({"label": "Ask another question", "target": "composer", "kind": "focus"})
    return actions[:3]


def _sse_event(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=True)}\n\n"


def _prepare_agent_chat(payload: AgentChatPayload, db: Session, current_user: User) -> dict:
    require_ai_feature_access(current_user, db)
    tier = get_effective_subscription_tier(db, current_user) or "free"
    rl = check_ai_rate_limit(user_id=current_user.id, tier=tier, kind="text", db=db)
    if not rl.allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "rate_limited",
                "message": "Too many questions in a short time. Please wait a moment and try again.",
                "retry_after_seconds": rl.retry_after_seconds,
                "limit_per_minute": rl.limit_per_minute,
            },
            headers={"Retry-After": str(rl.retry_after_seconds)},
        )

    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="AI agent is not configured yet.")

    message_text = payload.message.strip()
    last_user_messages = [
        item.content.strip().lower()
        for item in payload.history[-3:]
        if item.role == "user" and item.content and item.content.strip()
    ]
    if last_user_messages and last_user_messages[-1] == message_text.lower():
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "duplicate_message",
                "message": "You already asked that. Add more detail or ask a new question.",
            },
        )

    daily = check_ai_daily_limit(
        db,
        user_id=current_user.id,
        tier=tier,
        feature="agent",
        request_types=["agent"],
    )
    if not daily.allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=daily_limit_detail(daily, label="GlucoGuide"),
        )

    user_context = _build_user_context(db, current_user, include_profile=bool(payload.use_profile_context))
    system_prompt = f"""
You are GlucoGuide AI, GlucoForager's diabetes-aware food and lifestyle support agent.

Scope:
- Help with diabetes-aware food choices, meal planning, recipes, ingredient swaps, grocery decisions, habits, and general diabetes education.
- Use the user's GlucoForager context when helpful.
- Be practical, warm, concise, and action-oriented.

Safety boundaries:
- Do not diagnose disease, prescribe treatment, adjust insulin/medication, or tell users to stop/start medication.
- For medication, insulin dosing, severe symptoms, very high/low glucose, pregnancy, children, kidney disease, eating disorders, or emergencies, tell the user to contact a clinician or urgent care.
- Never claim to replace a healthcare professional.
- If the user asks something unrelated to diabetes, food, lifestyle, or GlucoForager, briefly redirect to what you can help with.

Response style:
- Keep answers under 220 words unless the user asks for detail.
- Format for a mobile chat UI: short title-style section labels, short paragraphs, and simple bullets.
- Do not use markdown tables, code blocks, raw JSON, HTML, or decorative formatting.
- Give next-step suggestions when useful.

User context:
{user_context or "No user context available."}
""".strip()

    messages: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]
    for item in payload.history[-6:]:
        role = "assistant" if item.role == "assistant" else "user"
        content = item.content.strip()
        if content:
            messages.append({"role": role, "content": content[:1600]})
    messages.append({"role": "user", "content": message_text})

    model = settings.openai_model or "gpt-4o-mini"
    params = {
        "model": model,
        "messages": messages,
        "temperature": 0.35,
        "timeout": 35,
    }
    if str(model).startswith("gpt-5"):
        params["max_completion_tokens"] = 520
    else:
        params["max_tokens"] = 520
    return {
        "tier": tier,
        "message_text": message_text,
        "model": model,
        "params": params,
    }


@router.post("/chat")
def chat_with_agent(
    payload: AgentChatPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    prepared = _prepare_agent_chat(payload, db, current_user)
    client = OpenAI(api_key=settings.openai_api_key, max_retries=0)
    try:
        response = client.chat.completions.create(**prepared["params"])
    except OpenAIError as exc:
        raise HTTPException(status_code=503, detail="GlucoGuide is unavailable right now. Please try again.") from exc

    answer = response.choices[0].message.content or ""
    usage = getattr(response, "usage", None)
    tokens_used = int(getattr(usage, "total_tokens", 0) or 0)
    try:
        record_ai_request(
            db,
            current_user.id,
            prepared["tier"],
            "agent",
            model_used=prepared["model"],
            tokens_used=tokens_used,
            cost_estimate=0,
        )
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass

    return {
        "answer": answer.strip(),
        "actions": _suggest_actions(prepared["message_text"], answer),
        "safety": {
            "medical_disclaimer": "GlucoGuide supports food and lifestyle decisions. It does not replace medical care.",
        },
        "usage": {"model": prepared["model"], "tokens": tokens_used},
    }


@router.post("/chat/stream")
def stream_chat_with_agent(
    payload: AgentChatPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    prepared = _prepare_agent_chat(payload, db, current_user)

    def generate():
        client = OpenAI(api_key=settings.openai_api_key, max_retries=0)
        answer_parts: list[str] = []
        tokens_used = 0
        try:
            params = {**prepared["params"], "stream": True}
            stream = client.chat.completions.create(**params)
            yield _sse_event("start", {"model": prepared["model"]})
            for chunk in stream:
                choices = getattr(chunk, "choices", None) or []
                if not choices:
                    usage = getattr(chunk, "usage", None)
                    if usage:
                        tokens_used = int(getattr(usage, "total_tokens", 0) or 0)
                    continue
                delta = getattr(choices[0].delta, "content", None) or ""
                if not delta:
                    continue
                answer_parts.append(delta)
                yield _sse_event("chunk", {"delta": delta})
        except OpenAIError:
            yield _sse_event(
                "error",
                {"message": "GlucoGuide is unavailable right now. Please try again."},
            )
            return
        except Exception:
            yield _sse_event(
                "error",
                {"message": "GlucoGuide stopped unexpectedly. Please try again."},
            )
            return

        answer = "".join(answer_parts).strip()
        try:
            record_ai_request(
                db,
                current_user.id,
                prepared["tier"],
                "agent",
                model_used=prepared["model"],
                tokens_used=tokens_used,
                cost_estimate=0,
            )
        except Exception:
            try:
                db.rollback()
            except Exception:
                pass

        yield _sse_event(
            "done",
            {
                "actions": _suggest_actions(prepared["message_text"], answer),
                "safety": {
                    "medical_disclaimer": "GlucoGuide supports food and lifestyle decisions. It does not replace medical care.",
                },
                "usage": {"model": prepared["model"], "tokens": tokens_used},
            },
        )

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
