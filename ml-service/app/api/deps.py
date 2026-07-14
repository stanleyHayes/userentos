"""Shared API dependencies."""

from app.ml.model import RentPriceModel, rent_price_model


def get_model() -> RentPriceModel:
    return rent_price_model
