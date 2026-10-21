"""Shared photo library for simple foods (swap options and the food a user searched).

Each food is photographed once with the recipe-image AI (Runware), stored in R2 and
reused for every user. Unknown foods are generated in the background after the
response is sent; the app polls `/app/food-images` until they appear.
"""

from __future__ import annotations

import hashlib
import io
import logging
import re
from datetime import datetime, timedelta
from pathlib import Path

from openai import OpenAI
from PIL import Image
from sqlalchemy.orm import Session

from ..core.config import settings
from ..database import SessionLocal
from ..models.food_image import FoodImage
from .cache_service import CacheService
from .r2_storage_service import r2_upload_bytes

logger = logging.getLogger(__name__)

IMAGE_SIZE = 512
MAX_ATTEMPTS = 3
RETRY_FAILED_AFTER = timedelta(hours=12)
LOCK_SECONDS = 180

# Words that don't change what the food looks like.
_DROP_WORDS = {
    "a", "an", "the", "of", "some", "plain", "fresh", "serving", "servings", "portion", "portions",
    "small", "smaller", "medium", "large", "homemade", "instead", "occasionally", "sparingly",
}
_DRINK_WORDS = {
    "water", "tea", "coffee", "juice", "milk", "smoothie", "soda", "cola", "latte", "kefir",
    "lemonade", "drink", "shake", "espresso", "cappuccino", "kombucha", "squash",
}


def food_key(name: str) -> str:
    """Normalise a food name so "Brown rice (small portion)" and "brown rice" share one image."""
    s = str(name or "").lower()
    s = re.sub(r"\(.*?\)", " ", s)
    s = s.split(",")[0]
    s = s.replace("&", " and ").replace("+", " and ")
    s = re.sub(r"[^a-z0-9\s'-]", " ", s)
    s = re.sub(r"\b\d+(?:\.\d+)?\s*(?:g|kg|ml|l|oz|cups?|tbsp|tsp|slices?|pieces?)?\b", " ", s)
    words = [w for w in s.split() if w not in _DROP_WORDS]
    return " ".join(words)[:80].strip()


def _is_drink(key: str) -> bool:
    return any(w in _DRINK_WORDS for w in key.split())


def describe_food(name: str) -> str | None:
    """One short visual description, so the image model draws the right dish.

    Image models often don't know specific dishes (e.g. jollof rice, lentil pasta); a small
    text model does. Called once per new food, never for library hits.
    """
    if not settings.openai_api_key:
        return None
    try:
        client = OpenAI(api_key=settings.openai_api_key)
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You describe what a food looks like when served, for a photographer. "
                        "One sentence, max 30 words, describing ONLY this food itself: its colour, texture, "
                        "shape and form (e.g. loaf, slices, grains, strands, mash, cubes) as it looks ready to eat. "
                        "Be accurate to the traditional or usual version, including its real colour. Do not add side dishes, sweet toppings, honey or syrup "
                        "unless they are part of the food's name. If it is a drink, say what glass or cup it is in. "
                        "No brand names, no health claims."
                    ),
                },
                {"role": "user", "content": str(name)[:120]},
            ],
            max_tokens=80,
            temperature=0.2,
            timeout=12,
        )
        text = (resp.choices[0].message.content or "").strip().replace("\n", " ")
        return text[:300] or None
    except Exception as exc:  # noqa: BLE001
        logger.info("Food description failed for %r: %s", name, str(exc)[:160])
        return None


def build_prompt(name: str, serving: str | None = None, description: str | None = None) -> str:
    """A prompt tuned for photos that look like a real, everyday serving."""
    key = food_key(name) or str(name or "").strip().lower()
    label = str(name or key).strip()
    label = re.sub(r"\(.*?\)", "", label).strip() or key
    if _is_drink(key):
        subject = (
            f"A real, unedited smartphone photo of a single serving of {label} in a plain clear drinking glass "
            "or simple mug, as it is normally served."
        )
    else:
        subject = (
            f"A real, unedited smartphone photo of a single home-sized serving of {label}, ready to eat "
            "(cooked if it is normally eaten cooked, e.g. porridge not dry oats), on a plain white plate, "
            "or in a plain white bowl only if it is normally eaten from a bowl (e.g. soup, porridge, yoghurt)."
        )
    portion = ""
    if serving and str(serving).strip():
        portion = f" Realistic portion of about {str(serving).strip()[:60]}."
    looks = f" What it looks like: {description.strip()}" if description and description.strip() else ""
    return " ".join(
        [
            subject + portion + looks,
            "Tight close-up: the plate or bowl fills almost the whole frame (its edges may be cropped), so the "
            "food is easy to recognise even as a small thumbnail.",
            "On a light natural wooden kitchen table, photographed from a 45-degree angle in soft natural "
            "daylight from a nearby window, gentle real shadows, softly blurred background.",
            "True-to-life colours and natural textures with small real-world imperfections; looks like a genuine "
            "photo taken in a home kitchen, not a styled advert, not an illustration and not a 3D render.",
            "Only this one food: no side dishes, no other bowls or plates, no extra ingredients around it.",
            "No hands, no people, no cutlery clutter, no packaging, no labels, no logos, no text of any kind.",
        ]
    )


