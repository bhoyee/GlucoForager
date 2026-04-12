from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from ..models.app_setting import AppSetting

SIGNUP_NOTIFY_ENABLED_KEY = "signup_notify_enabled"
SIGNUP_NOTIFY_RECIPIENTS_KEY = "signup_notify_recipients"
APP_UPDATES_ENABLED_KEY = "app_updates_enabled"
ANDROID_LATEST_VERSION_KEY = "android_latest_version"
IOS_LATEST_VERSION_KEY = "ios_latest_version"
ANDROID_STORE_URL_KEY = "android_store_url"
IOS_STORE_URL_KEY = "ios_store_url"
RECIPE_IMAGES_ENABLED_KEY = "recipe_images_enabled"
RECIPE_IMAGES_SIZE_KEY = "recipe_images_size"
RECIPE_IMAGES_FREE_DAILY_LIMIT_KEY = "recipe_images_free_daily_limit"
RECIPE_IMAGES_PREMIUM_DAILY_LIMIT_KEY = "recipe_images_premium_daily_limit"
RECIPE_IMAGES_MAX_PER_RECIPE_KEY = "recipe_images_max_per_recipe"
RECIPE_IMAGES_COST_USD_KEY = "recipe_images_cost_usd"
FREE_SCAN_LIMIT_COUNT_KEY = "scan_limits_free_count"
FREE_SCAN_LIMIT_WINDOW_DAYS_KEY = "scan_limits_free_window_days"


@dataclass(frozen=True)
class SignupNotificationSettings:
    enabled: bool
    recipients: list[str]


@dataclass(frozen=True)
class AppUpdateSettings:
    enabled: bool
    android_latest_version: str | None
    ios_latest_version: str | None
    android_store_url: str | None
    ios_store_url: str | None


@dataclass(frozen=True)
class RecipeImageSettings:
    enabled: bool
    size: int
    free_daily_limit: int
    premium_daily_limit: int
    max_per_recipe: int
    cost_usd: float


@dataclass(frozen=True)
class ScanLimitSettings:
    free_count: int
    free_window_days: int


def _get_value(db: Session, key: str) -> str | None:
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    return row.value if row else None


def _set_value(db: Session, key: str, value: str | None) -> None:
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    if not row:
        row = AppSetting(key=key, value=value)
        db.add(row)
    else:
        row.value = value
    db.commit()


def get_signup_notification_settings(db: Session) -> SignupNotificationSettings:
    enabled_raw = (_get_value(db, SIGNUP_NOTIFY_ENABLED_KEY) or "").strip()
    enabled = enabled_raw == "1"

    recipients_raw = (_get_value(db, SIGNUP_NOTIFY_RECIPIENTS_KEY) or "").strip()
    recipients = [item.strip() for item in recipients_raw.split(",") if item.strip()]
    return SignupNotificationSettings(enabled=enabled, recipients=recipients)


def update_signup_notification_settings(
    db: Session, *, enabled: bool, recipients: list[str]
) -> SignupNotificationSettings:
    _set_value(db, SIGNUP_NOTIFY_ENABLED_KEY, "1" if enabled else "0")
    normalized = [item.strip() for item in (recipients or []) if item and item.strip()]
    _set_value(db, SIGNUP_NOTIFY_RECIPIENTS_KEY, ",".join(normalized) if normalized else "")
    return get_signup_notification_settings(db)


def get_app_update_settings(db: Session) -> AppUpdateSettings:
    enabled_raw = (_get_value(db, APP_UPDATES_ENABLED_KEY) or "").strip()
    enabled = enabled_raw == "1"
    android_latest = (_get_value(db, ANDROID_LATEST_VERSION_KEY) or "").strip() or None
    ios_latest = (_get_value(db, IOS_LATEST_VERSION_KEY) or "").strip() or None
    android_url = (_get_value(db, ANDROID_STORE_URL_KEY) or "").strip() or None
    ios_url = (_get_value(db, IOS_STORE_URL_KEY) or "").strip() or None
    return AppUpdateSettings(
        enabled=enabled,
        android_latest_version=android_latest,
        ios_latest_version=ios_latest,
        android_store_url=android_url,
        ios_store_url=ios_url,
    )


def update_app_update_settings(
    db: Session,
    *,
    enabled: bool,
    android_latest_version: str | None,
    ios_latest_version: str | None,
    android_store_url: str | None,
    ios_store_url: str | None,
) -> AppUpdateSettings:
    _set_value(db, APP_UPDATES_ENABLED_KEY, "1" if enabled else "0")
    _set_value(db, ANDROID_LATEST_VERSION_KEY, (android_latest_version or "").strip() or None)
    _set_value(db, IOS_LATEST_VERSION_KEY, (ios_latest_version or "").strip() or None)
    _set_value(db, ANDROID_STORE_URL_KEY, (android_store_url or "").strip() or None)
    _set_value(db, IOS_STORE_URL_KEY, (ios_store_url or "").strip() or None)
    return get_app_update_settings(db)


