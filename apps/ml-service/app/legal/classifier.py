"""Multi-label complaint classifier — one-vs-rest logistic regression, NumPy.

Design notes that matter for serving this under traffic:

INFERENCE IS SPARSE. A complaint touches a few hundred of 262144 features, so
scoring is `W[:, present] @ values` — ten labels times a few hundred
multiply-adds, microseconds per request. Nothing is allocated at request time
beyond the feature dict. No GPU, no tokeniser process, no model server.

THE WEIGHTS ARE IMMUTABLE AFTER LOAD. Predict takes no lock because it never
mutates; train/load swap the matrix under one, and readers see either the old
array or the new one, never a half-written one. That is what lets the FastAPI
threadpool serve this concurrently.

PRECISION OVER RECALL. Per-label thresholds are tuned on a held-out split to
hit a precision floor, because the costly error here is telling a tenant that
their landlord committed a crime when they did not. A missed violation is
recoverable — the tenant is pointed at Rent Control regardless. A false
accusation is not.

CALIBRATION. Raw sigmoid outputs from a small corpus are overconfident, so
each label carries a Platt scaling fitted on held-out scores. The number the
API shows a user should mean something.
"""

import json
import os
import threading
from datetime import UTC, datetime
from typing import Any

import numpy as np

from app.core.logging import get_logger
from app.legal.corpus import TRAINING_EXAMPLES
from app.legal.taxonomy import LABEL_KEYS
from app.legal.text import N_FEATURES, contract_fingerprint, features

logger = get_logger(__name__)

TRAIN_SEED = 20260912

#: Minimum precision a label's threshold is tuned to reach on held-out data.
#: Below this the label abstains rather than asserting a violation.
TARGET_PRECISION = 0.95

#: Fallback when no threshold reaches TARGET_PRECISION on the held-out split.
#: Deliberately high: an untunable label should be quiet, not loud.
FALLBACK_THRESHOLD = 0.80

#: Positives a label needs in the calibration set before its tuned threshold
#: is trusted. Below this the "best" threshold is noise: entry_without_notice
#: tuned to 0.05 off four examples and then scored P=0.75 on test, and
#: receipt_refusal tuned to 0.10 off five and scored P=0.43. Both were
#: calibration sets with no negatives near the boundary, not evidence that a
#: 5% threshold is safe.
MIN_CALIBRATION_SUPPORT = 8

#: No label may be tuned below this however good the calibration looks. A
#: threshold this low means the calibration set never showed the label a
#: convincing negative, which is a property of the sample, not the model.
MIN_THRESHOLD = 0.35

#: Minimum signal the TEXT must contribute before any label is asserted.
#:
#: With almost no recognisable features the logits collapse to the bias, and
#: the model returns its prior — so "asdkjh qwe zxc" came back as harassment.
#: That is not a low-confidence answer, it is no answer at all, and on a
#: public endpoint it means someone typing nonsense, or writing in a language
#: this model does not cover, gets told their landlord committed a crime.
#:
#: Measured as the largest absolute logit contribution from the text alone.
#: Real complaints score 3-7; gibberish, punctuation, digits and French all
#: score below 1.1.
MIN_EVIDENCE = 1.5


def _design_matrix(texts: list[str]) -> list[dict[int, float]]:
    return [features(t) for t in texts]


