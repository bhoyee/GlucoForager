from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from ..admin_dependencies import get_current_admin
from ...database import get_db
from ...models.admin_user import AdminUser
from ...services.email_service import send_admin_signup_alert
from ...services.settings_service import (
    SignupNotificationSettings,
    get_signup_notification_settings,
    update_signup_notification_settings,
)

router = APIRouter(prefix="/admin/settings", tags=["admin-settings"])


class SignupNotificationsPayload(BaseModel):
    enabled: bool = False
    recipients: list[EmailStr] = Field(default_factory=list)


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

