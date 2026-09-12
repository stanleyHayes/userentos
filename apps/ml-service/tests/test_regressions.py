"""Regressions for bugs found in the ml-service review.

Each test names the failure it locks out; all four were reproduced against
the previous code before the fix landed.
"""

import json
import os

import numpy as np
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from starlette.requests import Request

from app.config import get_settings
from app.main import create_app
from app.ml.features import FEATURE_NAMES
from app.ml.model import MAX_RENT, RentPriceModel
from app.schemas.pricing import TrainRequest
from app.seed.generator import generate_properties
from tests.conftest import SAMPLE_INPUT, trained_model  # noqa: F401


def _properties_with_constant_columns(n: int = 40) -> list[dict]:
    """A plausible dataset where several feature columns never vary.

    Real ones look like this: every listing quotes the same advance, every
    flat is wired for electricity, none are furnished.
    """
    rng = np.random.default_rng(7)
    return [
        {
            "rentAmount": float(1000 + 500 * (i % 5) + rng.integers(0, 200)),
            "bedrooms": 1 + (i % 4),
            "bathrooms": 1 + (i % 3),
            "floorArea": 60.0 + i,
            "furnished": False,
            "parkingSpaces": i % 3,
            "advanceMonths": 6,
            "amenities": ["Water", "Electricity"],
            "address": {"city": ["accra", "kumasi"][i % 2], "region": "greater accra"},
            "type": ["apartment", "house"][i % 2],
            "floor": i % 4,
            "yearBuilt": 2015 + (i % 5),
            "stayType": "long_stay",
        }
        for i in range(n)
    ]


BASE_INPUT = {
    "bedrooms": 2, "bathrooms": 1, "floorArea": 80, "furnished": False,
    "parkingSpaces": 1, "advanceMonths": 6, "amenities": ["Water"],
    "city": "accra", "type": "apartment", "region": "greater accra",
    "floor": 1, "yearBuilt": 2018, "stayType": "long_stay",
}


def test_constant_training_column_does_not_blow_up_predictions():
    """A column with zero variance must get weight 0, not weight ~1e8.

    Dividing by (std + 1e-8) when de-normalising amplified such a column's
    weight by ~1e8, so any prediction where the feature DID vary landed at
    exp(+/-1e7): a rent of 0, or inf — and inf raised OverflowError in
    round(), i.e. a 500.
    """
    model = RentPriceModel()
    model.train(_properties_with_constant_columns(), max_epochs=300)

    for name in ("furnished", "advanceMonths", "hasElectricity", "stayTypeShort"):
        assert model.weights[FEATURE_NAMES.index(name)] == 0.0, f"{name} kept a weight"

    # Matches the training constants, and differs from every one of them.
    matching = model.predict(BASE_INPUT)["predictedRent"]
    differing = model.predict(
        {**BASE_INPUT, "furnished": True, "advanceMonths": 1,
         "amenities": ["Water", "Electricity"], "stayType": "short_stay"}
    )["predictedRent"]

    assert 100 < matching < 100_000
    assert 100 < differing < 100_000


def test_prediction_clamps_instead_of_overflowing(trained_model):  # noqa: F811
    """An out-of-range input must not reach inf and crash round()."""
    absurd = {**SAMPLE_INPUT, "bedrooms": 100, "bathrooms": 100, "floorArea": 1_000_000}
    result = trained_model.predict(absurd)
    assert 0 <= result["predictedRent"] <= MAX_RENT
    assert result["confidenceInterval"]["high"] >= result["predictedRent"]


@pytest.mark.parametrize("field,value", [("maxEpochs", -1), ("maxEpochs", 0), ("patience", -1)])
def test_api_rejects_non_positive_training_bounds(client, field, value):
    """maxEpochs=-1 skipped the gradient loop and persisted random weights."""
    res = client.post("/train/seed", json={"count": 20, field: value})
    assert res.status_code == 422


@pytest.mark.parametrize("value", [-1, 0])
def test_model_guards_non_positive_max_epochs(value):
    """scripts/ call train() directly and never see the request schema."""
    model = RentPriceModel()
    with pytest.raises(ValueError, match="max_epochs"):
        model.train(generate_properties(30, seed=3), max_epochs=value)
    assert not model.is_trained


