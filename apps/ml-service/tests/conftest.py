"""Shared fixtures for the API tests."""

import os
import tempfile

# Point model persistence at a throwaway file before app modules import
# (settings are lru_cached) so tests never clobber data/pricing-model.json.
os.environ.setdefault(
    "MODEL_PATH", os.path.join(tempfile.gettempdir(), "rentos-ml-test-model.json")
)

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.ml.model import rent_price_model
from app.seed.generator import generate_properties


@pytest.fixture(scope="session")
def trained_model():
    """Train the singleton once on a small deterministic dataset."""
    if not rent_price_model.is_trained:
        rent_price_model.train(generate_properties(500, seed=7))
    return rent_price_model


@pytest.fixture()
def client(trained_model):
    with TestClient(create_app()) as c:
        yield c


SAMPLE_INPUT = {
    "bedrooms": 2,
    "bathrooms": 2,
    "floorArea": 95,
    "furnished": False,
    "parkingSpaces": 1,
    "advanceMonths": 3,
    "amenities": ["Water", "Electricity", "Security"],
    "city": "Accra",
    "type": "apartment",
    "region": "Greater Accra",
}
