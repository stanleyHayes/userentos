"""Shared API dependencies."""

import secrets

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
    expected = (get_settings().ml_api_key or "").strip()
    if not expected:
        return
    provided = request.headers.get("x-api-key") or ""
    # compare_digest, not ==: a plain comparison returns as soon as two bytes
    # differ, so its timing leaks the key prefix-by-prefix. The Node side uses
    # timingSafeEqual for exactly this. Encode first — compare_digest rejects
    # non-ASCII str, which would turn a junk header into a 500.
    if not secrets.compare_digest(provided.encode("utf-8"), expected.encode("utf-8")):
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


# Convenience alias so routers can depend on both at once
def guarded_model(
    _: None = Depends(require_api_key),
    model: RentPriceModel = Depends(get_model),
) -> RentPriceModel:
    return model
