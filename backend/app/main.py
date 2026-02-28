import logging
import time
from datetime import datetime, timezone

import os
from logging.handlers import RotatingFileHandler
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from .api.endpoints import (
    auth,
    admin,
    admin_settings,
    admin_revenuecat,
    admin_user_email,
    admin_email_campaigns,
    ingredients,
    recipes,
    subscriptions,
    ai_recipes,
    text_recipes,
    favorites,
    user as user_router,
    history,
    meal_plan,
    shopping_list,
    revenuecat,
    mobile_logs,
    system_logs,
    admin_health,
    admin_backups,
    blog,
    admin_blog,
    newsletter,
    admin_newsletter,
)
from .core.config import settings
from .database import Base, engine
from .models import (  # ensure models are registered with SQLAlchemy
    subscription,
    user as user_model,
    ai_request,
    password_reset,
    admin_user,
    admin_email_campaign,
    recipe,
    recipe_history,
    blog_post,
    blog_comment,
    newsletter_signup,
    app_setting,
)
from .services.abuse_detector import AbuseDetector
from .services.system_log_service import log_system_event
from .services.backup_scheduler import start_backup_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s - %(message)s",
)
logger = logging.getLogger("glucoforager")

log_dir = os.getenv("LOG_DIR", "logs")
os.makedirs(log_dir, exist_ok=True)
log_path = os.path.join(log_dir, "app.log")
retention_days = int(os.getenv("LOG_RETENTION_DAYS", "15"))
retention_seconds = retention_days * 24 * 60 * 60
now = time.time()
for path in Path(log_dir).glob("app.log*"):
    try:
        if now - path.stat().st_mtime > retention_seconds:
            path.unlink(missing_ok=True)
    except OSError:
        continue
file_handler = RotatingFileHandler(log_path, maxBytes=5 * 1024 * 1024, backupCount=5, encoding="utf-8")
file_handler.setLevel(logging.INFO)
file_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s - %(message)s"))

root_logger = logging.getLogger()
if not any(getattr(h, "baseFilename", None) == file_handler.baseFilename for h in root_logger.handlers):
    root_logger.addHandler(file_handler)

for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
    uv_logger = logging.getLogger(name)
    if not any(getattr(h, "baseFilename", None) == file_handler.baseFilename for h in uv_logger.handlers):
        uv_logger.addHandler(file_handler)

app = FastAPI(title=settings.project_name)

os.makedirs(settings.uploads_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.uploads_dir), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

abuse_detector = AbuseDetector()

def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()[:64]
    return (request.client.host if request.client else "unknown")[:64]


def _skip_rate_limit(request: Request) -> bool:
    # Avoid counting CORS preflight and internal/admin polling requests.
    if request.method == "OPTIONS":
        return True

    path = request.url.path or ""
    if path.startswith("/api/admin"):
        return True

    # RevenueCat webhook should not be throttled by per-IP limits.
    if path.startswith("/api/revenuecat/webhook"):
        return True

    # Health checks.
    if path in {"/health", "/"}:
        return True

    return False


@app.on_event("startup")
def on_startup():
    logger.info("Startup complete.")
    try:
        start_backup_scheduler()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Backup scheduler start failed: %s", exc)


@app.middleware("http")
async def abuse_guard(request: Request, call_next):
    if _skip_rate_limit(request):
        return await call_next(request)
    identifier = _client_ip(request)
    if not abuse_detector.record_and_check(identifier):
        return JSONResponse(status_code=429, content={"detail": "Slow down"})
    start = time.time()
    try:
        response = await call_next(request)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unhandled error: %s", exc)
        log_system_event({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": "error",
            "source": "api",
            "message": "Unhandled API error",
            "details": str(exc),
            "path": request.url.path,
            "method": request.method,
            "ip": request.client.host if request.client else None,
        })
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})
    duration_ms = (time.time() - start) * 1000
    logger.info("%s %s -> %s (%.1f ms)", request.method, request.url.path, response.status_code, duration_ms)

    # Only record "API request failed" events for real API routes.
    # This prevents system-log flooding from internet scanners probing random paths
    # like "/.env", "/.git/config", "/wp-includes/...", etc.
    if response.status_code >= 400 and request.url.path.startswith("/api/"):
        log_system_event({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": "error" if response.status_code >= 500 else "warn",
            "source": "api",
            "message": "API request failed",
            "details": f"status={response.status_code}",
            "path": request.url.path,
            "method": request.method,
            "ip": request.client.host if request.client else None,
        })
    return response


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    log_system_event({
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "level": "warn",
        "source": "api",
        "message": "Validation error",
        "details": str(exc.errors()),
        "path": request.url.path,
        "method": request.method,
        "ip": request.client.host if request.client else None,
    })
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception: %s", exc)
    log_system_event({
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "level": "error",
        "source": "api",
        "message": "Unhandled exception",
        "details": str(exc),
        "path": request.url.path,
        "method": request.method,
        "ip": request.client.host if request.client else None,
    })
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.api_route("/health", methods=["GET", "HEAD"])
def health():
    return {"status": "ok"}

# Offline Swagger UI (serves local assets)
try:
    from swagger_ui_bundle import swagger_ui_3_path

    app.mount("/docs_static", StaticFiles(directory=swagger_ui_3_path), name="docs_static")

    @app.get("/docs", include_in_schema=False)
    async def custom_swagger_ui_html():
        return get_swagger_ui_html(
            openapi_url=app.openapi_url,
            title=f"{settings.project_name} - Docs",
            swagger_js_url="/docs_static/swagger-ui-bundle.js",
            swagger_css_url="/docs_static/swagger-ui.css",
        )
except Exception as exc:  # noqa: BLE001
    logger.warning("Swagger UI local mount failed: %s", exc)


app.include_router(auth.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(admin_settings.router, prefix="/api")
app.include_router(admin_revenuecat.router, prefix="/api")
app.include_router(admin_user_email.router, prefix="/api")
app.include_router(admin_email_campaigns.router, prefix="/api")
app.include_router(ingredients.router, prefix="/api")
app.include_router(recipes.router, prefix="/api")
app.include_router(subscriptions.router, prefix="/api")
app.include_router(ai_recipes.router, prefix="/api")
app.include_router(text_recipes.router, prefix="/api")
app.include_router(favorites.router, prefix="/api")
app.include_router(user_router.router, prefix="/api")
app.include_router(history.router, prefix="/api")
app.include_router(meal_plan.router, prefix="/api")
app.include_router(shopping_list.router, prefix="/api")
app.include_router(revenuecat.router, prefix="/api")
app.include_router(mobile_logs.router, prefix="/api")
app.include_router(system_logs.router, prefix="/api")
app.include_router(admin_health.router, prefix="/api")
app.include_router(admin_backups.router, prefix="/api")
app.include_router(blog.router, prefix="/api")
app.include_router(admin_blog.router, prefix="/api")
app.include_router(newsletter.router, prefix="/api")
app.include_router(admin_newsletter.router, prefix="/api")
