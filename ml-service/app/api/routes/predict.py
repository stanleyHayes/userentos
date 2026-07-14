"""Prediction endpoints."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_model
from app.ml.model import RentPriceModel
from app.schemas.pricing import PredictResponse, PropertyInput

router = APIRouter(tags=["predict"])


def _require_trained(model: RentPriceModel) -> None:
    if not model.is_trained:
        raise HTTPException(
            status_code=503,
            detail="Model not trained. Call POST /train or POST /train/seed first.",
        )


@router.post("/predict", response_model=PredictResponse)
def predict(
    req: PropertyInput, model: RentPriceModel = Depends(get_model)
) -> dict[str, Any]:
    _require_trained(model)
    try:
        return model.predict(req.model_dump())
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/predict-batch")
def predict_batch(
    reqs: list[PropertyInput], model: RentPriceModel = Depends(get_model)
) -> list[dict[str, Any]]:
    _require_trained(model)
    results: list[dict[str, Any]] = []
    for req in reqs:
        try:
            results.append(model.predict(req.model_dump()))
        except Exception as exc:  # keep the batch going on bad rows
            results.append({"error": str(exc)})
    return results
