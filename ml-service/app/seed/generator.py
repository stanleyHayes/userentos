"""Deterministic generator for realistic Ghanaian rental listings.

Produces property documents in the same nested shape the Node server
sends to POST /train (address.city / address.region / rentAmount, ...),
so generated data can be mixed with production data seamlessly.

Rents follow a plausible pricing model — city tier × property type base ×
size/amenity factors × log-normal noise — which gives the regression
something real to learn (typical R² ≈ 0.75–0.85 at 2,500 samples with the
pure-linear model; the multiplicative market structure sets the ceiling).
"""

import random
from typing import Any

from app.seed.pools import (
    AMENITY_POOL,
    BEDROOM_RANGES,
    CITIES,
    NEIGHBORHOODS,
    PROPERTY_TYPES,
    REGIONS_BY_CITY,
)

DEFAULT_COUNT = 2500
DEFAULT_SEED = 20260714

# Bedroom surcharges stack on the type base rent.
BEDROOM_FACTOR = 0.30
BATHROOM_FACTOR = 0.10
FURNISHED_UPLIFT = 1.18
PARKING_FACTOR = 0.035
AMENITY_FACTOR = 0.012
SHORT_STAY_UPLIFT = 1.45


def _weighted_choice(rng: random.Random, items: list[tuple]) -> tuple:
    """Pick one row; the last element of each row is its sampling weight."""
    weights = [i[-1] for i in items]
    return rng.choices(items, weights=weights, k=1)[0]


def _estimate_rent(
    rng: random.Random,
    base: float,
    tier: float,
    bedrooms: int,
    bathrooms: int,
    floor_area: float,
    furnished: bool,
    parking: int,
    amenity_count: int,
    short_stay: bool,
) -> float:
    rent = base * tier
    rent *= 1.0 + BEDROOM_FACTOR * max(0, bedrooms - 1)
    rent *= 1.0 + BATHROOM_FACTOR * max(0, bathrooms - 1)
    rent *= max(0.6, (floor_area / 70.0)) ** 0.25
    if furnished:
        rent *= FURNISHED_UPLIFT
    rent *= 1.0 + PARKING_FACTOR * parking
    rent *= 1.0 + AMENITY_FACTOR * amenity_count
    if short_stay:
        rent *= SHORT_STAY_UPLIFT
    # Multiplicative market noise (±~25%).
    rent *= rng.lognormvariate(0.0, 0.12)
    # Listings round to the nearest GHS 50 in practice.
    return max(150.0, round(rent / 50.0) * 50.0)


def generate_properties(count: int = DEFAULT_COUNT, seed: int = DEFAULT_SEED) -> list[dict[str, Any]]:
    """Generate `count` realistic property documents (deterministic)."""
    rng = random.Random(seed)
    properties: list[dict[str, Any]] = []

    for i in range(count):
        city, _, tier, _ = _weighted_choice(rng, CITIES)
        prop_type, base, _ = _weighted_choice(rng, PROPERTY_TYPES)

        bed_min, bed_max = BEDROOM_RANGES[prop_type]
        bedrooms = rng.randint(bed_min, bed_max)
        bathrooms = min(bedrooms, rng.randint(1, max(1, bedrooms))) if bedrooms > 0 else rng.randint(0, 1)
        floor_area = round(rng.uniform(18, 45) + bedrooms * rng.uniform(18, 42), 1)
        furnished = rng.random() < (0.35 if prop_type in ("apartment", "house", "townhouse") else 0.12)
        parking = rng.choices([0, 1, 2, 3], weights=[0.35, 0.4, 0.18, 0.07])[0]
        amenity_count = min(
            len(AMENITY_POOL),
            max(2, int(rng.gauss(7 + tier * 3, 3))),
        )
        amenities = sorted(rng.sample(AMENITY_POOL, amenity_count))
        short_stay = rng.random() < 0.08

        rent = _estimate_rent(
            rng, base, tier, bedrooms, bathrooms, floor_area,
            furnished, parking, amenity_count, short_stay,
        )

        neighborhood = rng.choice(NEIGHBORHOODS.get(city, [city]))
        properties.append(
            {
                "id": f"seed-prop-{i + 1:05d}",
                "title": f"{bedrooms or 1}-Bedroom {prop_type.replace('_', ' ').title()} in {neighborhood}",
                "type": prop_type,
                "bedrooms": bedrooms,
                "bathrooms": bathrooms,
                "floorArea": floor_area,
                "furnished": furnished,
                "parkingSpaces": parking,
                "advanceMonths": rng.choices([1, 2, 3, 6, 12, 24], weights=[0.05, 0.3, 0.25, 0.2, 0.12, 0.08])[0],
                "amenities": amenities,
                "floor": rng.randint(0, 14) if prop_type in ("apartment", "commercial", "studio") else 0,
                "yearBuilt": rng.randint(1985, 2026),
                "stayType": "short_stay" if short_stay else "long_stay",
                "rentAmount": rent,
                "address": {
                    "city": city,
                    "region": REGIONS_BY_CITY[city],
                    "neighborhood": neighborhood,
                    "street": f"{rng.choice(['1st', '2nd', '3rd', '5th', 'Ring', 'Boundary', 'Market', 'Station', 'Hospital', 'School'])} Road",
                },
            }
        )

    return properties


def dataset_stats(properties: list[dict[str, Any]]) -> dict[str, Any]:
    """Quick summary of a generated dataset (used by scripts and logs)."""
    rents = [float(p["rentAmount"]) for p in properties]
    cities: dict[str, int] = {}
    types: dict[str, int] = {}
    for p in properties:
        cities[p["address"]["city"]] = cities.get(p["address"]["city"], 0) + 1
        types[p["type"]] = types.get(p["type"], 0) + 1
    return {
        "count": len(properties),
        "rentMin": min(rents),
        "rentMax": max(rents),
        "rentMean": round(sum(rents) / len(rents), 2),
        "cities": len(cities),
        "types": len(types),
        "topCities": dict(sorted(cities.items(), key=lambda kv: -kv[1])[:5]),
    }
