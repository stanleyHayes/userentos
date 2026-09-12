"""Regressions for bugs found in the ml-service review.

Each test names the failure it locks out; all four were reproduced against
the previous code before the fix landed.
"""

import json
import math
import os

import numpy as np
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from starlette.requests import Request

from app.config import get_settings
from app.main import create_app
from app.ml.features import FEATURE_NAMES, extract_features
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


def test_omitted_optional_field_barely_moves_the_estimate(trained_model):  # noqa: F811
    """An absent field is unknown, not zero.

    `_num` returned 0.0 for any field the caller left out, so "yearBuilt not
    supplied" entered the linear model as year 0 and "city not in training"
    as a city where rent is GHS 0. services/pricing.ts sends seven of the
    thirteen fields, and was getting an estimate ~39% below the same property
    described in full.
    """
    full = {
        "bedrooms": 2, "bathrooms": 2, "floorArea": 95, "furnished": False,
        "parkingSpaces": 1, "advanceMonths": 3,
        "amenities": ["Water", "Electricity", "Security"], "city": "Accra",
        "type": "apartment", "region": "Greater Accra", "floor": 2,
        "yearBuilt": 2018, "stayType": "long_stay",
    }
    baseline = trained_model.predict(full)["predictedRent"]

    # The mechanism, which is what actually matters: an omitted field must
    # reach the model as the training mean, not as 0. Asserted directly so the
    # test does not depend on how much any one feature happens to be worth.
    for dropped in ("yearBuilt", "floorArea", "parkingSpaces", "advanceMonths", "floor"):
        idx = FEATURE_NAMES.index(dropped)
        raw = extract_features({k: v for k, v in full.items() if k != dropped},
                               trained_model.encodings)
        assert math.isnan(raw[idx]), f"{dropped} should extract as MISSING"

    # And the estimate stays in the same neighbourhood. 25%, not 5%: dropping
    # `region` legitimately pulls an Accra property toward the national
    # average, because region carries real signal. The bug was the other
    # thing — a 39% collapse from imputing zeros.
    for dropped in ("yearBuilt", "floorArea", "region", "floor", "parkingSpaces", "advanceMonths"):
        partial = {k: v for k, v in full.items() if k != dropped}
        got = trained_model.predict(partial)["predictedRent"]
        assert abs(got - baseline) / baseline < 0.25, f"omitting {dropped}: {got} vs {baseline}"

    # The payload services/pricing.ts actually sends: 7 of the 13 fields.
    node_shaped = {k: full[k] for k in
                   ("city", "type", "bedrooms", "bathrooms", "floorArea", "furnished", "amenities")}
    got = trained_model.predict(node_shaped)["predictedRent"]
    assert abs(got - baseline) / baseline < 0.25, f"node-shaped: {got} vs {baseline}"


def test_unknown_city_falls_back_to_the_average(trained_model):  # noqa: F811
    """An unseen city priced at the encoding's 0.0 default, i.e. ~65% low."""
    full = {"bedrooms": 2, "bathrooms": 2, "floorArea": 95, "city": "Accra",
            "type": "apartment", "region": "Greater Accra", "yearBuilt": 2018}
    known = trained_model.predict(full)["predictedRent"]
    unknown = trained_model.predict({**full, "city": "Nsawam"})["predictedRent"]

    # Not equal — Accra is genuinely dearer than the national average — but
    # within the same order of magnitude rather than a near-zero.
    assert unknown > known * 0.5


def test_supplied_zero_is_not_treated_as_missing(trained_model):  # noqa: F811
    """Imputation must not swallow a deliberate 0 (ground floor, no parking)."""
    base = {"bedrooms": 2, "bathrooms": 2, "city": "Accra", "type": "apartment",
            "region": "Greater Accra", "floorArea": 95, "yearBuilt": 2018}
    explicit_zero = trained_model.predict({**base, "parkingSpaces": 0, "floor": 0})
    omitted = trained_model.predict(base)
    assert explicit_zero["predictedRent"] != omitted["predictedRent"]


