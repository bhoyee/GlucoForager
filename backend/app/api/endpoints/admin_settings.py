from fastapi import APIRouter, Depends, HTTPException, status
import json

from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from ..admin_dependencies import get_current_admin
from ...database import get_db
from ...models.admin_user import AdminUser
from ...services.email_service import send_admin_signup_alert
from ...services.settings_service import (
    AppUpdateSettings,
    RecipeImageSettings,
    ScanLimitSettings,
    SignupNotificationSettings,
    AIGuardrailSettings,
    get_ai_guardrail_settings,
    get_app_update_settings,
    get_recipe_image_settings,
    get_scan_limit_settings,
    get_signup_notification_settings,
    update_ai_guardrail_settings,
    update_app_update_settings,
    update_recipe_image_settings,
    update_scan_limit_settings,
    update_signup_notification_settings,
)
from ...models.app_setting import AppSetting

router = APIRouter(prefix="/admin/settings", tags=["admin-settings"])


class SignupNotificationsPayload(BaseModel):
    enabled: bool = False
    recipients: list[EmailStr] = Field(default_factory=list)


class AppUpdatesPayload(BaseModel):
    enabled: bool = False
    android_latest_version: str | None = Field(None, max_length=32)
    ios_latest_version: str | None = Field(None, max_length=32)
    android_store_url: str | None = Field(None, max_length=500)
    ios_store_url: str | None = Field(None, max_length=500)


class RecipeImagesPayload(BaseModel):
    enabled: bool = False
    size: int = Field(512, ge=256, le=2048)
    free_daily_limit: int = Field(1, ge=0, le=500)
    premium_daily_limit: int = Field(10, ge=-1, le=5000)
    max_per_recipe: int = Field(1, ge=1, le=50)
    cost_usd: float | None = Field(None, ge=0, le=10)


class ScanLimitsPayload(BaseModel):
    free_count: int = Field(3, ge=0, le=100)
    free_window_days: int = Field(1, ge=1, le=30)


class AIGuardrailsPayload(BaseModel):
    free_agent_daily: int = Field(10, ge=0, le=10000)
    premium_agent_daily: int = Field(100, ge=0, le=10000)
    free_recipes_daily: int = Field(5, ge=0, le=10000)
    premium_recipes_daily: int = Field(50, ge=0, le=10000)
    free_swaps_daily: int = Field(10, ge=0, le=10000)
    premium_swaps_daily: int = Field(100, ge=0, le=10000)
    premium_daily_plan_daily: int = Field(5, ge=0, le=10000)
    free_daily_plan_weekly: int = Field(1, ge=0, le=10000)
    free_text_per_minute: int = Field(3, ge=0, le=1000)
    premium_text_per_minute: int = Field(10, ge=0, le=1000)
    free_vision_per_minute: int = Field(2, ge=0, le=1000)
    premium_vision_per_minute: int = Field(6, ge=0, le=1000)


class TipSettingsPayload(BaseModel):
    blocked_tip_ids: list[str] = Field(default_factory=list, max_length=500)


TIP_SETTINGS_KEY = "tips.settings.v1"

def _read_tip_settings(db: Session) -> dict:
    row = db.query(AppSetting).filter(AppSetting.key == TIP_SETTINGS_KEY).first()
    if not row or not row.value:
        return {"blocked_tip_ids": []}
    try:
        data = json.loads(row.value)
    except Exception:
        return {"blocked_tip_ids": []}
    if not isinstance(data, dict):
        return {"blocked_tip_ids": []}
    blocked = data.get("blocked_tip_ids")
    if not isinstance(blocked, list):
        blocked = []
    blocked_clean = []
    for item in blocked:
        if isinstance(item, str):
            s = item.strip()
            if s:
                blocked_clean.append(s)
    return {"blocked_tip_ids": blocked_clean}


def _write_tip_settings(db: Session, blocked_tip_ids: list[str]) -> dict:
    payload = {"blocked_tip_ids": blocked_tip_ids}
    row = db.query(AppSetting).filter(AppSetting.key == TIP_SETTINGS_KEY).first()
    if not row:
        row = AppSetting(key=TIP_SETTINGS_KEY, value=json.dumps(payload))
        db.add(row)
    else:
        row.value = json.dumps(payload)
    db.commit()
    return payload


