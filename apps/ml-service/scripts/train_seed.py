#!/usr/bin/env python3
"""Generate seed data and/or train the pricing model offline.

Usage (from ml-service/):

    # Generate 5,000 listings, save the dataset, train, and persist the model
    python scripts/train_seed.py --count 5000 --save-dataset

    # Just generate the dataset JSON (no training)
    python scripts/train_seed.py --count 2500 --save-dataset --no-train
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.config import get_settings  # noqa: E402
from app.ml.model import rent_price_model  # noqa: E402
from app.seed.generator import dataset_stats, generate_properties  # noqa: E402


def main() -> None:
    settings = get_settings()

    parser = argparse.ArgumentParser(description="Seed-data generator + trainer")
    parser.add_argument("--count", type=int, default=settings.seed_count, help="number of listings to generate")
    parser.add_argument("--seed", type=int, default=settings.seed_rng_seed, help="RNG seed (deterministic)")
    parser.add_argument("--save-dataset", action="store_true", help="write seed-data/pricing-seed.json")
    parser.add_argument("--no-train", action="store_true", help="skip model training")
    parser.add_argument("--verbose", action="store_true", help="log training epochs")
    args = parser.parse_args()

    properties = generate_properties(args.count, args.seed)
    stats = dataset_stats(properties)
    print(f"[seed] generated {stats['count']} listings | "
          f"rent GHS {stats['rentMin']:,.0f}–{stats['rentMax']:,.0f} "
          f"(mean {stats['rentMean']:,.0f}) | "
          f"{stats['cities']} cities, {stats['types']} types")
    print(f"[seed] top cities: {stats['topCities']}")

    if args.save_dataset:
        out = os.path.join(os.path.dirname(__file__), "..", "seed-data", "pricing-seed.json")
        with open(out, "w") as f:
            json.dump({"meta": stats, "properties": properties}, f, indent=2)
        print(f"[seed] dataset written to {os.path.normpath(out)}")

    if not args.no_train:
        rent_price_model.train(properties, verbose=args.verbose)
        rent_price_model.save(settings.model_path)
        status = rent_price_model.get_status()
        print(f"[train] R²={status['r2Score']} over {status['epochs']} epochs "
              f"on {status['sampleCount']} samples → saved to {settings.model_path}")


if __name__ == "__main__":
    main()
