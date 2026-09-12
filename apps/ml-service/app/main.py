"""RentOS Pricing ML Service — FastAPI application factory."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import health, legal, predict, train
from app.config import get_settings
from app.core.logging import configure_logging, get_logger
from app.legal.classifier import complaint_classifier
from app.ml.model import rent_price_model

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(settings.log_level)

    if rent_price_model.load(settings.model_path):
        logger.info(
            "Loaded model from %s (R²=%.3f, %d samples)",
            settings.model_path, rent_price_model.r2_score, rent_price_model.sample_count,
        )
    else:
        logger.info("No saved model at %s — train via POST /train or POST /train/seed", settings.model_path)

    if complaint_classifier.load(settings.legal_model_path):
        logger.info(
            "Loaded complaint classifier from %s (%d examples, trained %s)",
            settings.legal_model_path, complaint_classifier.sample_count,
            complaint_classifier.trained_at,
        )
    else:
        logger.info(
            "No complaint classifier at %s — run scripts/train_legal.py; "
            "/legal/classify will answer 503 until then",
            settings.legal_model_path,
        )

    if not settings.ml_api_key:
        logger.warning(
            "ML_API_KEY is not set — all endpoints are UNAUTHENTICATED (dev mode). "
            "Set ML_API_KEY in any exposed deployment."
        )

    yield

    if rent_price_model.is_trained:
        rent_price_model.save(settings.model_path)
        logger.info("Saved model to %s", settings.model_path)


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        description="Standalone microservice for Ghanaian rent price prediction.",
        version=settings.app_version,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(predict.router)
    app.include_router(train.router)
    app.include_router(legal.router)

    return app


app = create_app()
