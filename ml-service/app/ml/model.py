"""Rent price prediction model — pure NumPy linear regression.

Mirrors server/src/services/ml/pricingModel.ts, with one deliberate
upgrade: training runs on log(rent) because Ghanaian rents are
multiplicative in structure (city tier x type x size factors). Predictions
exponentiate back into price space with a log-normal smearing correction,
and R2 is always reported in price space. Artifacts written by the older
linear-in-price model still load (targetTransform defaults to "linear").
"""

import json
import os
import threading
from datetime import UTC, datetime
from typing import Any

import numpy as np

from app.core.logging import get_logger
from app.ml.features import (
    FEATURE_NAMES,
    EncodingMaps,
    compute_encodings,
    extract_features,
    extract_features_from_property,
)

logger = get_logger(__name__)

# Deterministic weight initialisation so training runs are reproducible.
WEIGHT_INIT_SEED = 42


class RentPriceModel:
    """Normalised linear regression over the pricing feature vector."""

    def __init__(self) -> None:
        self.weights: np.ndarray | None = None
        self.bias: float = 0.0
        self.feature_means: np.ndarray | None = None
        self.feature_stds: np.ndarray | None = None
        self.encodings: EncodingMaps = {"city": {}, "type": {}, "region": {}}
        self.trained_at: str = ""
        self.sample_count: int = 0
        self.final_loss: float = 0.0
        self.r2_score: float = 0.0
        self.epochs: int = 0
        self.is_trained: bool = False
        self.target_transform: str = "log"
        self.residual_variance: float = 0.0
        self._target_mean: float = 0.0
        self._target_std: float = 1.0
        # Guards train/reload vs predict/status — the singleton is shared across
        # FastAPI's threadpool, so unsynchronized mutation raced with reads.
        self._lock = threading.RLock()

    # ── Training ────────────────────────────────────────────────────────

    def _train_unlocked(
        self,
        properties: list[dict[str, Any]],
        max_epochs: int = 10000,
        learning_rate: float = 0.01,
        lr_decay: float = 0.9995,
        l2_lambda: float = 0.001,
        min_improvement: float = 1e-6,
        patience: int = 500,
        verbose: bool = False,
    ) -> None:
        valid = [p for p in properties if float(p.get("rentAmount", 0) or 0) > 0]
        if len(valid) < 20:
            raise ValueError(f"Need at least 20 properties, got {len(valid)}")

        self.encodings = compute_encodings(valid)

        X = np.array(
            [extract_features_from_property(p, self.encodings) for p in valid],
            dtype=np.float64,
        )
        y = np.array([float(p["rentAmount"]) for p in valid], dtype=np.float64)

        n, m = X.shape

        # Train on log(rent): rents are multiplicative, so the log transform
        # makes the linear model's job honest and keeps predictions positive.
        y_target = np.log(y)

        # Feature + target normalisation.
        self.feature_means = X.mean(axis=0)
        self.feature_stds = X.std(axis=0) + 1e-8
        stds = np.where(self.feature_stds == 0, 1.0, self.feature_stds)
        X_norm = (X - self.feature_means) / stds

        self._target_mean = float(y_target.mean())
        self._target_std = float(y_target.std()) + 1e-8
        y_norm = (y_target - self._target_mean) / self._target_std

        # Deterministic Xavier-like init.
        rng = np.random.default_rng(WEIGHT_INIT_SEED)
        self.weights = rng.standard_normal(m) * np.sqrt(2.0 / m)
        self.bias = 0.0

        best_loss = float("inf")
        stale_epochs = 0
        lr = learning_rate
        epoch = 0

        for epoch in range(max_epochs):
            errors = X_norm @ self.weights + self.bias - y_norm

            self.weights -= lr * ((X_norm.T @ errors) / n + l2_lambda * self.weights)
            self.bias -= lr * float(errors.mean())

            loss = float(np.mean(errors**2))
            lr *= lr_decay

            if loss < best_loss - min_improvement:
                best_loss = loss
                stale_epochs = 0
            else:
                stale_epochs += 1
                if stale_epochs >= patience:
                    if verbose:
                        logger.info("Early stop at epoch %d, loss: %.6f", epoch, loss)
                    break

            if verbose and epoch % 1000 == 0:
                logger.info("Epoch %d, loss: %.6f, lr: %.6f", epoch, loss, lr)

        # De-normalise weights so predict() works on raw features (log space).
        self.weights = (self.weights * self._target_std) / self.feature_stds
        self.bias = (
            self.bias * self._target_std
            + self._target_mean
            - float(self.weights @ self.feature_means)
        )
        self.target_transform = "log"

        # Log-normal smearing correction: E[y] = exp(mu + sigma^2 / 2).
        log_resid = y_target - (X @ self.weights + self.bias)
        self.residual_variance = float(np.var(log_resid))

        # R2 always reported in price space.
        preds = np.exp(X @ self.weights + self.bias + 0.5 * self.residual_variance)
        ss_tot = float(np.sum((y - y.mean()) ** 2))
        ss_res = float(np.sum((y - preds) ** 2))
        self.r2_score = 1.0 - ss_res / ss_tot if ss_tot > 0 else 0.0

        self.final_loss = best_loss
        self.epochs = epoch + 1
        self.sample_count = n
        self.trained_at = datetime.now(UTC).isoformat()
        self.is_trained = True

        logger.info(
            "Training complete: %d samples, %d epochs, R²=%.4f, loss=%.6f",
            n, self.epochs, self.r2_score, self.final_loss,
        )

    # ── Prediction ──────────────────────────────────────────────────────

    def _predict_unlocked(self, input_data: dict[str, Any]) -> dict[str, Any]:
        if not self.is_trained or self.weights is None:
            raise RuntimeError("Model not trained")

        features = np.array(extract_features(input_data, self.encodings), dtype=np.float64)
        raw = float(features @ self.weights + self.bias)
        if self.target_transform == "log":
            predicted = float(np.exp(raw + 0.5 * self.residual_variance))
        else:  # legacy linear-in-price artifact
            predicted = raw
        predicted = max(0.0, predicted)

        uncertainty = 0.2 * (1.0 - max(0.0, self.r2_score)) + 0.05
        margin = predicted * uncertainty

        contributions = [
            {"feature": FEATURE_NAMES[i], "contribution": float(self.weights[i] * features[i])}
            for i in range(len(FEATURE_NAMES))
        ]
        contributions.sort(key=lambda c: abs(c["contribution"]), reverse=True)

        return {
            "predictedRent": round(predicted),
            "confidenceInterval": {
                "low": round(max(0.0, predicted - margin)),
                "high": round(predicted + margin),
            },
            "featureContributions": contributions,
            "modelVersion": self.trained_at,
            "r2Score": round(self.r2_score, 3),
            "sampleCount": self.sample_count,
        }

    # ── Persistence ─────────────────────────────────────────────────────

    def _save_unlocked(self, file_path: str) -> None:
        if not self.is_trained or self.weights is None:
            raise RuntimeError("Cannot save untrained model")

        os.makedirs(os.path.dirname(file_path) or ".", exist_ok=True)
        state = {
            "weights": self.weights.tolist(),
            "bias": self.bias,
            "featureMeans": self.feature_means.tolist() if self.feature_means is not None else [],
            "featureStds": self.feature_stds.tolist() if self.feature_stds is not None else [],
            "encodings": self.encodings,
            "trainedAt": self.trained_at,
            "sampleCount": self.sample_count,
            "finalLoss": self.final_loss,
            "r2Score": self.r2_score,
            "epochs": self.epochs,
            "featureNames": list(FEATURE_NAMES),
            "targetTransform": self.target_transform,
            "residualVariance": self.residual_variance,
        }
        with open(file_path, "w") as f:
            json.dump(state, f, indent=2)

    def _load_unlocked(self, file_path: str) -> bool:
        if not os.path.exists(file_path):
            return False
        try:
            with open(file_path) as f:
                state = json.load(f)
            self.weights = np.array(state["weights"], dtype=np.float64)
            self.bias = float(state["bias"])
            self.feature_means = np.array(state["featureMeans"], dtype=np.float64)
            self.feature_stds = np.array(state["featureStds"], dtype=np.float64)
            self.encodings = state["encodings"]
            self.trained_at = state["trainedAt"]
            self.sample_count = int(state["sampleCount"])
            self.final_loss = float(state["finalLoss"])
            self.r2_score = float(state["r2Score"])
            self.epochs = int(state["epochs"])
            self.target_transform = state.get("targetTransform", "linear")
            self.residual_variance = float(state.get("residualVariance", 0.0))
            self.is_trained = True
            return True
        except Exception as exc:  # corrupt or incompatible artifact
            logger.warning("Failed to load model from %s: %s", file_path, exc)
            return False

    def _get_status_unlocked(self) -> dict[str, Any]:
        return {
            "isTrained": self.is_trained,
            "trainedAt": self.trained_at,
            "sampleCount": self.sample_count,
            "r2Score": round(self.r2_score, 3),
            "epochs": self.epochs,
            "finalLoss": round(self.final_loss, 6),
        }

    # ── Locked public API ────────────────────────────────────────────────
    # All state-mutating/reading entry points serialize on self._lock.

    def train(self, *args: Any, **kwargs: Any) -> None:
        with self._lock:
            self._train_unlocked(*args, **kwargs)

    def predict(self, input_data: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            return self._predict_unlocked(input_data)

    def save(self, file_path: str) -> None:
        with self._lock:
            self._save_unlocked(file_path)

    def load(self, file_path: str) -> bool:
        with self._lock:
            return self._load_unlocked(file_path)

    def get_status(self) -> dict[str, Any]:
        with self._lock:
            return self._get_status_unlocked()


# Process-wide singleton — the API layer accesses it through app.api.deps.
rent_price_model = RentPriceModel()
