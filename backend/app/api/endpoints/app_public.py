import json

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from ...database import get_db
from ...models.app_setting import AppSetting
from ...models.user import User
from ...services.tip_catalog_service import get_tip_for_user, personalize_tip_for_user
from ...core.security import decode_access_token
from ...services.settings_service import (
    AppUpdateSettings,
    RecipeImageSettings,
    get_app_update_settings,
    get_recipe_image_settings,
)

router = APIRouter(prefix="/app", tags=["app"])


DEFAULT_IOS_STORE_URL = "https://apps.apple.com/us/app/glucoforager/id6758808427"
DEFAULT_ANDROID_STORE_URL = "https://play.google.com/store/apps/details?id=com.glucoforager.app"


@router.get("/update")
def get_app_update_config(db: Session = Depends(get_db)):
    settings: AppUpdateSettings = get_app_update_settings(db)
    recipe_images: RecipeImageSettings = get_recipe_image_settings(db)
    return {
        "enabled": settings.enabled,
        "ios": {
            "latest_version": settings.ios_latest_version,
            "store_url": settings.ios_store_url or DEFAULT_IOS_STORE_URL,
        },
        "android": {
            "latest_version": settings.android_latest_version,
            "store_url": settings.android_store_url or DEFAULT_ANDROID_STORE_URL,
        },
        "recipe_images": {
            "enabled": recipe_images.enabled,
            "size": recipe_images.size,
            "free_daily_limit": recipe_images.free_daily_limit,
            "premium_daily_limit": recipe_images.premium_daily_limit,
            "max_per_recipe": recipe_images.max_per_recipe,
        },
    }


@router.get("/tips/config")
def get_tips_config(db: Session = Depends(get_db)):
    """Public config for the mobile app (e.g., to disable specific tips without shipping a new build)."""
    key = "tips.settings.v1"
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
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
    cleaned: list[str] = []
    for item in blocked:
        if isinstance(item, str):
            s = item.strip()
            if s:
                cleaned.append(s)
    return {"blocked_tip_ids": cleaned}


@router.get("/tips/today")
def get_tip_today(request: Request, db: Session = Depends(get_db)):
    auth_header = request.headers.get("authorization") or ""
    user: User | None = None
    if auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[-1].strip()
        if token:
            try:
                payload = decode_access_token(token)
                user_id = payload.get("sub")
                if user_id:
                    user = db.query(User).filter(User.id == int(user_id)).first()
            except Exception:
                user = None

    tip = get_tip_for_user(db, user)
    if not tip:
        return {"tip": None}
    if user:
        tip = personalize_tip_for_user(tip, user)
    return {"tip": tip}
