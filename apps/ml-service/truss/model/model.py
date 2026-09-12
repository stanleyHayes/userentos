"""Baseten entrypoint for the RentOS rent-pricing model.

Thin wrapper. Every decision that matters — feature extraction, imputation of
missing inputs, the log-space transform, attribution — lives in
`app.ml.model.RentPriceModel`, which is bundled via `external_package_dirs`
and shared with the FastAPI service and the test suite. This file only loads
the artifact and adapts the request/response shape.
"""

import logging
import os
from typing import Any

from app.ml.model import RentPriceModel

logger = logging.getLogger(__name__)

# The artifact ships in the Truss `data/` directory; Baseten mounts it and
# passes the path in as data_dir.
ARTIFACT_NAME = "pricing-model.json"


class Model:
    def __init__(self, **kwargs: Any) -> None:
        self._data_dir = kwargs.get("data_dir")
        self._model: RentPriceModel | None = None

    def load(self) -> None:
        model = RentPriceModel()
        path = os.path.join(str(self._data_dir), ARTIFACT_NAME)
        if not model.load(path):
            # Fail loudly at load rather than serving nonsense: an untrained
            # model would answer every request with "Model not trained", and
            # a deployment that cannot work should not report healthy.
            raise RuntimeError(f"No usable pricing model artifact at {path}")
        self._model = model
        logger.info(
            "Loaded pricing model (trained %s, R2=%.3f, %d samples)",
            model.trained_at, model.r2_score, model.sample_count,
        )

    def predict(self, model_input: dict[str, Any]) -> dict[str, Any]:
        """Value one property, or a batch of them.

        Accepts either a single property object or {"instances": [...]}, so a
        caller can amortise the request overhead without a second endpoint.
        """
        if self._model is None:
            raise RuntimeError("Model not loaded")

        instances = model_input.get("instances")
        if isinstance(instances, list):
            if len(instances) > 100:
                return {"error": "Batch size is limited to 100 items"}
            return {"predictions": [self._predict_one(item) for item in instances]}

        return self._predict_one(model_input)

    def _predict_one(self, item: dict[str, Any]) -> dict[str, Any]:
        assert self._model is not None
        try:
            return self._model.predict(item)
        except Exception as exc:
            logger.warning("Prediction failed: %s", exc)
            return {"error": "prediction failed for this item"}
