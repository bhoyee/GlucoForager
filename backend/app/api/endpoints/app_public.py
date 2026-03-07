from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ...database import get_db
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
