from fastapi import APIRouter, Depends

from ..admin_dependencies import get_current_admin
from ...services.cache_service import CacheService
from ...services.revenuecat_metrics_service import get_overview_metrics

router = APIRouter(prefix="/admin", tags=["admin"])
cache = CacheService()


@router.get("/revenuecat/overview")
def admin_revenuecat_overview(_admin=Depends(get_current_admin)):
    return get_overview_metrics(cache)

