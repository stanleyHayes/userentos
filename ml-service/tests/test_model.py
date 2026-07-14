"""Model training / prediction / persistence tests."""

import os

import pytest

from app.ml.model import RentPriceModel
from app.seed.generator import generate_properties


def test_train_requires_minimum_samples():
    model = RentPriceModel()
    with pytest.raises(ValueError, match="at least 20"):
        model.train(generate_properties(10, seed=1))


def test_training_learns_seed_data():
    model = RentPriceModel()
    model.train(generate_properties(800, seed=11))
    assert model.is_trained
    assert model.r2_score > 0.7
    assert model.sample_count == 800


def test_prediction_shape_and_sanity(trained_model):
    result = trained_model.predict(
        {"bedrooms": 2, "bathrooms": 2, "city": "Accra", "type": "apartment",
         "amenities": ["Water", "Security"]}
    )
    assert result["predictedRent"] > 0
    assert result["confidenceInterval"]["low"] <= result["predictedRent"] <= result["confidenceInterval"]["high"]
    assert len(result["featureContributions"]) == 18
    # Contributions sorted by absolute magnitude.
    magnitudes = [abs(c["contribution"]) for c in result["featureContributions"]]
    assert magnitudes == sorted(magnitudes, reverse=True)


def test_bigger_accra_place_costs_more(trained_model):
    small = trained_model.predict({"bedrooms": 1, "bathrooms": 1, "city": "Wa", "type": "room"})
    large = trained_model.predict(
        {"bedrooms": 4, "bathrooms": 3, "floorArea": 180, "furnished": True,
         "parkingSpaces": 2, "city": "Accra", "type": "house"}
    )
    assert large["predictedRent"] > small["predictedRent"]


def test_save_and_load_roundtrip(tmp_path):
    model = RentPriceModel()
    model.train(generate_properties(200, seed=5))
    path = os.path.join(tmp_path, "model.json")
    model.save(path)

    clone = RentPriceModel()
    assert clone.load(path)
    assert clone.is_trained
    assert clone.sample_count == 200

    sample = {"bedrooms": 2, "bathrooms": 1, "city": "Kumasi", "type": "apartment"}
    assert clone.predict(sample)["predictedRent"] == model.predict(sample)["predictedRent"]


def test_predict_before_training_raises():
    with pytest.raises(RuntimeError):
        RentPriceModel().predict({"bedrooms": 1, "bathrooms": 1, "city": "x", "type": "y"})
