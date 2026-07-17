"""Training endpoints: explicit data, generated seed data, and model reload."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.deps import guarded_model
from app.config import Settings, get_settings
from app.core.logging import get_logger
from app.ml.model import RentPriceModel
from app.schemas.pricing import (
    ReloadResponse,
    SeedTrainRequest,
    SeedTrainResponse,
    StatusResponse,
    TrainRequest,
)
from app.seed.generator import dataset_stats, generate_properties

logger = get_logger(__name__)

router = APIRouter(tags=["train"])


def _train_and_persist(
    model: RentPriceModel,
    settings: Settings,
    properties: list[dict[str, Any]],
    *,
    max_epochs: int,
    learning_rate: float,
    lr_decay: float,
    l2_lambda: float,
    patience: int,
    verbose: bool,
) -> None:
    try:
        model.train(
            properties,
            max_epochs=max_epochs,
            learning_rate=learning_rate,
            lr_decay=lr_decay,
            l2_lambda=l2_lambda,
            patience=patience,
            verbose=verbose,
        )
        model.save(settings.model_path)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Training failed: %s", exc)
        raise HTTPException(status_code=500, detail="Training failed") from exc


@router.post("/train", response_model=StatusResponse)
def train(
    req: TrainRequest,
    model: RentPriceModel = Depends(guarded_model),
    settings: Settings = Depends(get_settings),
) -> StatusResponse:
    """Train on caller-supplied properties (used by the Node server)."""
    _train_and_persist(
        model,
        settings,
        req.properties,
        max_epochs=req.maxEpochs or 10000,
        learning_rate=req.learningRate or 0.01,
        lr_decay=req.lrDecay or 0.9995,
        l2_lambda=req.l2Lambda or 0.001,
        patience=req.patience or 500,
        verbose=req.verbose or False,
    )
    return StatusResponse(**model.get_status())


@router.post("/train/seed", response_model=SeedTrainResponse)
def train_seed(
    req: SeedTrainRequest,
    model: RentPriceModel = Depends(guarded_model),
    settings: Settings = Depends(get_settings),
) -> SeedTrainResponse:
    """Generate a fresh deterministic Ghanaian dataset and train on it."""
    properties = generate_properties(req.count, req.seed)
    stats = dataset_stats(properties)
    logger.info("Generated seed dataset: %s", stats)

    _train_and_persist(
        model,
        settings,
        properties,
        max_epochs=req.maxEpochs or 10000,
        learning_rate=req.learningRate or 0.01,
        lr_decay=req.lrDecay or 0.9995,
        l2_lambda=req.l2Lambda or 0.001,
        patience=req.patience or 500,
        verbose=req.verbose or False,
    )
    return SeedTrainResponse(**model.get_status(), dataset=stats)


@router.post("/reload", response_model=ReloadResponse)
def reload(
    request: Request,
    model: RentPriceModel = Depends(guarded_model),
    settings: Settings = Depends(get_settings),
) -> ReloadResponse:
    loaded = model.load(settings.model_path)
    return ReloadResponse(loaded=str(loaded), path=settings.model_path)
