"""Feature extraction for the rent pricing ML model.

Mirrors server/src/services/ml/features.ts — keep the feature order in sync
with FEATURE_NAMES; the persisted model weights depend on it.
"""

import math
from typing import Any

# Marker for "the caller did not tell us", as distinct from a real zero.
# The model imputes these with the training mean of the column; see
# RentPriceModel._predict_unlocked. Imputing 0 instead reads "unknown year
# built" as "built in year 0" and "city we have never seen" as "a city where
# rent is GHS 0", which a linear model turns into a wildly low price.
MISSING = math.nan

FEATURE_NAMES = [
    "bedrooms",
    "bathrooms",
    "floorArea",
    "furnished",
    "parkingSpaces",
    "advanceMonths",
    "amenitiesCount",
    "cityEncoded",
    "typeEncoded",
    "regionEncoded",
    "hasWater",
    "hasElectricity",
    "hasSecurity",
    "hasWifi",
    "hasAc",
    "floor",
    "yearBuilt",
    "stayTypeShort",
]

EncodingMaps = dict[str, dict[str, float]]


def _has_keyword(items: list[str] | None, keywords: list[str]) -> bool:
    if not items:
        return False
    lowered = [str(s).lower() for s in items]
    return any(k.lower() in s for k in keywords for s in lowered)


def compute_encodings(properties: list[dict[str, Any]]) -> EncodingMaps:
    """Target-mean encodings for city / type / region, computed from rent."""
    city_sums: dict[str, dict[str, float]] = {}
    type_sums: dict[str, dict[str, float]] = {}
    region_sums: dict[str, dict[str, float]] = {}

    for p in properties:
        rent = float(p.get("rentAmount", 0) or 0)
        if rent <= 0:
            continue

        address = p.get("address") or {}
        city = str(address.get("city", "")).lower().strip()
        prop_type = str(p.get("type", "")).lower().strip()
        region = str(address.get("region", "")).lower().strip()

        for key, bucket in ((city, city_sums), (prop_type, type_sums), (region, region_sums)):
            if key:
                stats = bucket.setdefault(key, {"sum": 0.0, "count": 0.0})
                stats["sum"] += rent
                stats["count"] += 1

    total_rent = sum(float(p.get("rentAmount", 0) or 0) for p in properties)
    global_mean = total_rent / len(properties) if properties else 0.0

    def to_means(sums: dict[str, dict[str, float]]) -> dict[str, float]:
        return {
            k: (v["sum"] / v["count"] if v["count"] > 0 else global_mean)
            for k, v in sums.items()
        }

    return {
        "city": to_means(city_sums),
        "type": to_means(type_sums),
        "region": to_means(region_sums),
    }


def extract_features(input_data: dict[str, Any], encodings: EncodingMaps) -> list[float]:
    """Build the raw feature vector for a flat prediction input."""
    city = str(input_data.get("city", "")).lower().strip()
    prop_type = str(input_data.get("type", "")).lower().strip()
    region = str(input_data.get("region", "")).lower().strip()
    # An explicit [] means "no amenities"; an absent list means we were not
    # told. Conflating them priced every amenity-less request as a property
    # with none of them, the single largest negative driver there is.
    stated_amenities = input_data.get("amenities") is not None
    amenities = input_data.get("amenities") or []

    def _flag(present: bool) -> float:
        return (1.0 if present else 0.0) if stated_amenities else MISSING

    def _num(key: str) -> float:
        """A supplied 0 means zero; an absent field means unknown."""
        value = input_data.get(key)
        return float(value) if value is not None else MISSING

    return [
        _num("bedrooms"),
        _num("bathrooms"),
        _num("floorArea"),
        MISSING if input_data.get("furnished") is None else (1.0 if input_data["furnished"] else 0.0),
        _num("parkingSpaces"),
        _num("advanceMonths"),
        float(len(amenities)) if stated_amenities else MISSING,
        # A city/type/region the model never saw in training is unknown, not
        # worthless. These are target-mean encodings in the thousands of GHS,
        # so defaulting to 0.0 knocked ~65% off the price of every listing in
        # an unseen town.
        encodings["city"].get(city, MISSING),
        encodings["type"].get(prop_type, MISSING),
        encodings["region"].get(region, MISSING),
        _flag(_has_keyword(amenities, ["water"])),
        _flag(_has_keyword(amenities, ["electric", "power"])),
        _flag(_has_keyword(amenities, ["security", "guard", "cctv"])),
        _flag(_has_keyword(amenities, ["wifi", "internet"])),
        _flag(_has_keyword(amenities, ["ac", "air condition", "aircond"])),
        _num("floor"),
        _num("yearBuilt"),
        MISSING if input_data.get("stayType") is None
        else (1.0 if input_data["stayType"] == "short_stay" else 0.0),
    ]


def extract_features_from_property(
    property_data: dict[str, Any], encodings: EncodingMaps
) -> list[float]:
    """Build the feature vector from a nested property document (as stored in Mongo)."""
    address = property_data.get("address") or {}
    return extract_features(
        {
            "bedrooms": property_data.get("bedrooms"),
            "bathrooms": property_data.get("bathrooms"),
            "floorArea": property_data.get("floorArea"),
            "furnished": property_data.get("furnished"),
            "parkingSpaces": property_data.get("parkingSpaces"),
            "advanceMonths": property_data.get("advanceMonths"),
            "amenities": property_data.get("amenities"),
            "city": address.get("city", ""),
            "type": property_data.get("type", ""),
            "region": address.get("region"),
            "floor": property_data.get("floor"),
            "yearBuilt": property_data.get("yearBuilt"),
            "stayType": property_data.get("stayType"),
        },
        encodings,
    )


#: Fixed probe for fingerprinting the feature-extraction contract.
#: Exercises every branch: numbers, booleans, the encodings, the amenity
#: keyword flags and the missing-value path.
FINGERPRINT_PROBE: dict[str, Any] = {
    "bedrooms": 2, "bathrooms": 1, "floorArea": 95.5, "furnished": True,
    "parkingSpaces": 1, "advanceMonths": 6, "amenities": ["Water", "Security"],
    "city": "accra", "type": "apartment", "region": "greater accra",
    "yearBuilt": 2018, "stayType": "long_stay",
    # floor deliberately absent, to pin the MISSING path too.
}

FINGERPRINT_ENCODINGS: EncodingMaps = {
    "city": {"accra": 3000.0},
    "type": {"apartment": 2500.0},
    "region": {"greater accra": 2800.0},
}


def contract_fingerprint() -> str:
    """A stable hash of the feature vector produced for a fixed input.

    The model artifact stores one weight per position in FEATURE_NAMES. Adding,
    removing or REORDERING a feature, or changing what one of them means,
    silently repoints every weight — and a length check cannot see a reorder
    or a redefinition, only a count change.

    Included in the artifact and rechecked on load.
    """
    import hashlib
    vector = extract_features(FINGERPRINT_PROBE, FINGERPRINT_ENCODINGS)
    payload = "|".join(FEATURE_NAMES) + "||" + ",".join(
        "nan" if v != v else f"{v:.6f}" for v in vector
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]
