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
