import hashlib
import logging
import secrets
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr, Field, validator
from sqlalchemy.orm import Session

from ...core.config import settings
from ...core.security import create_access_token, get_password_hash, verify_password
from ...database import get_db
from ...models.password_reset import PasswordResetToken
from ...models.user import User
from ...services.email_service import send_password_reset_code, send_welcome_email
from ...services.login_throttler import LoginThrottler

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)
login_throttler = LoginThrottler()
RESET_CODE_LENGTH = 8


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    message: str | None = None
    public_id: str | None = None


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    full_name: str = Field(..., min_length=2, max_length=120)
    gender: str | None = Field(None, max_length=32)
    country: str | None = Field(None, max_length=120)

    @validator("full_name")
    def validate_full_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Full name is required")
        return cleaned

    @validator("gender")
    def validate_gender(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip().lower()
        allowed = {"male", "female", "other", "prefer_not_to_say"}
        if cleaned not in allowed:
            raise ValueError("Invalid gender")
        return cleaned

    @validator("country")
    def validate_country(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            return None
        return cleaned


class LoginPayload(BaseModel):
    email: EmailStr | None = None
    username: str | None = None
    password: str


class ForgotPasswordPayload(BaseModel):
    email: EmailStr


class ResetPasswordPayload(BaseModel):
    email: EmailStr
    code: str
    new_password: str


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _hash_reset_code(code: str) -> str:
    payload = f"{code}:{settings.secret_key}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _generate_reset_code() -> str:
    return f"{secrets.randbelow(10 ** RESET_CODE_LENGTH):0{RESET_CODE_LENGTH}d}"


@router.post("/signup", response_model=Token)
def signup(payload: UserCreate, db: Session = Depends(get_db)):
    try:
        existing = db.query(User).filter(User.email == payload.email).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User already exists")
        user = User(
            email=payload.email,
            hashed_password=get_password_hash(payload.password),
            full_name=payload.full_name,
            gender=payload.gender,
            country=payload.country,
            public_id=str(uuid.uuid4()),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        token = create_access_token({"sub": str(user.id)})
        try:
            send_welcome_email(payload.email, payload.full_name)
        except Exception:
            logger.exception("Welcome email failed for email=%s", payload.email)
        return Token(access_token=token, message="Signup successful", public_id=user.public_id)
    except HTTPException:
        # Bubble up expected API errors unchanged.
        raise
    except Exception as exc:
        logger.exception("Signup failed for email=%s", payload.email)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Signup failed") from exc


@router.post("/token", response_model=Token)
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """
    Form-based login (x-www-form-urlencoded), used by Swagger/CLI.
    """
    identifier = f"{form_data.username.lower()}@{request.client.host}"
    allowed, remaining = login_throttler.check_allowed(identifier)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed attempts. Try again in {remaining} seconds.",
        )

    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        remaining_attempts = login_throttler.record_failure(identifier)
        logger.warning("Login failed for email=%s, remaining_attempts=%s", form_data.username, remaining_attempts)
        if remaining_attempts == 0:
            allowed, remaining = login_throttler.check_allowed(identifier)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many failed attempts. Try again in {remaining} seconds.",
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid credentials. {remaining_attempts} attempts remaining.",
        )
    if user.suspended_at:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account locked. Contact support: hello@glucoforager.com",
        )

    login_throttler.record_success(identifier)
    token = create_access_token({"sub": str(user.id)})
    return Token(access_token=token, message="Login successful", public_id=user.public_id)


@router.post("/login", response_model=Token)
def login_alias(
    payload: LoginPayload,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    JSON-based login for mobile/web clients.
    """
    email = payload.email or payload.username
    if not email:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Email is required")

    identifier = f"{email.lower()}@{request.client.host}"
    allowed, remaining = login_throttler.check_allowed(identifier)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed attempts. Try again in {remaining} seconds.",
        )

    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        remaining_attempts = login_throttler.record_failure(identifier)
        logger.warning("Login failed for email=%s, remaining_attempts=%s", email, remaining_attempts)
        if remaining_attempts == 0:
            allowed, remaining = login_throttler.check_allowed(identifier)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many failed attempts. Try again in {remaining} seconds.",
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid credentials. {remaining_attempts} attempts remaining.",
        )
    if user.suspended_at:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account locked. Contact support: hello@glucoforager.com",
        )

    login_throttler.record_success(identifier)
    token = create_access_token({"sub": str(user.id)})
    return Token(access_token=token, message="Login successful", public_id=user.public_id)


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordPayload, db: Session = Depends(get_db)):
    if not settings.smtp_host or not settings.smtp_username or not settings.smtp_password:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Email service not configured")

    email = _normalize_email(payload.email)
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No account found for this email.")

    now = datetime.utcnow()
    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id,
        PasswordResetToken.used_at.is_(None),
    ).update({PasswordResetToken.used_at: now})

    code = _generate_reset_code()
    token = PasswordResetToken(
        user_id=user.id,
        code_hash=_hash_reset_code(code),
        expires_at=now + timedelta(minutes=settings.password_reset_code_ttl_minutes),
    )
    db.add(token)
    db.commit()
    try:
        send_password_reset_code(email, code)
    except Exception as exc:
        logger.exception("Password reset email failed for email=%s", email)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send reset code",
        ) from exc

    return {"message": "Reset code sent. Check your email for the 8-digit code."}


@router.post("/reset-password")
def reset_password(payload: ResetPasswordPayload, db: Session = Depends(get_db)):
    if len(payload.new_password) < 6:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Password too short")

    email = _normalize_email(payload.email)
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired code")

    now = datetime.utcnow()
    token = (
        db.query(PasswordResetToken)
        .filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at >= now,
        )
        .order_by(PasswordResetToken.created_at.desc())
        .first()
    )
    if not token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired code")

    if _hash_reset_code(payload.code.strip()) != token.code_hash:
        token.attempts += 1
        if token.attempts >= settings.password_reset_code_max_attempts:
            token.used_at = now
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired code")

    user.hashed_password = get_password_hash(payload.new_password)
    token.used_at = now
    db.commit()
    return {"message": "Password reset successful"}