@router.get("/tips")
def get_tip_settings(
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    return _read_tip_settings(db)


@router.put("/tips")
def put_tip_settings(
    payload: TipSettingsPayload,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    blocked = []
    for value in payload.blocked_tip_ids:
        if isinstance(value, str):
            s = value.strip()
            if s:
                blocked.append(s)
    blocked = blocked[:500]
    return _write_tip_settings(db, blocked)


@router.get("/signup-notifications")
def get_signup_notifications(
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    settings: SignupNotificationSettings = get_signup_notification_settings(db)
    return {"enabled": settings.enabled, "recipients": settings.recipients}


@router.put("/signup-notifications")
def put_signup_notifications(
    payload: SignupNotificationsPayload,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    settings = update_signup_notification_settings(
        db,
        enabled=payload.enabled,
        recipients=[str(value) for value in payload.recipients],
    )
    return {"enabled": settings.enabled, "recipients": settings.recipients}


@router.post("/signup-notifications/test")
def send_signup_notifications_test(
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    settings = get_signup_notification_settings(db)
    if not settings.enabled or not settings.recipients:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Signup notifications are disabled or have no recipients.",
        )

    for recipient in settings.recipients:
        send_admin_signup_alert(
            to_email=recipient,
            user_email="test.user@example.com",
            full_name="Test User",
            country="--",
            platform="android",
            app_version="0.0.0",
            build_number="0",
            os_version="0",
            device_model="Test device",
            ip_address="127.0.0.1",
        )
    return {"status": "sent", "recipients": settings.recipients}


@router.get("/app-updates")
def get_app_updates(
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    settings: AppUpdateSettings = get_app_update_settings(db)
    return {
        "enabled": settings.enabled,
        "android_latest_version": settings.android_latest_version,
        "ios_latest_version": settings.ios_latest_version,
        "android_store_url": settings.android_store_url,
        "ios_store_url": settings.ios_store_url,
    }


@router.put("/app-updates")
def put_app_updates(
    payload: AppUpdatesPayload,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    settings = update_app_update_settings(
        db,
        enabled=payload.enabled,
        android_latest_version=payload.android_latest_version,
        ios_latest_version=payload.ios_latest_version,
        android_store_url=payload.android_store_url,
        ios_store_url=payload.ios_store_url,
    )
    return {
        "enabled": settings.enabled,
        "android_latest_version": settings.android_latest_version,
        "ios_latest_version": settings.ios_latest_version,
        "android_store_url": settings.android_store_url,
        "ios_store_url": settings.ios_store_url,
    }


@router.get("/recipe-images")
def get_recipe_images(
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    settings: RecipeImageSettings = get_recipe_image_settings(db)
    return {
        "enabled": settings.enabled,
        "size": settings.size,
        "free_daily_limit": settings.free_daily_limit,
        "premium_daily_limit": settings.premium_daily_limit,
        "max_per_recipe": settings.max_per_recipe,
        "cost_usd": settings.cost_usd,
    }


@router.put("/recipe-images")
def put_recipe_images(
    payload: RecipeImagesPayload,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    settings: RecipeImageSettings = update_recipe_image_settings(
        db,
        enabled=payload.enabled,
        size=payload.size,
        free_daily_limit=payload.free_daily_limit,
        premium_daily_limit=payload.premium_daily_limit,
        max_per_recipe=payload.max_per_recipe,
        cost_usd=payload.cost_usd,
    )
    return {
        "enabled": settings.enabled,
        "size": settings.size,
        "free_daily_limit": settings.free_daily_limit,
        "premium_daily_limit": settings.premium_daily_limit,
        "max_per_recipe": settings.max_per_recipe,
        "cost_usd": settings.cost_usd,
    }


@router.get("/scan-limits")
def get_scan_limits(
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    settings: ScanLimitSettings = get_scan_limit_settings(db)
    return {
        "free_count": settings.free_count,
        "free_window_days": settings.free_window_days,
    }


@router.put("/scan-limits")
def put_scan_limits(
    payload: ScanLimitsPayload,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    settings: ScanLimitSettings = update_scan_limit_settings(
        db,
        free_count=payload.free_count,
        free_window_days=payload.free_window_days,
    )
    return {
        "free_count": settings.free_count,
        "free_window_days": settings.free_window_days,
    }


def _ai_guardrails_payload(settings: AIGuardrailSettings) -> dict:
    return {
        "free_agent_daily": settings.free_agent_daily,
        "premium_agent_daily": settings.premium_agent_daily,
        "free_recipes_daily": settings.free_recipes_daily,
        "premium_recipes_daily": settings.premium_recipes_daily,
        "free_swaps_daily": settings.free_swaps_daily,
        "premium_swaps_daily": settings.premium_swaps_daily,
        "premium_daily_plan_daily": settings.premium_daily_plan_daily,
        "free_daily_plan_weekly": settings.free_daily_plan_weekly,
        "free_text_per_minute": settings.free_text_per_minute,
        "premium_text_per_minute": settings.premium_text_per_minute,
        "free_vision_per_minute": settings.free_vision_per_minute,
        "premium_vision_per_minute": settings.premium_vision_per_minute,
    }


@router.get("/ai-guardrails")
def get_ai_guardrails(
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    return _ai_guardrails_payload(get_ai_guardrail_settings(db))


@router.put("/ai-guardrails")
def put_ai_guardrails(
    payload: AIGuardrailsPayload,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    settings = update_ai_guardrail_settings(
        db,
        free_agent_daily=payload.free_agent_daily,
        premium_agent_daily=payload.premium_agent_daily,
        free_recipes_daily=payload.free_recipes_daily,
        premium_recipes_daily=payload.premium_recipes_daily,
        free_swaps_daily=payload.free_swaps_daily,
        premium_swaps_daily=payload.premium_swaps_daily,
        premium_daily_plan_daily=payload.premium_daily_plan_daily,
        free_daily_plan_weekly=payload.free_daily_plan_weekly,
        free_text_per_minute=payload.free_text_per_minute,
        premium_text_per_minute=payload.premium_text_per_minute,
        free_vision_per_minute=payload.free_vision_per_minute,
        premium_vision_per_minute=payload.premium_vision_per_minute,
    )
    return _ai_guardrails_payload(settings)
