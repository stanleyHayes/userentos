"""Application configuration via pydantic-settings.

All values can be overridden with environment variables (case-insensitive).
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration for the pricing ML service."""

    model_config = SettingsConfigDict(env_prefix="", case_sensitive=False, extra="ignore")

    app_name: str = "RentOS Pricing ML Service"
    app_version: str = "2.0.0"

    # Where the trained model artifact is persisted.
    model_path: str = "data/pricing-model.json"

    # Comma-separated CORS origins ("*" allows everything).
    cors_origins: str = "*"

    # Uvicorn port (read by the Docker entrypoint / docker-compose).
    port: int = 8000

    log_level: str = "INFO"

    # Seed-data defaults for POST /train/seed and scripts/train_seed.py.
    seed_count: int = 2500
    seed_rng_seed: int = 20260714

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
