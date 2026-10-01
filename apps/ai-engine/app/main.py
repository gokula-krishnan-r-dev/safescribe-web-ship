"""
SafeScribe AI Engine — FastAPI application entry point.

Startup:  uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
Dev mode: uvicorn app.main:app --reload
"""
from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import extract, health, pathway
from app.api.routes import consultations
from app.api.routes import config as config_routes
from app.config import get_settings

# ─── Logging ─────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("ai_engine")


# ─── Lifespan ────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    logger.info("🚀 %s v%s starting on port %d", settings.app_name, settings.app_version, settings.port)
    logger.info("Models — synthesis: %s  extraction: %s", settings.openai_model, settings.openai_fast_model)
    yield
    logger.info("AI Engine shutting down")


# ─── App ─────────────────────────────────────────────────────────────────────

def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description=(
            "High-performance AI core engine for SafeScribe. "
            "Handles document parsing, text extraction, OCR, "
            "RAG-based clinical knowledge extraction, and AI inference."
        ),
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    # ── CORS ────────────────────────────────────────────────────────────────
    cors_origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Request timing middleware ────────────────────────────────────────────
    @app.middleware("http")
    async def add_timing(request: Request, call_next):
        t0 = time.monotonic()
        response = await call_next(request)
        ms = (time.monotonic() - t0) * 1000
        response.headers["X-Process-Time-Ms"] = f"{ms:.1f}"
        return response

    # ── Global exception handler ────────────────────────────────────────────
    @app.exception_handler(Exception)
    async def global_handler(request: Request, exc: Exception):
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error", "type": type(exc).__name__},
        )

    # ── Routes ──────────────────────────────────────────────────────────────
    app.include_router(health.router)
    app.include_router(extract.router, prefix="/api/v1")
    app.include_router(pathway.router, prefix="/api/v1")
    app.include_router(consultations.router, prefix="/api/v1")
    app.include_router(consultations.compat_router, prefix="/api/v1")
    app.include_router(config_routes.router, prefix="/api/v1")

    return app


app = create_app()
