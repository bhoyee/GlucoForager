from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from ..admin_dependencies import require_staff_permission
from ...core.config import settings
from ...core.security import create_access_token, generate_refresh_token, get_password_hash, hash_refresh_token, verify_password
from ...database import get_db
from ...models.admin_user import AdminUser
from ...models.staff_audit_log import StaffAuditLog
from ...models.staff_mfa_challenge import StaffMfaChallenge
from ...models.staff_password_reset import StaffPasswordResetToken
from ...models.staff_refresh_token import StaffRefreshToken
from ...models.staff_user import StaffUser
from ...services.email_service import send_staff_mfa_code, send_staff_password_reset_code


router = APIRouter(prefix="/admin/staff", tags=["admin-staff-security"])

RESET_CODE_LENGTH = 8
MFA_CODE_LENGTH = 6


def _now() -> datetime:
    return datetime.utcnow()


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64] or None
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()[:64] or None
    return request.client.host if request.client else None


def _hash_code(code: str) -> str:
    payload = f"{code}:{settings.secret_key}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _generate_numeric_code(length: int) -> str:
    return f"{secrets.randbelow(10 ** int(length)):0{int(length)}d}"


def _audit(
    request: Request,
    db: Session,
    *,
    actor_id: int | None,
    action: str,
    entity: str | None,
    entity_id: str | None,
    details: dict | None,
) -> None:
    db.add(
        StaffAuditLog(
            actor_id=int(actor_id) if actor_id is not None else None,
            action=str(action)[:80],
            entity=(str(entity)[:80] if entity else None),
            entity_id=(str(entity_id)[:120] if entity_id else None),
            details=details,
            ip=_client_ip(request),
            user_agent=request.headers.get("user-agent"),
            created_at=_now(),
        )
    )


def _issue_staff_refresh_token(db: Session, *, staff_user_id: int, request: Request) -> str:
    raw = generate_refresh_token()
    token = StaffRefreshToken(
        staff_user_id=int(staff_user_id),
        token_hash=hash_refresh_token(raw),
        created_at=_now(),
        expires_at=_now() + timedelta(days=int(settings.refresh_token_expire_days)),
        last_used_at=None,
        revoked_at=None,
        created_ip=_client_ip(request),
        created_user_agent=(request.headers.get("user-agent") or "")[:512] or None,
    )
    db.add(token)
    return raw


def _issue_staff_access_token(staff: StaffUser) -> str:
    return create_access_token({"sub": str(staff.id), "kind": "staff"})


class StaffLoginPayload(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=256)


class StaffLoginResponse(BaseModel):
    access_token: str | None = None
    refresh_token: str | None = None
    token_type: str = "bearer"
    mfa_required: bool = False
    challenge_id: int | None = None


@router.post("/login", response_model=StaffLoginResponse)
def staff_login(
    request: Request,
    payload: StaffLoginPayload,
    db: Session = Depends(get_db),
):
    email = str(payload.email).strip().lower()
    staff = db.query(StaffUser).filter(StaffUser.email == email).first()

    # Avoid account enumeration; always return 401 on invalid credentials.
    if not staff or not verify_password(payload.password, staff.hashed_password) or not staff.is_active or getattr(staff, "deleted_at", None) is not None:
        _audit(
            request,
            db,
            actor_id=(int(staff.id) if staff else None),
            action="staff.login.failed",
            entity="staff_users",
            entity_id=(str(staff.id) if staff else None),
            details={"email": email},
        )
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    staff.last_login_at = _now()

    if bool(getattr(staff, "mfa_enabled", False)):
        code = _generate_numeric_code(MFA_CODE_LENGTH)
        challenge = StaffMfaChallenge(
            staff_user_id=int(staff.id),
            code_hash=_hash_code(code),
            expires_at=_now() + timedelta(minutes=10),
            used_at=None,
            attempts=0,
            created_at=_now(),
            created_ip=_client_ip(request),
            created_user_agent=(request.headers.get("user-agent") or "")[:512] or None,
        )
        db.add(challenge)
        db.flush()
        _audit(
            request,
            db,
            actor_id=int(staff.id),
            action="staff.mfa.challenge_created",
            entity="staff_mfa_challenges",
            entity_id=str(challenge.id),
            details=None,
        )
        db.commit()
        try:
            send_staff_mfa_code(to_email=str(staff.email), code=code)
        except Exception:
            # Best-effort; do not leak internal details.
            pass
        return StaffLoginResponse(mfa_required=True, challenge_id=int(challenge.id))

    access = _issue_staff_access_token(staff)
    refresh = _issue_staff_refresh_token(db, staff_user_id=int(staff.id), request=request)
    _audit(
        request,
        db,
        actor_id=int(staff.id),
        action="staff.login.success",
        entity="staff_users",
        entity_id=str(staff.id),
        details=None,
    )
    db.commit()
    return StaffLoginResponse(access_token=access, refresh_token=refresh)


