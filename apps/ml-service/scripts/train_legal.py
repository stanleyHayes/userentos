#!/usr/bin/env python3
"""Train and evaluate the rental-complaint classifier.

    python scripts/train_legal.py            # train, evaluate, save
    python scripts/train_legal.py --no-save  # evaluate only

The split is deliberate and is the whole methodology:

  TRAIN       generated variants only (app/legal/augment.py)
  CALIBRATE   half the hand-written corpus — sets thresholds and Platt scaling
  TEST        the other half — never seen by training or calibration

Training on generated text and reporting on generated text gives micro-F1
0.985, which is meaningless: a held-out generated example shares its grammar
with the training ones, so it measures whether the model memorised a template.
The same model scored 0.77 on unseen hand-written phrasing and raised a false
accusation on 13 of 34 lawful situations. The numbers this script prints are
from human-written text the model has never been fitted to.

The headline number to watch is FALSE ACCUSATIONS: lawful or neutral
situations that drew at least one predicted violation. That is the error that
sends a tenant to Rent Control to accuse a landlord who did nothing wrong, and
it is weighted above recall everywhere in this model.
"""

import argparse
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.config import get_settings  # noqa: E402
from app.legal.augment import generate  # noqa: E402
from app.legal.classifier import ComplaintClassifier  # noqa: E402
from app.legal.corpus import TRAINING_EXAMPLES  # noqa: E402
from app.legal.taxonomy import LABEL_KEYS  # noqa: E402

SPLIT_SEED = 7


def split_human(examples, fraction=0.5):
    """Halve the hand-written corpus into calibration and test."""
    rng = np.random.default_rng(SPLIT_SEED)
    order = rng.permutation(len(examples))
    shuffled = [examples[i] for i in order]
    cut = int(len(shuffled) * fraction)
    return shuffled[:cut], shuffled[cut:]


def evaluate(model, examples, title):
    Y = model._label_matrix([labels for _, labels in examples])
    probs = np.array([
        [s["probability"] for s in sorted(model.predict(t)["scores"],
                                          key=lambda x: LABEL_KEYS.index(x["label"]))]
        for t, _ in examples
    ])
    pred = probs >= model.thresholds

    tp = float(np.sum(pred & (Y == 1)))
    fp = float(np.sum(pred & (Y == 0)))
    fn = float(np.sum(~pred & (Y == 1)))
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0

    lawful = np.array([len(labels) == 0 for _, labels in examples])
    false_accusations = int(np.sum(pred[lawful].any(axis=1))) if lawful.any() else 0
    lawful_total = int(lawful.sum())

    print(f"\n{title}  ({len(examples)} examples)")
    print(f"  precision {precision:.3f}   recall {recall:.3f}   micro-F1 {f1:.3f}")
    print(f"  false accusations on lawful/neutral text: {false_accusations}/{lawful_total}"
          f"  ({100 * false_accusations / lawful_total:.1f}%)" if lawful_total else "")

    print("  per label:")
    for j, key in enumerate(LABEL_KEYS):
        tpj = float(np.sum(pred[:, j] & (Y[:, j] == 1)))
        fpj = float(np.sum(pred[:, j] & (Y[:, j] == 0)))
        fnj = float(np.sum(~pred[:, j] & (Y[:, j] == 1)))
        pj = tpj / (tpj + fpj) if tpj + fpj else float("nan")
        rj = tpj / (tpj + fnj) if tpj + fnj else float("nan")
        support = int(np.sum(Y[:, j] == 1))
        print(f"    {key:24s} thr={model.thresholds[j]:.2f}  P={pj:.2f}  R={rj:.2f}  n={support}")

    return {"precision": precision, "recall": recall, "f1": f1,
            "falseAccusations": false_accusations, "lawfulTotal": lawful_total}


def main() -> None:
    parser = argparse.ArgumentParser(description="Train the rental-complaint classifier")
    parser.add_argument("--no-save", action="store_true", help="evaluate without writing the artifact")
    parser.add_argument("--epochs", type=int, default=1500)
    args = parser.parse_args()

    generated = generate()
    calibration, test = split_human(TRAINING_EXAMPLES)

    print(f"[corpus] {len(generated)} generated  |  "
          f"{len(calibration)} human calibration  |  {len(test)} human test")

    model = ComplaintClassifier()
    model.train(generated, calibration_set=calibration, epochs=args.epochs)

    evaluate(model, calibration, "CALIBRATION (thresholds fitted here)")
    results = evaluate(model, test, "TEST — human-written, never fitted to")

    if not args.no_save:
        settings = get_settings()
        path = settings.legal_model_path
        model.save(path)
        print(f"\n[save] artifact written to {path}")

    # A model that accuses lawful landlords is worse than no model. Fail the
    # run rather than quietly shipping it.
    if results["lawfulTotal"] and results["falseAccusations"] / results["lawfulTotal"] > 0.10:
        print("\n[FAIL] false-accusation rate above 10% on lawful text.")
        sys.exit(1)


if __name__ == "__main__":
    main()
