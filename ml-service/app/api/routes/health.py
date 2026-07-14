"""Health and model-status endpoints."""

from fastapi import APIRouter, Depends

from app.api.deps import get_model
from app.ml.model import RentPriceModel
from app.schemas.pricing import HealthResponse, StatusResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health(model: RentPriceModel = Depends(get_model)) -> HealthResponse:
    return HealthResponse(status="ok", modelLoaded=str(model.is_trained))


@router.get("/status", response_model=StatusResponse)
def status(model: RentPriceModel = Depends(get_model)) -> StatusResponse:
    return StatusResponse(**model.get_status())
