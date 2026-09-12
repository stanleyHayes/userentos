"""Shared fixtures for the API tests."""

import atexit
import os
import shutil
import tempfile

# Point model persistence at a throwaway file before app modules import
# (settings are lru_cached) so tests never clobber data/pricing-model.json.
#
# The directory is fresh per run and removed afterwards. With a fixed path,
# the app lifespan saved the trained singleton on shutdown and LOADED it back
# on the next run — so every client-based test asserted against whatever
# model the previous run happened to leave behind, not the fixture's.
if "MODEL_PATH" not in os.environ:
    _model_dir = tempfile.mkdtemp(prefix="rentos-ml-test-")
    atexit.register(shutil.rmtree, _model_dir, True)
    os.environ["MODEL_PATH"] = os.path.join(_model_dir, "pricing-model.json")

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
