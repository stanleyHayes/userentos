"""Rent price prediction model — pure NumPy implementation.

Ported from server/src/services/ml/pricingModel.ts
"""

import json
import os
from typing import List, Dict, Any, Optional
from datetime import datetime
import numpy as np
from app.features import (
    compute_encodings,
    extract_features_from_property,
    extract_features,
    FEATURE_NAMES,
)

DEFAULT_MODEL_PATH = os.environ.get("MODEL_PATH", "data/pricing-model.json")


class RentPriceModel:
    def __init__(self):
        self.weights: Optional[np.ndarray] = None
        self.bias: float = 0.0
        self.feature_means: Optional[np.ndarray] = None
        self.feature_stds: Optional[np.ndarray] = None
        self.encodings: Dict[str, Dict[str, float]] = {"city": {}, "type": {}, "region": {}}
        self.trained_at: str = ""
        self.sample_count: int = 0
        self.final_loss: float = 0.0
        self.r2_score: float = 0.0
        self.epochs: int = 0
        self.is_trained: bool = False
        self._target_mean: float = 0.0
        self._target_std: float = 1.0

    def _normalize(self, features: np.ndarray) -> np.ndarray:
        if self.feature_means is None or self.feature_stds is None:
            return features
        stds = np.where(self.feature_stds == 0, 1.0, self.feature_stds)
        return (features - self.feature_means) / stds

    def train(
        self,
        properties: List[Dict[str, Any]],
        max_epochs: int = 10000,
        learning_rate: float = 0.01,
        lr_decay: float = 0.9995,
        l2_lambda: float = 0.001,
        min_improvement: float = 1e-6,
        patience: int = 500,
        verbose: bool = False,
    ) -> None:
        valid = [p for p in properties if float(p.get("rentAmount", 0)) > 0]
        if len(valid) < 20:
            raise ValueError(f"Need at least 20 properties, got {len(valid)}")

        self.encodings = compute_encodings(valid)

        X = np.array([extract_features_from_property(p, self.encodings) for p in valid], dtype=np.float64)
        y = np.array([float(p["rentAmount"]) for p in valid], dtype=np.float64)

        n, m = X.shape

        # Feature normalization
        self.feature_means = X.mean(axis=0)
        self.feature_stds = X.std(axis=0) + 1e-8
        X_norm = self._normalize(X)

        # Target normalization
        self._target_mean = y.mean()
        self._target_std = y.std() + 1e-8
        y_norm = (y - self._target_mean) / self._target_std

        # Xavier-like init
        self.weights = np.random.randn(m) * np.sqrt(2.0 / m)
        self.bias = 0.0

        best_loss = float("inf")
        epochs_without_improvement = 0
        lr = learning_rate

        for epoch in range(max_epochs):
            predictions = X_norm @ self.weights + self.bias
            errors = predictions - y_norm

            dw = (X_norm.T @ errors) / n + l2_lambda * self.weights
            db = errors.mean()

            self.weights -= lr * dw
            self.bias -= lr * db

            loss = float(np.mean(errors ** 2))
            lr *= lr_decay

            if loss < best_loss - min_improvement:
                best_loss = loss
                epochs_without_improvement = 0
            else:
                epochs_without_improvement += 1

            if epochs_without_improvement >= patience:
                if verbose:
                    print(f"[ML] Early stop at epoch {epoch}, loss: {loss:.6f}")
                break

            if verbose and epoch % 1000 == 0:
                print(f"[ML] Epoch {epoch}, loss: {loss:.6f}, lr: {lr:.6f}")

        # De-normalize weights for direct raw prediction
        self.weights = (self.weights * self._target_std) / self.feature_stds
        self.bias = (
            self.bias * self._target_std
            + self._target_mean
            - float(np.dot(self.weights, self.feature_means))
        )

        # R²
        preds = X @ self.weights + self.bias
        ss_tot = float(np.sum((y - y.mean()) ** 2))
        ss_res = float(np.sum((y - preds) ** 2))
        self.r2_score = 1.0 - ss_res / ss_tot if ss_tot > 0 else 0.0

        self.final_loss = best_loss
        self.epochs = epoch + 1
        self.sample_count = n
        self.trained_at = datetime.utcnow().isoformat() + "Z"
        self.is_trained = True

        if verbose:
            print(
                f"[ML] Training complete: {n} samples, {self.epochs} epochs, "
                f"R²={self.r2_score:.4f}, loss={self.final_loss:.6f}"
            )

    def predict(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        if not self.is_trained or self.weights is None:
            raise RuntimeError("Model not trained")

        features = np.array(extract_features(input_data, self.encodings), dtype=np.float64)
        predicted_rent = float(features @ self.weights + self.bias)
        clamped_rent = max(0.0, predicted_rent)

        uncertainty = 0.2 * (1.0 - max(0.0, self.r2_score)) + 0.05
        margin = clamped_rent * uncertainty

        contributions = [
            {"feature": FEATURE_NAMES[i], "contribution": float(self.weights[i] * features[i])}
            for i in range(len(FEATURE_NAMES))
        ]
        contributions.sort(key=lambda x: abs(x["contribution"]), reverse=True)

        return {
            "predictedRent": round(clamped_rent),
            "confidenceInterval": {
                "low": round(max(0.0, clamped_rent - margin)),
                "high": round(clamped_rent + margin),
            },
            "featureContributions": contributions,
            "modelVersion": self.trained_at,
            "r2Score": round(self.r2_score, 3),
            "sampleCount": self.sample_count,
        }

    def save(self, file_path: str = DEFAULT_MODEL_PATH) -> None:
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
        }
        with open(file_path, "w") as f:
            json.dump(state, f, indent=2)

    def load(self, file_path: str = DEFAULT_MODEL_PATH) -> bool:
        if not os.path.exists(file_path):
            return False
        try:
            with open(file_path, "r") as f:
                state = json.load(f)
            self.weights = np.array(state["weights"], dtype=np.float64)
            self.bias = state["bias"]
            self.feature_means = np.array(state["featureMeans"], dtype=np.float64)
            self.feature_stds = np.array(state["featureStds"], dtype=np.float64)
            self.encodings = state["encodings"]
            self.trained_at = state["trainedAt"]
            self.sample_count = state["sampleCount"]
            self.final_loss = state["finalLoss"]
            self.r2_score = state["r2Score"]
            self.epochs = state["epochs"]
            self.is_trained = True
            return True
        except Exception:
            return False

    def get_status(self) -> Dict[str, Any]:
        return {
            "isTrained": self.is_trained,
            "trainedAt": self.trained_at,
            "sampleCount": self.sample_count,
            "r2Score": round(self.r2_score, 3),
            "epochs": self.epochs,
            "finalLoss": round(self.final_loss, 6),
        }


# Singleton
rent_price_model = RentPriceModel()
