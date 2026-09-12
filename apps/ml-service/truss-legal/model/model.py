"""Baseten entrypoint for the rental-complaint classifier.

Thin wrapper. Feature hashing, calibration, per-label thresholds and the
abstention guard all live in `app.legal.classifier`, bundled via
external_package_dirs and shared with the FastAPI service and the tests.

What this model does NOT do is decide that a violation occurred. It names the
subject of a complaint; whether, say, an advance is lawful is arithmetic
against Rent Act s.25 and is done in the API's deterministic layer. A model
should not be the thing that tells someone their landlord committed a crime.
"""

import logging
import os
from typing import Any

from app.legal.classifier import ComplaintClassifier

logger = logging.getLogger(__name__)

ARTIFACT_NAME = "legal-classifier.npz"

#: Matches the API-side cap; an unbounded input is a CPU cost a public
#: endpoint should not accept.
MAX_BATCH = 50


class Model:
    def __init__(self, **kwargs: Any) -> None:
        self._data_dir = kwargs.get("data_dir")
        self._model: ComplaintClassifier | None = None

    def load(self) -> None:
        model = ComplaintClassifier()
        path = os.path.join(str(self._data_dir), ARTIFACT_NAME)
        if not model.load(path):
            # Fail at load rather than answering 503 to every request: a
            # deployment that cannot work should not report healthy.
            raise RuntimeError(f"No usable complaint classifier at {path}")
        self._model = model
        logger.info(
            "Loaded complaint classifier (trained %s, %d examples)",
            model.trained_at, model.sample_count,
        )

    def predict(self, model_input: dict[str, Any]) -> dict[str, Any]:
        if self._model is None:
            raise RuntimeError("Model not loaded")

        texts = model_input.get("texts")
        if isinstance(texts, list):
            if len(texts) > MAX_BATCH:
                return {"error": f"Batch size is limited to {MAX_BATCH} items"}
            return {"results": [self._one(t) for t in texts]}

        return self._one(model_input.get("text", ""))

    def _one(self, text: str) -> dict[str, Any]:
        assert self._model is not None
        try:
            return self._model.predict(str(text))
        except Exception as exc:
            logger.warning("Classification failed: %s", exc)
            return {"error": "classification failed for this item"}
