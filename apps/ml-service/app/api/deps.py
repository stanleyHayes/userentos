"""Shared API dependencies."""

from fastapi import Depends, HTTPException, Request

from app.config import get_settings
from app.ml.model import RentPriceModel, rent_price_model


def get_model() -> RentPriceModel:
    return rent_price_model


def require_api_key(request: Request) -> None:
    """Guard every non-health endpoint when ML_API_KEY is configured.

    The Node server sends the key as `x-api-key`. When unset (dev mode), all
    requests are allowed and a startup warning is logged instead.
    """
    expected = get_settings().ml_api_key
    if not expected:
        return
    provided = request.headers.get("x-api-key")
    if not provided or provided != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


# Convenience alias so routers can depend on both at once
def guarded_model(
    _: None = Depends(require_api_key),
    model: RentPriceModel = Depends(get_model),
) -> RentPriceModel:
    return model
