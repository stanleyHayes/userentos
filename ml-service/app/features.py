"""Feature extraction for the rent pricing ML model.

Ported from server/src/services/ml/features.ts
"""

from typing import List, Dict, Any

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


def _has_keyword(items: List[str] | None, keywords: List[str]) -> bool:
    if not items:
        return False
    lower = [s.lower() for s in items]
    return any(k.lower() in s for k in keywords for s in lower)


def compute_encodings(properties: List[Dict[str, Any]]) -> Dict[str, Dict[str, float]]:
    city_sums: Dict[str, Dict[str, float]] = {}
    type_sums: Dict[str, Dict[str, float]] = {}
    region_sums: Dict[str, Dict[str, float]] = {}

    for p in properties:
        rent = float(p.get("rentAmount", 0))
        if rent <= 0:
            continue

        city = str(p.get("address", {}).get("city", "")).lower().strip()
        prop_type = str(p.get("type", "")).lower().strip()
        region = str(p.get("address", {}).get("region", "")).lower().strip()

        if city:
            city_sums.setdefault(city, {"sum": 0.0, "count": 0})
            city_sums[city]["sum"] += rent
            city_sums[city]["count"] += 1
        if prop_type:
            type_sums.setdefault(prop_type, {"sum": 0.0, "count": 0})
            type_sums[prop_type]["sum"] += rent
            type_sums[prop_type]["count"] += 1
        if region:
            region_sums.setdefault(region, {"sum": 0.0, "count": 0})
            region_sums[region]["sum"] += rent
            region_sums[region]["count"] += 1

    total_rent = sum(float(p.get("rentAmount", 0)) for p in properties)
    global_mean = total_rent / len(properties) if properties else 0.0

    def to_means(sums: Dict[str, Dict[str, float]]) -> Dict[str, float]:
        return {
            k: (v["sum"] / v["count"] if v["count"] > 0 else global_mean)
            for k, v in sums.items()
        }

    return {
        "city": to_means(city_sums),
        "type": to_means(type_sums),
        "region": to_means(region_sums),
    }


def extract_features(
    input_data: Dict[str, Any],
    encodings: Dict[str, Dict[str, float]],
) -> List[float]:
    city = str(input_data.get("city", "")).lower().strip()
    prop_type = str(input_data.get("type", "")).lower().strip()
    region = str(input_data.get("region", "")).lower().strip()
    amenities = input_data.get("amenities") or []

    def _num(key: str) -> float:
        v = input_data.get(key)
        return float(v) if v is not None else 0.0

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
    property_data: Dict[str, Any],
    encodings: Dict[str, Dict[str, float]],
) -> List[float]:
    return extract_features(
        {
            "bedrooms": property_data.get("bedrooms"),
            "bathrooms": property_data.get("bathrooms"),
            "floorArea": property_data.get("floorArea"),
            "furnished": property_data.get("furnished"),
            "parkingSpaces": property_data.get("parkingSpaces"),
            "advanceMonths": property_data.get("advanceMonths"),
            "amenities": property_data.get("amenities"),
            "city": property_data.get("address", {}).get("city", ""),
            "type": property_data.get("type", ""),
            "region": property_data.get("address", {}).get("region"),
            "floor": property_data.get("floor"),
            "yearBuilt": property_data.get("yearBuilt"),
            "stayType": property_data.get("stayType"),
        },
        encodings,
    )
