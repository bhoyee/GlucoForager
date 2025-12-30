from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .api.endpoints import auth, ingredients, recipes, subscriptions
from .core.config import settings
from .database import Base, engine
from .services.abuse_detector import AbuseDetector

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


@app.middleware("http")
async def abuse_guard(request: Request, call_next):
    identifier = request.client.host
    if not abuse_detector.record_and_check(identifier):
        return JSONResponse(status_code=429, content={"detail": "Slow down"})
    return await call_next(request)


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(auth.router, prefix="/api")
app.include_router(ingredients.router, prefix="/api")
app.include_router(recipes.router, prefix="/api")
app.include_router(subscriptions.router, prefix="/api")
