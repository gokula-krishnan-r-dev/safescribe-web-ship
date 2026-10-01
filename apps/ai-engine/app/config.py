from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # App
    app_name: str = "SafeScribe AI Engine"
    app_version: str = "1.0.0"
    debug: bool = False
    host: str = "0.0.0.0"
    port: int = 8000
    workers: int = 4

    # OpenAI
    openai_api_key: str
    openai_model: str = "gpt-5.6-luna"
    openai_fast_model: str = "gpt-5.6-luna"
    openai_embedding_model: str = "text-embedding-3-small"
    openai_max_retries: int = 3
    openai_timeout: float = 90.0

    # AI Pipeline
    chunk_size_chars: int = 3500
    chunk_overlap_chars: int = 300
    parallel_chunk_limit: int = 5
    max_chunks_per_doc: int = 80
    max_combined_chars: int = 400_000

    # NestJS callback (optional — for async job completion webhooks)
    nestjs_callback_url: str = ""
    internal_secret: str = "change-me-internal-secret-32chars"

    # Redis (for Celery background workers)
    redis_url: str = "redis://localhost:6379/1"

    # OCR
    ocr_enabled: bool = True
    ocr_language: str = "eng"
    ocr_dpi: int = 300

    # CORS — comma-separated origins (staging/production override localhost defaults)
    cors_origins: str = "http://localhost:3000,http://localhost:3001"


@lru_cache
def get_settings() -> Settings:
    return Settings()