def test_zero_l2_lambda_survives_resolution():
    """`req.l2Lambda or 0.001` rewrote a deliberate 0 into the default."""
    assert TrainRequest(properties=[], l2Lambda=0.0).training_kwargs()["l2_lambda"] == 0.0
    assert TrainRequest(properties=[], l2Lambda=None).training_kwargs()["l2_lambda"] == 0.001
    assert TrainRequest(properties=[]).training_kwargs()["l2_lambda"] == 0.001


def test_failed_load_leaves_the_running_model_untouched(tmp_path):
    """A half-read artifact used to splice new weights onto old encodings."""
    model = RentPriceModel()
    model.train(generate_properties(200, seed=5), max_epochs=300)
    healthy = model.predict(BASE_INPUT)
    weights_before = model.weights.copy()

    path = str(tmp_path / "model.json")
    model.save(path)
    state = json.load(open(path))
    state["weights"] = [0.0] * len(FEATURE_NAMES)
    del state["encodings"]  # truncated artifact: fails partway through
    json.dump(state, open(path, "w"))

    assert model.load(path) is False
    assert np.array_equal(model.weights, weights_before)
    assert model.is_trained
    assert model.predict(BASE_INPUT) == healthy


def test_load_rejects_artifact_with_wrong_feature_count(tmp_path):
    """Feature order/count drift must not silently produce wrong prices."""
    model = RentPriceModel()
    model.train(generate_properties(200, seed=5), max_epochs=300)
    path = str(tmp_path / "model.json")
    model.save(path)

    state = json.load(open(path))
    state["weights"] = state["weights"][:-3]  # an older, shorter feature vector
    json.dump(state, open(path, "w"))

    assert model.load(path) is False


def test_api_key_comparison_is_constant_time(monkeypatch):
    """`provided != expected` leaked the key prefix-by-prefix via timing."""
    import inspect

    from app.api import deps

    assert "compare_digest" in inspect.getsource(deps.require_api_key)

    monkeypatch.setenv("ML_API_KEY", "test-secret-key")
    get_settings.cache_clear()
    try:
        with TestClient(create_app()) as c:
            assert c.post("/predict", json=SAMPLE_INPUT, headers={"x-api-key": "wrong"}).status_code == 401
            assert c.post("/predict", json=SAMPLE_INPUT, headers={"x-api-key": "test-secret-key"}).status_code == 200

        # Driven directly, not over HTTP: httpx refuses to send a non-ASCII
        # header, but headers arrive from the wire latin-1 decoded, so a raw
        # client can deliver one. compare_digest raises TypeError on
        # non-ASCII str — a 500 — unless both sides are encoded first.
        request = Request({"type": "http", "headers": [(b"x-api-key", b"k\xe9y")]})
        with pytest.raises(HTTPException) as exc:
            deps.require_api_key(request)
        assert exc.value.status_code == 401
    finally:
        get_settings.cache_clear()


def test_blank_api_key_env_is_treated_as_unset(monkeypatch):
    """ML_API_KEY='  ' must not read as a real key that nothing can match."""
    monkeypatch.setenv("ML_API_KEY", "   ")
    get_settings.cache_clear()
    try:
        with TestClient(create_app()) as c:
            assert c.post("/predict", json=SAMPLE_INPUT).status_code == 200
    finally:
        get_settings.cache_clear()


@pytest.mark.parametrize("payload", [
    {"bedrooms": -1, "bathrooms": 1, "city": "Accra", "type": "apartment"},
    {"bedrooms": 2, "bathrooms": 1, "city": "Accra", "type": "apartment", "floorArea": 1e15},
    {"bedrooms": 2, "bathrooms": 1, "city": "Accra", "type": "apartment", "yearBuilt": 99999},
    {"bedrooms": 2, "bathrooms": 1, "city": "A" * 500, "type": "apartment"},
])
def test_predict_rejects_out_of_range_input(client, payload):
    assert client.post("/predict", json=payload).status_code == 422