def _to_int(value: str | None, default: int) -> int:
    raw = (value or "").strip()
    if raw == "":
        return default
    try:
        return int(raw)
    except Exception:  # noqa: BLE001
        return default


def _normalize_size(value: int) -> int:
    if value in (512, 768, 1024):
        return value
    return 512


def _normalize_non_negative(value: int, default: int) -> int:
    if value < 0:
        return default
    return value


def get_recipe_image_settings(db: Session) -> RecipeImageSettings:
    enabled_raw = (_get_value(db, RECIPE_IMAGES_ENABLED_KEY) or "").strip()
    # Default to enabled when unset. This matches the expected UX of showing real
    # generated images out-of-the-box when an image provider is configured.
    # Admins can explicitly disable by setting "0".
    enabled = enabled_raw != "0"

    size = _normalize_size(_to_int(_get_value(db, RECIPE_IMAGES_SIZE_KEY), 512))

    # Default to generating thumbnails for all 3 recipes in a typical response.
    free_limit = _to_int(_get_value(db, RECIPE_IMAGES_FREE_DAILY_LIMIT_KEY), 3)
    premium_limit = _to_int(_get_value(db, RECIPE_IMAGES_PREMIUM_DAILY_LIMIT_KEY), 10)
    max_per_recipe = _to_int(_get_value(db, RECIPE_IMAGES_MAX_PER_RECIPE_KEY), 1)
    cost_raw = (_get_value(db, RECIPE_IMAGES_COST_USD_KEY) or "").strip()
    try:
        cost_usd = float(cost_raw) if cost_raw else 0.04
    except Exception:  # noqa: BLE001
        cost_usd = 0.04

    return RecipeImageSettings(
        enabled=enabled,
        size=size,
        free_daily_limit=_normalize_non_negative(free_limit, 1),
        premium_daily_limit=premium_limit if premium_limit == -1 else _normalize_non_negative(premium_limit, 10),
        max_per_recipe=_normalize_non_negative(max_per_recipe, 1),
        cost_usd=max(0.0, float(cost_usd)),
    )


def update_recipe_image_settings(
    db: Session,
    *,
    enabled: bool,
    size: int,
    free_daily_limit: int,
    premium_daily_limit: int,
    max_per_recipe: int,
    cost_usd: float | None = None,
) -> RecipeImageSettings:
    _set_value(db, RECIPE_IMAGES_ENABLED_KEY, "1" if enabled else "0")
    _set_value(db, RECIPE_IMAGES_SIZE_KEY, str(_normalize_size(size)))
    _set_value(db, RECIPE_IMAGES_FREE_DAILY_LIMIT_KEY, str(int(free_daily_limit)))
    _set_value(db, RECIPE_IMAGES_PREMIUM_DAILY_LIMIT_KEY, str(int(premium_daily_limit)))
    _set_value(db, RECIPE_IMAGES_MAX_PER_RECIPE_KEY, str(int(max_per_recipe)))
    if cost_usd is not None:
        _set_value(db, RECIPE_IMAGES_COST_USD_KEY, str(float(max(0.0, cost_usd))))
    return get_recipe_image_settings(db)


def get_scan_limit_settings(db: Session) -> ScanLimitSettings:
    # Defaults match existing behavior (free=3/day).
    free_count = _to_int(_get_value(db, FREE_SCAN_LIMIT_COUNT_KEY), 3)
    free_window_days = _to_int(_get_value(db, FREE_SCAN_LIMIT_WINDOW_DAYS_KEY), 1)
    free_count = _normalize_non_negative(free_count, 3)
    if free_window_days <= 0:
        free_window_days = 1
    # Safety cap to prevent accidental huge ranges.
    free_window_days = min(int(free_window_days), 30)
    return ScanLimitSettings(free_count=int(free_count), free_window_days=int(free_window_days))


def update_scan_limit_settings(
    db: Session,
    *,
    free_count: int,
    free_window_days: int,
) -> ScanLimitSettings:
    free_count_norm = _normalize_non_negative(int(free_count), 3)
    days = int(free_window_days)
    if days <= 0:
        days = 1
    days = min(days, 30)
    _set_value(db, FREE_SCAN_LIMIT_COUNT_KEY, str(int(free_count_norm)))
    _set_value(db, FREE_SCAN_LIMIT_WINDOW_DAYS_KEY, str(int(days)))
    return get_scan_limit_settings(db)
