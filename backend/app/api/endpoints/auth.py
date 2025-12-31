import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from ...core.security import create_access_token, get_password_hash, verify_password
from ...database import get_db
from ...models.user import User
from ...services.email_service import send_welcome_email
from ...services.login_throttler import LoginThrottler

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)
login_throttler = LoginThrottler()


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    message: str | None = None


class UserCreate(BaseModel):
    email: EmailStr
    password: str


class LoginPayload(BaseModel):
    email: EmailStr | None = None
    username: str | None = None
    password: str


@router.post("/signup", response_model=Token)
def signup(payload: UserCreate, db: Session = Depends(get_db)):
    try:
        existing = db.query(User).filter(User.email == payload.email).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User already exists")
        user = User(email=payload.email, hashed_password=get_password_hash(payload.password))
        db.add(user)
        db.commit()
        db.refresh(user)
        token = create_access_token({"sub": str(user.id)})
        try:
            send_welcome_email(payload.email)
        except Exception:
            logger.exception("Welcome email failed for email=%s", payload.email)
        return Token(access_token=token, message="Signup successful")
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
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    login_throttler.record_success(identifier)
    token = create_access_token({"sub": str(user.id)})
    return Token(access_token=token, message="Login successful")


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
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    login_throttler.record_success(identifier)
    token = create_access_token({"sub": str(user.id)})
    return Token(access_token=token, message="Login successful")
