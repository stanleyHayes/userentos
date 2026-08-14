"""Feature extraction for the rent pricing ML model.

Mirrors server/src/services/ml/features.ts — keep the feature order in sync
with FEATURE_NAMES; the persisted model weights depend on it.
"""

from typing import Any

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
    amenities = input_data.get("amenities") or []

    def _num(key: str) -> float:
        value = input_data.get(key)
        return float(value) if value is not None else 0.0

    return [
        _num("bedrooms"),
        _num("bathrooms"),
        _num("floorArea"),
        1.0 if input_data.get("furnished") else 0.0,
        _num("parkingSpaces"),
        _num("advanceMonths"),
        float(len(amenities)),
        encodings["city"].get(city, 0.0),
        encodings["type"].get(prop_type, 0.0),
        encodings["region"].get(region, 0.0),
        1.0 if _has_keyword(amenities, ["water"]) else 0.0,
        1.0 if _has_keyword(amenities, ["electric", "power"]) else 0.0,
        1.0 if _has_keyword(amenities, ["security", "guard", "cctv"]) else 0.0,
        1.0 if _has_keyword(amenities, ["wifi", "internet"]) else 0.0,
        1.0 if _has_keyword(amenities, ["ac", "air condition", "aircond"]) else 0.0,
        _num("floor"),
        _num("yearBuilt"),
        1.0 if input_data.get("stayType") == "short_stay" else 0.0,
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