class StaffMfaVerifyPayload(BaseModel):
    challenge_id: int
    code: str = Field(..., min_length=4, max_length=12)


@router.post("/mfa/verify", response_model=StaffLoginResponse)
def verify_mfa(
    request: Request,
    payload: StaffMfaVerifyPayload,
    db: Session = Depends(get_db),
):
    challenge = db.query(StaffMfaChallenge).filter(StaffMfaChallenge.id == int(payload.challenge_id)).first()
    if not challenge:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid code")
    if challenge.used_at is not None or challenge.expires_at < _now():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid code")
    if int(challenge.attempts or 0) >= 5:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many attempts")

    staff = db.query(StaffUser).filter(StaffUser.id == int(challenge.staff_user_id)).first()
    if not staff or not staff.is_active or getattr(staff, "deleted_at", None) is not None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid code")

    challenge.attempts = int(challenge.attempts or 0) + 1
    if _hash_code(payload.code.strip()) != challenge.code_hash:
        _audit(
            request,
            db,
            actor_id=int(staff.id),
            action="staff.mfa.failed",
            entity="staff_mfa_challenges",
            entity_id=str(challenge.id),
            details={"attempts": int(challenge.attempts)},
        )
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid code")

    challenge.used_at = _now()
    staff.last_login_at = _now()
    access = _issue_staff_access_token(staff)
    refresh = _issue_staff_refresh_token(db, staff_user_id=int(staff.id), request=request)
    _audit(
        request,
        db,
        actor_id=int(staff.id),
        action="staff.mfa.success",
        entity="staff_mfa_challenges",
        entity_id=str(challenge.id),
        details=None,
    )
    db.commit()
    return StaffLoginResponse(access_token=access, refresh_token=refresh)


class RefreshPayload(BaseModel):
    refresh_token: str


@router.post("/refresh", response_model=StaffLoginResponse)
def refresh_staff_token(payload: RefreshPayload, request: Request, db: Session = Depends(get_db)):
    token_hash = hash_refresh_token(payload.refresh_token.strip())
    token = (
        db.query(StaffRefreshToken)
        .filter(
            StaffRefreshToken.token_hash == token_hash,
            StaffRefreshToken.revoked_at.is_(None),
            StaffRefreshToken.expires_at >= _now(),
        )
        .first()
    )
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    staff = db.query(StaffUser).filter(StaffUser.id == int(token.staff_user_id)).first()
    if not staff or not staff.is_active or getattr(staff, "deleted_at", None) is not None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    token.last_used_at = _now()
    access = _issue_staff_access_token(staff)
    _audit(
        request,
        db,
        actor_id=int(staff.id),
        action="staff.session.refresh",
        entity="staff_refresh_tokens",
        entity_id=str(token.id),
        details=None,
    )
    db.commit()
    return StaffLoginResponse(access_token=access)


@router.post("/logout", response_model=dict)
def logout_staff(payload: RefreshPayload, request: Request, db: Session = Depends(get_db)):
    token_hash = hash_refresh_token(payload.refresh_token.strip())
    token = db.query(StaffRefreshToken).filter(StaffRefreshToken.token_hash == token_hash).first()
    if not token:
        return {"ok": True}
    token.revoked_at = _now()
    _audit(
        request,
        db,
        actor_id=int(token.staff_user_id),
        action="staff.session.logout",
        entity="staff_refresh_tokens",
        entity_id=str(token.id),
        details=None,
    )
    db.commit()
    return {"ok": True}


