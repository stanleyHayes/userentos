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
import warnings
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

# Ceiling on a predicted rent (GHS/month). Far above any real Ghanaian rent;
# it exists only so an extreme input cannot overflow exp() into inf.
MAX_RENT = 1e12
MAX_LOG_RENT = float(np.log(MAX_RENT))

# A feature column whose training std falls below this carries no signal; see
# _train_unlocked. Mirrors the 1e-6 threshold in pricingModel.ts.
CONSTANT_STD_EPS = 1e-6


def _nanmean(X: np.ndarray) -> np.ndarray:
    """Column means ignoring NaN; an all-NaN column yields NaN, not a warning."""
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", category=RuntimeWarning)
        return np.nanmean(X, axis=0)


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
        # Guarded here as well as in the request schema: a non-positive
        # max_epochs skips the gradient loop entirely and would mark the
        # randomly initialised weights as a trained model. scripts/ calls
        # train() directly and never sees the schema.
        if max_epochs < 1:
            raise ValueError(f"max_epochs must be at least 1, got {max_epochs}")
        if patience < 1:
            raise ValueError(f"patience must be at least 1, got {patience}")

        valid = [p for p in properties if float(p.get("rentAmount", 0) or 0) > 0]
        if len(valid) < 20:
            raise ValueError(f"Need at least 20 properties, got {len(valid)}")

        self.encodings = compute_encodings(valid)

        X = np.array(
            [extract_features_from_property(p, self.encodings) for p in valid],
            dtype=np.float64,
        )
        y = np.array([float(p["rentAmount"]) for p in valid], dtype=np.float64)

        # Impute "unknown" (NaN from features.MISSING) with the column mean,
        # which is the neutral value: the bias term below subtracts
        # weights @ feature_means, so an imputed feature contributes exactly
        # what the bias takes back out and the estimate falls through to what
        # the other features say. Mongo documents routinely omit floorArea or
        # yearBuilt, and those rows used to train the model on a literal 0.
        column_means = np.nan_to_num(_nanmean(X), nan=0.0)
        X = np.where(np.isnan(X), column_means, X)

        n, m = X.shape

        # Train on log(rent): rents are multiplicative, so the log transform
        # makes the linear model's job honest and keeps predictions positive.
        y_target = np.log(y)

        # Feature + target normalisation.
        #
        # A column that does not vary across the training set carries no
        # signal, and its divisor has to be held at 1. The previous
        # (std + 1e-8) divisor multiplied such a column's weight by ~1e8 when
        # de-normalising below, so any prediction where that feature DID vary
        # landed at exp(+/-1e7): a rent of 0, or inf -- and inf then raises
        # OverflowError in round(), i.e. a 500. Real datasets hit this easily
        # (every listing quoting the same advance, every flat wired for
        # electricity), and it corrupted predictions rather than erroring.
        #
        # pricingModel.ts guards this on both counts and the port dropped
        # both; CONSTANT_STD_EPS matches its absolute 1e-6 floor, with a
        # relative term added for the target-mean encodings, whose values run
        # into the thousands.
        self.feature_means = X.mean(axis=0)
        raw_stds = X.std(axis=0)
        constant = raw_stds < np.maximum(CONSTANT_STD_EPS, 1e-9 * np.abs(self.feature_means))
        self.feature_stds = np.where(constant, 1.0, raw_stds)
        X_norm = (X - self.feature_means) / self.feature_stds

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

        # Constant columns were all-zero after normalisation, so their
        # gradient was zero throughout and their weight is still the random
        # init (shrunk by L2). Training gave them no influence; drop them
        # explicitly so prediction agrees.
        self.weights[constant] = 0.0

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
        # Same imputation as training. Without it an omitted optional field
        # entered the model as 0 — "unknown year built" priced as year 0 —
        # and the caller got a confident, badly low number with no warning.
        # Legacy artifacts without usable means fall back to 0 as before.
        if self.feature_means is not None and self.feature_means.shape == features.shape:
            features = np.where(np.isnan(features), self.feature_means, features)
        features = np.nan_to_num(features, nan=0.0)

        raw = float(features @ self.weights + self.bias)
        if self.target_transform == "log":
            # np.exp overflows to inf past ~709, and round(inf) raises
            # OverflowError -- a 500 instead of an answer. Clamp the exponent:
            # no request should be able to turn an out-of-range input into a
            # crash, and nothing above the cap is a rent either way.
            predicted = float(np.exp(min(raw + 0.5 * self.residual_variance, MAX_LOG_RENT)))
        else:  # legacy linear-in-price artifact
            predicted = raw
        if not np.isfinite(predicted):
            predicted = 0.0
        predicted = min(max(0.0, predicted), MAX_RENT)

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
        # Parsed into locals first and committed in one block at the end: a
        # half-read artifact used to leave the live model spliced together
        # from two versions -- new weights, old encodings, is_trained still
        # True -- and load() returned False while /predict quietly served
        # nonsense. A failed load must leave the running model untouched.
        try:
            with open(file_path) as f:
                state = json.load(f)
            weights = np.array(state["weights"], dtype=np.float64)
            bias = float(state["bias"])
            feature_means = np.array(state["featureMeans"], dtype=np.float64)
            feature_stds = np.array(state["featureStds"], dtype=np.float64)
            encodings = state["encodings"]
            trained_at = state["trainedAt"]
            sample_count = int(state["sampleCount"])
            final_loss = float(state["finalLoss"])
            r2_score = float(state["r2Score"])
            epochs = int(state["epochs"])
            target_transform = state.get("targetTransform", "linear")
            residual_variance = float(state.get("residualVariance", 0.0))
            if weights.ndim != 1 or weights.shape[0] != len(FEATURE_NAMES):
                raise ValueError(
                    f"artifact has {weights.shape} weights, "
                    f"expected {len(FEATURE_NAMES)}"
                )
            if not np.all(np.isfinite(weights)) or not np.isfinite(bias):
                raise ValueError("artifact contains non-finite weights")
        except Exception as exc:  # corrupt or incompatible artifact
            logger.warning("Failed to load model from %s: %s", file_path, exc)
            return False

        self.weights = weights
        self.bias = bias
        self.feature_means = feature_means
        self.feature_stds = feature_stds
        self.encodings = encodings
        self.trained_at = trained_at
        self.sample_count = sample_count
        self.final_loss = final_loss
        self.r2_score = r2_score
        self.epochs = epochs
        self.target_transform = target_transform
        self.residual_variance = residual_variance
        self.is_trained = True
        return True

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