def _flatten(design: list[dict[int, float]]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Flatten a list of sparse feature dicts into (row, column, value)."""
    rows: list[int] = []
    cols: list[int] = []
    vals: list[float] = []
    for i, feats in enumerate(design):
        for idx, val in feats.items():
            rows.append(i)
            cols.append(idx)
            vals.append(val)
    return (
        np.asarray(rows, dtype=np.int64),
        np.asarray(cols, dtype=np.int64),
        np.asarray(vals, dtype=np.float64),
    )


def _batch_logits(
    weights: np.ndarray, bias: np.ndarray,
    rows: np.ndarray, cols: np.ndarray, vals: np.ndarray, n: int,
) -> np.ndarray:
    """Logits for every example and label, from the flattened triples."""
    out = np.empty((n, weights.shape[0]), dtype=np.float64)
    for j in range(weights.shape[0]):
        out[:, j] = np.bincount(rows, weights=weights[j, cols] * vals, minlength=n) + bias[j]
    return out


def _score(weights: np.ndarray, bias: np.ndarray, feats: dict[int, float]) -> np.ndarray:
    """Logits for every label, touching only the features present."""
    if not feats:
        return bias.copy()
    idx = np.fromiter(feats.keys(), dtype=np.int64, count=len(feats))
    val = np.fromiter(feats.values(), dtype=np.float64, count=len(feats))
    return weights[:, idx] @ val + bias


def _sigmoid(z: np.ndarray) -> np.ndarray:
    # Split on sign: exp overflows for large negative z in the naive form.
    out = np.empty_like(z)
    pos = z >= 0
    out[pos] = 1.0 / (1.0 + np.exp(-z[pos]))
    ez = np.exp(z[~pos])
    out[~pos] = ez / (1.0 + ez)
    return out


class ComplaintClassifier:
    """One-vs-rest logistic regression over hashed word/char n-grams."""

    def __init__(self) -> None:
        self.weights: np.ndarray | None = None
        self.bias: np.ndarray | None = None
        self.labels: tuple[str, ...] = LABEL_KEYS
        self.thresholds: np.ndarray | None = None
        #: Platt scaling per label: (a, b) mapping logit -> calibrated prob.
        self.calibration: np.ndarray | None = None
        self.trained_at: str = ""
        self.sample_count: int = 0
        self.metrics: dict[str, Any] = {}
        self.is_trained: bool = False
        self._lock = threading.RLock()

    # ── Training ────────────────────────────────────────────────────────

    def train(
        self,
        examples: list[tuple[str, tuple[str, ...]]] | None = None,
        *,
        calibration_set: list[tuple[str, tuple[str, ...]]] | None = None,
        epochs: int = 1500,
        learning_rate: float = 0.02,
        l2: float = 1e-4,
        holdout: float = 0.25,
    ) -> dict[str, Any]:
        """Fit the classifier.

        `calibration_set` is the important argument. Thresholds and Platt
        scaling fitted on a random split of the TRAINING data are worthless
        here, because the training corpus is largely template-generated: a
        held-out generated example shares its grammar with the training ones,
        so the split measures memorisation of a template, not generalisation.
        The first run scored micro-F1 0.985 that way and 0.77 on unseen
        hand-written phrasing, with 13 of 34 lawful situations drawing a false
        accusation at thresholds the easy split had pushed down to 0.05.

        Pass real, human-written examples here instead. They are never trained
        on; they set the operating point and the reported numbers.
        """
        examples = list(examples if examples is not None else TRAINING_EXAMPLES)
        if len(examples) < 40:
            raise ValueError(f"Need at least 40 examples, got {len(examples)}")

        rng = np.random.default_rng(TRAIN_SEED)
        order = rng.permutation(len(examples))
        examples = [examples[i] for i in order]

        # Stratification is awkward for multi-label; a fixed shuffle with a
        # pinned seed keeps the split reproducible, which is what makes two
        # training runs comparable.
        split = max(1, int(len(examples) * (1 - holdout)))
        train_set, test_set = examples[:split], examples[split:]

        X_train = _design_matrix([t for t, _ in train_set])
        Y_train = self._label_matrix([lbls for _, lbls in train_set])

        n_labels = len(self.labels)
        weights = np.zeros((n_labels, N_FEATURES), dtype=np.float64)
        bias = np.zeros(n_labels, dtype=np.float64)

        # The whole training set flattened into (row, column, value) triples.
        # Looping over examples in Python was fine at 140 examples and is not
        # at 2400: every epoch becomes 2400 trips through the interpreter.
        # Flattened, an epoch is a handful of bincounts over the non-zeros.
        rows, cols, vals = _flatten(X_train)
        n = len(X_train)

        # Full-batch gradient descent with Adam. Plain GD needs a learning
        # rate that suits every feature at once, and hashed n-gram counts
        # differ by orders of magnitude in frequency; Adam's per-feature
        # scaling is what lets the rare, discriminative phrases move at all.
        m_w = np.zeros_like(weights)
        v_w = np.zeros_like(weights)
        m_b = np.zeros(n_labels)
        v_b = np.zeros(n_labels)
        beta1, beta2, eps = 0.9, 0.999, 1e-8

        previous_loss = float("inf")
        for epoch in range(1, epochs + 1):
            logits = _batch_logits(weights, bias, rows, cols, vals, n)
            probs = _sigmoid(logits)
            err = probs - Y_train

            grad_w = np.zeros_like(weights)
            for j in range(n_labels):
                grad_w[j] = np.bincount(cols, weights=err[rows, j] * vals, minlength=N_FEATURES)
            grad_w = grad_w / n + l2 * weights
            grad_b = err.mean(axis=0)

            m_w = beta1 * m_w + (1 - beta1) * grad_w
            v_w = beta2 * v_w + (1 - beta2) * grad_w ** 2
            m_b = beta1 * m_b + (1 - beta1) * grad_b
            v_b = beta2 * v_b + (1 - beta2) * grad_b ** 2
            mhat_w = m_w / (1 - beta1 ** epoch)
            vhat_w = v_w / (1 - beta2 ** epoch)
            mhat_b = m_b / (1 - beta1 ** epoch)
            vhat_b = v_b / (1 - beta2 ** epoch)

            weights -= learning_rate * mhat_w / (np.sqrt(vhat_w) + eps)
            bias -= learning_rate * mhat_b / (np.sqrt(vhat_b) + eps)

            if epoch % 50 == 0:
                loss = float(-np.mean(
                    Y_train * np.log(probs + 1e-12) + (1 - Y_train) * np.log(1 - probs + 1e-12)
                ))
                logger.debug("legal classifier epoch %d loss %.5f", epoch, loss)
                if abs(previous_loss - loss) < 1e-6:
                    logger.info("Legal classifier converged at epoch %d", epoch)
                    break
                previous_loss = loss

        # Calibration and thresholds come from the calibration set when one is
        # supplied, and only fall back to a split of the training data when
        # there is nothing better — with the caveat recorded in the metrics.
        eval_set = calibration_set if calibration_set else (test_set if test_set else train_set)
        X_eval = _design_matrix([t for t, _ in eval_set])
        Y_eval = self._label_matrix([lbls for _, lbls in eval_set])
        logits = np.array([_score(weights, bias, f) for f in X_eval])

        calibration = self._fit_calibration(logits, Y_eval)
        probs = self._apply_calibration(logits, calibration)
        thresholds, per_label = self._tune_thresholds(probs, Y_eval)

        with self._lock:
            self.weights = weights
            self.bias = bias
            self.calibration = calibration
            self.thresholds = thresholds
            self.trained_at = datetime.now(UTC).isoformat()
            self.sample_count = len(examples)
            self.metrics = {
                "trainSize": len(train_set),
                "holdoutSize": len(test_set),
                "calibrationSize": len(eval_set),
                "calibratedOnHeldOutHumanText": bool(calibration_set),
                "perLabel": per_label,
                "microF1": self._micro_f1(probs, Y_eval, thresholds),
                "caveat": (
                    None if calibration_set else
                    "Thresholds were fitted on a split of the training corpus. If that "
                    "corpus is template-generated these numbers measure template "
                    "memorisation, not generalisation."
                ),
            }
            self.is_trained = True

        logger.info(
            "Legal classifier trained: %d examples (%d held out), micro-F1=%.3f",
            len(examples), len(test_set), self.metrics["microF1"],
        )
        return self.metrics

    def _label_matrix(self, label_sets: list[tuple[str, ...]]) -> np.ndarray:
        index = {k: i for i, k in enumerate(self.labels)}
        Y = np.zeros((len(label_sets), len(self.labels)), dtype=np.float64)
        for row, labels in enumerate(label_sets):
            for key in labels:
                if key in index:
                    Y[row, index[key]] = 1.0
        return Y

    @staticmethod
    def _fit_calibration(logits: np.ndarray, Y: np.ndarray) -> np.ndarray:
        """Platt scaling per label: sigmoid(a * logit + b)."""
        n_labels = Y.shape[1]
        params = np.zeros((n_labels, 2), dtype=np.float64)
        for j in range(n_labels):
            a, b = 1.0, 0.0
            z, y = logits[:, j], Y[:, j]
            for _ in range(200):
                p = _sigmoid(a * z + b)
                err = p - y
                grad_a = float(np.mean(err * z))
                grad_b = float(np.mean(err))
                a -= 0.5 * grad_a
                b -= 0.5 * grad_b
            params[j] = (a, b)
        return params

    @staticmethod
    def _apply_calibration(logits: np.ndarray, params: np.ndarray) -> np.ndarray:
        return _sigmoid(logits * params[:, 0] + params[:, 1])

    @staticmethod
    def _tune_thresholds(probs: np.ndarray, Y: np.ndarray) -> tuple[np.ndarray, dict[str, Any]]:
        """Lowest threshold that still reaches TARGET_PRECISION per label."""
        n_labels = Y.shape[1]
        thresholds = np.full(n_labels, FALLBACK_THRESHOLD, dtype=np.float64)
        report: dict[str, Any] = {}

        for j, key in enumerate(LABEL_KEYS):
            support = int(np.sum(Y[:, j] == 1))
            if support < MIN_CALIBRATION_SUPPORT:
                # Not enough evidence to set an operating point. Abstain
                # conservatively and say so, rather than adopt a threshold
                # fitted to a handful of examples.
                report[key] = {
                    "threshold": FALLBACK_THRESHOLD,
                    "precision": None,
                    "recall": None,
                    "support": support,
                    "note": (f"only {support} calibration examples "
                             f"(need {MIN_CALIBRATION_SUPPORT}); using the conservative default"),
                }
                continue

            best = None
            for t in np.arange(MIN_THRESHOLD, 0.96, 0.05):
                pred = probs[:, j] >= t
                tp = float(np.sum(pred & (Y[:, j] == 1)))
                fp = float(np.sum(pred & (Y[:, j] == 0)))
                fn = float(np.sum(~pred & (Y[:, j] == 1)))
                precision = tp / (tp + fp) if tp + fp else 1.0
                recall = tp / (tp + fn) if tp + fn else 0.0
                if precision >= TARGET_PRECISION and recall > 0:
                    if best is None or recall > best[2]:
                        best = (float(t), precision, recall)
            if best:
                thresholds[j] = best[0]
                report[key] = {"threshold": round(best[0], 2),
                               "precision": round(best[1], 3),
                               "recall": round(best[2], 3),
                               "support": support}
            else:
                # No threshold reached the precision floor. Recorded honestly
                # rather than quietly lowering the bar.
                report[key] = {"threshold": FALLBACK_THRESHOLD,
                               "precision": None, "recall": 0.0, "support": support,
                               "note": "no threshold met the precision target on calibration data"}
        return thresholds, report

    @staticmethod
    def _micro_f1(probs: np.ndarray, Y: np.ndarray, thresholds: np.ndarray) -> float:
        pred = probs >= thresholds
        tp = float(np.sum(pred & (Y == 1)))
        fp = float(np.sum(pred & (Y == 0)))
        fn = float(np.sum(~pred & (Y == 1)))
        if tp == 0:
            return 0.0
        precision = tp / (tp + fp)
        recall = tp / (tp + fn)
        return round(2 * precision * recall / (precision + recall), 4)

    # ── Inference ───────────────────────────────────────────────────────

    def predict(self, text: str) -> dict[str, Any]:
        """Label probabilities for one complaint.

        Lock-free on purpose: the arrays are replaced wholesale under the
        lock by train/load, never mutated in place, so a reader sees one
        consistent version.
        """
        weights, bias = self.weights, self.bias
        calibration, thresholds = self.calibration, self.thresholds
        if weights is None or bias is None or calibration is None or thresholds is None:
            raise RuntimeError("Classifier not trained")

        feats = features(text)
        logits = _score(weights, bias, feats)

        # How much the text itself contributed, as opposed to the prior.
        evidence = float(np.max(np.abs(logits - bias))) if feats else 0.0
        abstained = evidence < MIN_EVIDENCE

        probs = _sigmoid(logits * calibration[:, 0] + calibration[:, 1])

        scored = [
            {
                "label": key,
                "probability": round(float(probs[i]), 4),
                "threshold": round(float(thresholds[i]), 2),
                "predicted": bool(probs[i] >= thresholds[i]) and not abstained,
            }
            for i, key in enumerate(self.labels)
        ]
        scored.sort(key=lambda s: s["probability"], reverse=True)

        return {
            "labels": [s["label"] for s in scored if s["predicted"]],
            "scores": scored,
            "featureCount": len(feats),
            "evidence": round(evidence, 3),
            "abstained": abstained,
            "modelVersion": self.trained_at,
        }

    # ── Persistence ─────────────────────────────────────────────────────

    def save(self, path: str) -> None:
        with self._lock:
            if not self.is_trained or self.weights is None:
                raise RuntimeError("Cannot save an untrained classifier")
            os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
            # Only non-zero weights are stored. The matrix is 10 x 262144 but
            # a corpus this size touches a small fraction of it, so the
            # artifact stays in the tens of KB instead of 20MB of zeros.
            nz = np.nonzero(self.weights)
            np.savez_compressed(
                path,
                rows=nz[0].astype(np.int32),
                cols=nz[1].astype(np.int32),
                vals=self.weights[nz],
                bias=self.bias,
                thresholds=self.thresholds,
                calibration=self.calibration,
                labels=np.array(self.labels),
                meta=np.array([json.dumps({
                    "trainedAt": self.trained_at,
                    "sampleCount": self.sample_count,
                    "metrics": self.metrics,
                    "nFeatures": N_FEATURES,
                    "featureFingerprint": contract_fingerprint(),
                })]),
            )

    def load(self, path: str) -> bool:
        if not os.path.exists(path):
            return False
        try:
            data = np.load(path, allow_pickle=False)
            meta = json.loads(str(data["meta"][0]))
            if int(meta.get("nFeatures", 0)) != N_FEATURES:
                # The hash space changed, so every stored index means
                # something else now. Refuse rather than serve noise.
                raise ValueError(
                    f"artifact built for {meta.get('nFeatures')} features, this build uses {N_FEATURES}"
                )

            # The space can stay the same size while its CONTENTS move: a
            # change to tokenisation, n-grams, stopwords or normalisation
            # reassigns every index, and the file still loads with matching
            # shapes and silently wrong weights. The probe catches that.
            stored_fingerprint = meta.get("featureFingerprint")
            if stored_fingerprint and stored_fingerprint != contract_fingerprint():
                raise ValueError(
                    "artifact was built against a different feature-extraction contract; "
                    "retrain with scripts/train_legal.py"
                )

            labels = tuple(str(x) for x in data["labels"])
            weights = np.zeros((len(labels), N_FEATURES), dtype=np.float64)
            weights[data["rows"].astype(np.int64), data["cols"].astype(np.int64)] = data["vals"]

            bias = data["bias"]
            thresholds = data["thresholds"]
            calibration = data["calibration"]
            if not np.all(np.isfinite(weights)) or not np.all(np.isfinite(bias)):
                raise ValueError("artifact contains non-finite weights")
        except Exception as exc:
            logger.warning("Failed to load legal classifier from %s: %s", path, exc)
            return False

        # Committed together, so a failed load leaves the running model intact.
        with self._lock:
            self.labels = labels
            self.weights = weights
            self.bias = bias
            self.thresholds = thresholds
            self.calibration = calibration
            self.trained_at = meta.get("trainedAt", "")
            self.sample_count = int(meta.get("sampleCount", 0))
            self.metrics = meta.get("metrics", {})
            self.is_trained = True
        return True

    def get_status(self) -> dict[str, Any]:
        return {
            "isTrained": self.is_trained,
            "trainedAt": self.trained_at,
            "sampleCount": self.sample_count,
            "labels": list(self.labels),
            "metrics": self.metrics,
        }


#: Process-wide singleton, mirroring rent_price_model.
complaint_classifier = ComplaintClassifier()
