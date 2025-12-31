import logging
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

from .api.endpoints import (
    auth,
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
)
from .core.config import settings
from .database import Base, engine
from .models import subscription, user as user_model, ai_request  # ensure models are registered with SQLAlchemy
from .services.abuse_detector import AbuseDetector

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s - %(message)s",
)
logger = logging.getLogger("glucoforager")

app = FastAPI(title=settings.project_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

abuse_detector = AbuseDetector()


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    logger.info("Startup complete, database tables ensured.")


@app.middleware("http")
async def abuse_guard(request: Request, call_next):
    identifier = request.client.host
    if not abuse_detector.record_and_check(identifier):
        return JSONResponse(status_code=429, content={"detail": "Slow down"})
    start = time.time()
    response = await call_next(request)
    duration_ms = (time.time() - start) * 1000
    logger.info("%s %s -> %s (%.1f ms)", request.method, request.url.path, response.status_code, duration_ms)
    return response


@app.get("/health")
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
