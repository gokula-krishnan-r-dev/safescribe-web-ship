from fastapi import APIRouter
from app.config import get_settings

router = APIRouter()


@router.get("/health", tags=["System"])
async def health():
    settings = get_settings()
    return {
        "status": "ok",
        # Stable id for NestJS readiness probes (do not rename).
        "serviceId": "safescribe-ai-engine",
        "service": settings.app_name,
        "version": settings.app_version,
    }


@router.get("/health/ready", tags=["System"])
async def readiness():
    """Kubernetes/Docker readiness probe."""
    return {"ready": True}