def test_training_imputes_missing_property_fields():
    """Mongo documents routinely omit floorArea/yearBuilt; those rows used to
    train the model on a literal 0, dragging the column mean toward zero."""
    props = generate_properties(200, seed=9)
    for p in props[:100]:  # half the corpus is missing two fields
        p.pop("yearBuilt")
        p.pop("floorArea")

    model = RentPriceModel()
    model.train(props, max_epochs=500)

    year_mean = model.feature_means[FEATURE_NAMES.index("yearBuilt")]
    assert 1985 <= year_mean <= 2026, f"mean year built imputed as {year_mean}"
    assert model.r2_score > 0.5


class TestValuationExplainability:
    """Roadmap §5: a valuation must explain itself, not return one opaque number."""

    CHEAP = {"bedrooms": 1, "bathrooms": 1, "floorArea": 30, "city": "Wa",
             "type": "room", "region": "Upper West", "yearBuilt": 1995,
             "floor": 0, "parkingSpaces": 0, "advanceMonths": 1,
             "furnished": False, "amenities": [], "stayType": "long_stay"}
    DEAR = {**CHEAP, "bedrooms": 4, "bathrooms": 4, "floorArea": 320, "city": "East Legon",
            "type": "townhouse", "region": "Greater Accra", "yearBuilt": 2023,
            "furnished": True, "parkingSpaces": 3, "advanceMonths": 12,
            "amenities": ["Water", "Electricity", "Security", "WiFi", "Air Conditioning"]}

    def test_surfaces_value_decreasing_drivers(self, trained_model):  # noqa: F811
        """weight * value is almost always positive, so the old attribution
        painted every feature as value-increasing and never explained a low
        valuation."""
        result = trained_model.predict(self.CHEAP)
        assert any(c["contribution"] < 0 for c in result["featureContributions"])

    def test_attributes_against_the_average_property(self, trained_model):  # noqa: F811
        low = trained_model.predict(self.CHEAP)
        high = trained_model.predict(self.DEAR)

        assert high["predictedRent"] > low["predictedRent"]
        assert low["baselineRent"] == high["baselineRent"]
        assert low["predictedRent"] < low["baselineRent"]
        assert high["predictedRent"] > high["baselineRent"]

    def test_contributions_are_in_cedis_not_log_space(self, trained_model):  # noqa: F811
        """The web UI renders these through formatCurrency. In log space the
        numbers were ~1.26 and displayed as 'GHS 1'."""
        result = trained_model.predict(self.DEAR)
        biggest = max(abs(c["contribution"]) for c in result["featureContributions"])
        # Comfortably beyond anything log space could produce.
        assert biggest > 100
        for c in result["featureContributions"]:
            assert "impactPercent" in c and "value" in c

    def test_reports_which_inputs_were_estimated(self, trained_model):  # noqa: F811
        complete = trained_model.predict(self.DEAR)
        assert complete["dataQuality"]["imputedFields"] == []
        assert complete["dataQuality"]["warning"] is None

        sparse = trained_model.predict({"bedrooms": 2, "bathrooms": 1,
                                        "city": "Accra", "type": "apartment"})
        imputed = sparse["dataQuality"]["imputedFields"]
        assert "yearBuilt" in imputed and "floorArea" in imputed
        assert "not supplied" in sparse["dataQuality"]["warning"]
        assert sparse["dataQuality"]["suppliedFields"] < sparse["dataQuality"]["totalFields"]

    def test_predict_endpoint_returns_the_new_fields(self, client):
        res = client.post("/predict", json=SAMPLE_INPUT)
        assert res.status_code == 200
        body = res.json()
        assert body["baselineRent"] > 0
        assert body["dataQuality"]["totalFields"] == 18
        assert all({"feature", "contribution", "impactPercent", "value"} <= c.keys()
                   for c in body["featureContributions"])
