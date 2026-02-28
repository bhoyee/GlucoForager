from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from ..models.app_setting import AppSetting

SIGNUP_NOTIFY_ENABLED_KEY = "signup_notify_enabled"
SIGNUP_NOTIFY_RECIPIENTS_KEY = "signup_notify_recipients"


@dataclass(frozen=True)
class SignupNotificationSettings:
    enabled: bool
    recipients: list[str]


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