class PasswordResetRequestPayload(BaseModel):
    email: EmailStr


@router.post("/password-reset/request", response_model=dict)
def request_password_reset(
    request: Request,
    payload: PasswordResetRequestPayload,
    db: Session = Depends(get_db),
):
    email = str(payload.email).strip().lower()
    staff = db.query(StaffUser).filter(StaffUser.email == email).first()
    if not staff or not staff.is_active or getattr(staff, "deleted_at", None) is not None:
        # Don't reveal existence.
        return {"ok": True}

    code = _generate_numeric_code(RESET_CODE_LENGTH)
    token = StaffPasswordResetToken(
        staff_user_id=int(staff.id),
        code_hash=_hash_code(code),
        expires_at=_now() + timedelta(minutes=int(settings.password_reset_code_ttl_minutes)),
        used_at=None,
        attempts=0,
        created_at=_now(),
        created_ip=_client_ip(request),
        created_user_agent=(request.headers.get("user-agent") or "")[:512] or None,
    )
    db.add(token)
    db.flush()
    _audit(
        request,
        db,
        actor_id=int(staff.id),
        action="staff.password_reset.requested",
        entity="staff_password_reset_tokens",
        entity_id=str(token.id),
        details=None,
    )
    db.commit()
    try:
        send_staff_password_reset_code(to_email=str(staff.email), code=code)
    except Exception:
        pass
    return {"ok": True}


class PasswordResetConfirmPayload(BaseModel):
    email: EmailStr
    code: str = Field(..., min_length=4, max_length=16)
    new_password: str = Field(..., min_length=8, max_length=256)


@router.post("/password-reset/confirm", response_model=dict)
def confirm_password_reset(
    request: Request,
    payload: PasswordResetConfirmPayload,
    db: Session = Depends(get_db),
):
    email = str(payload.email).strip().lower()
    staff = db.query(StaffUser).filter(StaffUser.email == email).first()
    if not staff or not staff.is_active or getattr(staff, "deleted_at", None) is not None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid code")

    code_hash = _hash_code(payload.code.strip())
    token = (
        db.query(StaffPasswordResetToken)
        .filter(
            StaffPasswordResetToken.staff_user_id == int(staff.id),
            StaffPasswordResetToken.code_hash == code_hash,
            StaffPasswordResetToken.used_at.is_(None),
            StaffPasswordResetToken.expires_at >= _now(),
        )
        .order_by(StaffPasswordResetToken.created_at.desc())
        .first()
    )
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid code")
    if int(token.attempts or 0) >= int(settings.password_reset_code_max_attempts):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many attempts")

    token.attempts = int(token.attempts or 0) + 1

    staff.hashed_password = get_password_hash(payload.new_password)
    staff.updated_at = _now()
    token.used_at = _now()

    # Keep legacy AdminUser in sync.
    admin = db.query(AdminUser).filter(AdminUser.email == email).first()
    if admin:
        admin.hashed_password = staff.hashed_password

    _audit(
        request,
        db,
        actor_id=int(staff.id),
        action="staff.password_reset.confirmed",
        entity="staff_users",
        entity_id=str(staff.id),
        details=None,
    )
    db.commit()
    return {"ok": True}


class StaffMfaUpdatePayload(BaseModel):
    enabled: bool = True


@router.post("/users/{user_id}/mfa", response_model=dict)
def set_staff_mfa(
    request: Request,
    user_id: int,
    payload: StaffMfaUpdatePayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("staff.manage")),
):
    user = db.query(StaffUser).filter(StaffUser.id == int(user_id)).first()
    if not user or getattr(user, "deleted_at", None) is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff user not found")

    user.mfa_enabled = bool(payload.enabled)
    user.mfa_method = "email" if bool(payload.enabled) else None
    user.updated_at = _now()

    _audit(
        request,
        db,
        actor_id=int(current_staff.id),
        action="staff.mfa.updated",
        entity="staff_users",
        entity_id=str(user.id),
        details={"mfa_enabled": bool(user.mfa_enabled), "mfa_method": user.mfa_method},
    )
    db.commit()
    return {"ok": True, "mfa_enabled": bool(user.mfa_enabled), "mfa_method": user.mfa_method}