NEGATIVE_PROMPT = (
    "text, words, letters, numbers, watermark, logo, label, packaging, brand, caption, UI, border, frame, "
    "cartoon, illustration, painting, anime, CGI, 3d render, plastic, glossy, oversaturated, fake, lowres, blurry, "
    "deformed, extra objects, multiple dishes, side dishes, other plates, hands, people, wide shot"
)


def lookup(db: Session, names: list[str]) -> dict[str, str | None]:
    """Map each name to its library image URL (None when missing)."""
    keys = {n: food_key(n) for n in names if n}
    wanted = {k for k in keys.values() if k}
    found: dict[str, str] = {}
    if wanted:
        rows = db.query(FoodImage).filter(FoodImage.key.in_(wanted)).all()
        found = {r.key: r.image_url for r in rows if r.status == "ready" and r.image_url}
    return {n: found.get(k) for n, k in keys.items()}


def needs_generation(db: Session, name: str) -> bool:
    key = food_key(name)
    if not key:
        return False
    row = db.get(FoodImage, key)
    if row is None:
        return True
    if row.status == "ready" and row.image_url:
        return False
    return row.attempts < MAX_ATTEMPTS and (datetime.utcnow() - (row.updated_at or datetime.utcnow())) >= RETRY_FAILED_AFTER


def _store(image_bytes: bytes, key: str) -> str:
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()[:16]
    slug = re.sub(r"[^a-z0-9]+", "-", key).strip("-")[:40] or "food"
    filename = f"{slug}-{digest}.jpg"
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    if img.size != (IMAGE_SIZE, IMAGE_SIZE):
        img = img.resize((IMAGE_SIZE, IMAGE_SIZE), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=84, optimize=True, progressive=True)
    backend = str(settings.recipe_upload_storage_backend or "local").strip().lower()
    if backend == "r2":
        return r2_upload_bytes(key=f"foodimages/{filename}", data=buf.getvalue(), content_type="image/jpeg")
    folder = Path(settings.uploads_dir) / "food-images"
    folder.mkdir(parents=True, exist_ok=True)
    (folder / filename).write_bytes(buf.getvalue())
    return f"/uploads/food-images/{filename}"


def generate_one(name: str, serving: str | None = None) -> str | None:
    """Generate, store and record one food photo. Safe to call from a background task."""
    key = food_key(name)
    if not key:
        return None
    cache = CacheService()
    if cache.incr(f"foodimg:lock:{key}", ttl_seconds=LOCK_SECONDS) > 1:
        return None  # Someone else is already generating it.
    db = SessionLocal()
    try:
        if not needs_generation(db, name):
            return None
        # Imported lazily: the generator pulls in the AI clients.
        from .ai_recipe_generator import AIRecipeGenerator

        url = None
        try:
            gen = AIRecipeGenerator()
            prompt = build_prompt(name, serving, describe_food(name))
            image_bytes = gen._generate_image_runware(prompt, size=IMAGE_SIZE, negative_prompt=NEGATIVE_PROMPT)
            if image_bytes:
                url = _store(image_bytes, key)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Food image generation failed key=%r: %s", key, str(exc)[:200])

        row = db.get(FoodImage, key)
        if row is None:
            row = FoodImage(key=key, name=str(name).strip()[:120], attempts=0)
            db.add(row)
        row.attempts = (row.attempts or 0) + 1
        row.image_url = url or row.image_url
        row.status = "ready" if url else "failed"
        row.source = "ai"
        row.updated_at = datetime.utcnow()
        db.commit()
        return url
    finally:
        db.close()
        cache.delete(f"foodimg:lock:{key}")


def generate_missing(items: list[tuple[str, str | None]]) -> None:
    """Background task: generate each (name, serving) that isn't in the library yet."""
    seen: set[str] = set()
    for name, serving in items:
        key = food_key(name)
        if not key or key in seen:
            continue
        seen.add(key)
        generate_one(name, serving)


def is_generating(name: str) -> bool:
    key = food_key(name)
    return bool(key) and bool(CacheService().get(f"foodimg:lock:{key}"))
