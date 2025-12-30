from fastapi import APIRouter

router = APIRouter(prefix="/recipes", tags=["deprecated"])


@router.get("/legacy")
def legacy_notice():
    return {"detail": "Legacy recipe search removed; use /api/ai/recipes/vision or /api/ai/text/recipes"}
