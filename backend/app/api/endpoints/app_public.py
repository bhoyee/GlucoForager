from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ...database import get_db
from ...services.settings_service import AppUpdateSettings, get_app_update_settings

router = APIRouter(prefix="/app", tags=["app"])


DEFAULT_IOS_STORE_URL = "https://apps.apple.com/us/app/glucoforager/id6758808427"
DEFAULT_ANDROID_STORE_URL = "https://play.google.com/store/apps/details?id=com.glucoforager.app"


@router.get("/update")
def get_app_update_config(db: Session = Depends(get_db)):
    settings: AppUpdateSettings = get_app_update_settings(db)
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
    }

