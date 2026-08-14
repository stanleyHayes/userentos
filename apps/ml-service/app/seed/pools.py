"""Ghanaian rental-market data pools for seed generation.

Rents are monthly GHS figures calibrated to 2025–2026 market reality
(per type, at a tier-1.0 city). City tiers scale them up/down.
"""

# ── Cities: (city, region, tier multiplier, weight) ─────────────────────
CITIES = [
    ("Accra", "Greater Accra", 1.45, 0.26),
    ("East Legon", "Greater Accra", 1.75, 0.06),
    ("Tema", "Greater Accra", 1.15, 0.08),
    ("Kasoa", "Central", 0.85, 0.06),
    ("Kumasi", "Ashanti", 1.0, 0.12),
    ("Takoradi", "Western", 0.9, 0.06),
    ("Cape Coast", "Central", 0.75, 0.05),
    ("Tamale", "Northern", 0.7, 0.05),
    ("Ho", "Volta", 0.65, 0.04),
    ("Sunyani", "Bono", 0.6, 0.04),
    ("Koforidua", "Eastern", 0.68, 0.04),
    ("Bolgatanga", "Upper East", 0.55, 0.03),
    ("Wa", "Upper West", 0.5, 0.03),
    ("Obuasi", "Ashanti", 0.72, 0.03),
    ("Winneba", "Central", 0.62, 0.03),
    ("Nkawkaw", "Eastern", 0.58, 0.02),
]

# ── Property types: (type, base rent GHS at tier 1.0, weight) ───────────
PROPERTY_TYPES = [
    ("room", 550, 0.14),
    ("shared_room", 380, 0.08),
    ("studio", 850, 0.12),
    ("hostel", 480, 0.06),
    ("apartment", 1450, 0.24),
    ("house", 2100, 0.16),
    ("townhouse", 2550, 0.08),
    ("commercial", 3200, 0.07),
    ("warehouse", 3800, 0.05),
]

# Typical bedroom ranges per type: (min, max)
BEDROOM_RANGES = {
    "room": (1, 1),
    "shared_room": (1, 1),
    "studio": (0, 1),
    "hostel": (1, 1),
    "apartment": (1, 4),
    "house": (2, 6),
    "townhouse": (2, 4),
    "commercial": (0, 3),
    "warehouse": (0, 1),
}

AMENITY_POOL = [
    "Water", "Electricity", "Security", "CCTV", "Wifi", "Air Conditioning",
    "Parking", "Backup Generator", "Borehole", "Poly Tank", "Fitted Kitchen",
    "Wardrobes", "Balcony", "Garden", "Swimming Pool", "Gym", "Elevator",
    "24hr Security", "Gated Community", "Prepaid Meter", "Tiled Floors",
    "POP Ceiling", "Hot Water", "Laundry Area", "Caretaker",
]

NEIGHBORHOODS = {
    "Accra": ["Osu", "Cantonments", "Airport Residential", "Labone", "Adabraka",
              "Dansoman", "Achimota", "Dzorwulu", "Abelenkpe", "Kaneshie"],
    "East Legon": ["East Legon Hills", "Adjiringanor", "American House", "Trasacco"],
    "Tema": ["Community 1", "Community 25", "Sakumono", "Baatsona", "Spintex"],
    "Kasoa": ["Kasoa New Town", "Millennium City", "Opeikuma", "Budumburam"],
    "Kumasi": ["Adum", "Ahodwo", "Asokwa", "Santasi", "Kronum", "Ayigya"],
    "Takoradi": ["Airport Ridge", "Anaji", "Effia", "Tanu Hill", "Beach Road"],
    "Cape Coast": ["Pedu", "Abura", "Kotokuraba", "Amamoma", "Ola Estate"],
    "Tamale": ["Changli", "Sagnarigu", "Kukuo", "Lamashegu", "Gumani"],
    "Ho": ["Ahoe", "Dome", "Bankoe", "Trafalgar", "Hloredi"],
    "Sunyani": ["Nkwabeng", "Abesim", "Baakoniaba", "Watchman", "Berlin Top"],
    "Koforidua": ["Betom", "Effiduase", "Srodae", "Nsuemu", "Oguaa"],
    "Bolgatanga": ["Zuarungu", "Soango", "Dapooretenga", "Atulbabisi"],
    "Wa": ["Dondoli", "Kpaguri", "Mangu", "Bamahu"],
    "Obuasi": ["Anyinam", "Kunka", "Tutuka", "Boete"],
    "Winneba": ["Low Cost", "Sankor", "Gyahadze", "Kojo Beedu"],
    "Nkawkaw": ["Akwasiho", "Ntabene", "Central Market", "Zongo"],
}

REGIONS_BY_CITY = {city: region for city, region, _, _ in CITIES}
