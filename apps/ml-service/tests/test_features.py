"""Feature-extraction tests."""

from app.ml.features import (
    FEATURE_NAMES,
    compute_encodings,
    extract_features,
    extract_features_from_property,
)
from app.seed.generator import generate_properties


def test_feature_vector_length_matches_names():
    encodings = {"city": {"accra": 2000.0}, "type": {"apartment": 1800.0}, "region": {}}
    vec = extract_features(
        {"bedrooms": 2, "bathrooms": 1, "city": "Accra", "type": "Apartment"},
        encodings,
    )
    assert len(vec) == len(FEATURE_NAMES) == 18
    assert vec[0] == 2.0
    assert vec[7] == 2000.0  # cityEncoded (case-insensitive)
    assert vec[8] == 1800.0  # typeEncoded


def test_amenity_keywords_detected():
    encodings = {"city": {}, "type": {}, "region": {}}
    vec = extract_features(
        {"bedrooms": 1, "bathrooms": 1, "city": "x", "type": "y",
         "amenities": ["24hr Security", "Wifi", "Air Conditioning", "Water"]},
        encodings,
    )
    has_water, has_electricity, has_security, has_wifi, has_ac = vec[10:15]
    assert has_water == 1.0
    assert has_electricity == 0.0
    assert has_security == 1.0
    assert has_wifi == 1.0
    assert has_ac == 1.0


def test_encodings_use_rent_means():
    props = generate_properties(200, seed=3)
    enc = compute_encodings(props)
    assert "accra" in enc["city"]
    assert "apartment" in enc["type"]
    assert enc["city"]["accra"] > 0
    # Accra should out-price smaller cities on average.
    assert enc["city"]["accra"] > enc["city"]["wa"]


def test_nested_property_extraction():
    encodings = {"city": {"kumasi": 1200.0}, "type": {}, "region": {"ashanti": 1100.0}}
    vec = extract_features_from_property(
        {"bedrooms": 3, "bathrooms": 2, "type": "house",
         "address": {"city": "Kumasi", "region": "Ashanti"}},
        encodings,
    )
    assert vec[0] == 3.0
    assert vec[7] == 1200.0
    assert vec[9] == 1100.0
