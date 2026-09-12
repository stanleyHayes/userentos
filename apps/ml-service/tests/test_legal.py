"""Rental-complaint classifier: behaviour that must hold for real traffic."""

import numpy as np
import pytest

from app.legal.augment import generate
from app.legal.classifier import (
    FALLBACK_THRESHOLD,
    MIN_CALIBRATION_SUPPORT,
    MIN_THRESHOLD,
    ComplaintClassifier,
)
from app.legal.corpus import TRAINING_EXAMPLES
from app.legal.taxonomy import BY_KEY, LABEL_KEYS
from app.legal.text import MAX_CHARS, features, normalise


@pytest.fixture(scope="module")
def model():
    """Trained once for the module — training is ~2 minutes."""
    classifier = ComplaintClassifier()
    # Smaller corpus and fewer epochs than production: these tests check
    # behaviour and invariants, not the published accuracy numbers, which
    # scripts/train_legal.py owns.
    classifier.train(generate(per_label=40, negatives=200),
                     calibration_set=TRAINING_EXAMPLES, epochs=300)
    return classifier


class TestTaxonomy:
    def test_every_label_cites_a_provision(self):
        # A label a tenant might act on has to say where it comes from.
        for label in BY_KEY.values():
            assert label.citation.strip()
            assert label.severity in {"high", "medium", "low"}

    def test_advance_is_marked_as_needing_a_quantity(self):
        # Whether advance is lawful is arithmetic against the s.25 six-month
        # limit, not something a classifier should assert.
        assert BY_KEY["excessive_advance"].requires_quantity is True


class TestFeatures:
    def test_hashing_is_stable_across_calls(self):
        # Weights are stored by feature INDEX. A salted hash would silently
        # invalidate every trained weight between processes.
        assert features("landlord changed the lock") == features("landlord changed the lock")

    def test_misspellings_land_near_the_correct_spelling(self):
        # The point of character n-grams: real complaints are typed quickly.
        correct = features("my landlord changed the locks")
        typo = features("my landlordd chnaged the locks")
        shared = set(correct) & set(typo)
        assert len(shared) / len(correct) > 0.5

    def test_negation_words_survive_normalisation(self):
        # "did not return my deposit" and "returned my deposit" must not
        # produce the same vector.
        assert features("he did not return my deposit") != features("he returned my deposit")

    def test_input_is_bounded(self):
        assert len(normalise("x" * (MAX_CHARS * 3))) <= MAX_CHARS

    def test_empty_text_yields_no_features(self):
        assert features("   ") == {}
        assert features("!!!") == {}


class TestThresholdGuards:
    def test_under_supported_labels_abstain(self, model):
        """A threshold fitted on a handful of examples is noise.

        entry_without_notice once tuned to 0.05 off four calibration examples
        and then scored P=0.75 on held-out text; receipt_refusal tuned to 0.10
        off five and scored P=0.43.
        """
        for key, report in model.metrics["perLabel"].items():
            support = report.get("support")
            if support is not None and support < MIN_CALIBRATION_SUPPORT:
                assert report["threshold"] == FALLBACK_THRESHOLD, key

    def test_no_threshold_falls_below_the_floor(self, model):
        assert float(np.min(model.thresholds)) >= MIN_THRESHOLD

    def test_metrics_admit_when_calibration_was_not_human_text(self):
        classifier = ComplaintClassifier()
        classifier.train(generate(per_label=20, negatives=80), epochs=100)
        assert classifier.metrics["calibratedOnHeldOutHumanText"] is False
        assert "template memorisation" in classifier.metrics["caveat"]


class TestPrediction:
    def test_returns_a_score_for_every_label(self, model):
        result = model.predict("my landlord changed the locks on my room")
        assert len(result["scores"]) == len(LABEL_KEYS)
        assert {s["label"] for s in result["scores"]} == set(LABEL_KEYS)

    def test_scores_are_probabilities_sorted_by_confidence(self, model):
        scores = model.predict("the landlord cut my water and changed the lock")["scores"]
        assert all(0.0 <= s["probability"] <= 1.0 for s in scores)
        probs = [s["probability"] for s in scores]
        assert probs == sorted(probs, reverse=True)

    def test_recognises_a_clear_eviction_complaint(self, model):
        result = model.predict("my landlord padlocked my door and threw my things outside")
        assert "illegal_eviction" in result["labels"]

    def test_handles_multiple_violations_in_one_complaint(self, model):
        result = model.predict(
            "he cut the electricity, changed the locks and is shouting threats at me"
        )
        assert len(result["labels"]) >= 2

    def test_stays_quiet_on_a_lawful_situation(self, model):
        # The error this model exists to avoid: telling a tenant their
        # landlord committed a crime when they did not.
        for text in (
            "my landlord returned my full deposit within two weeks",
            "he gave me six months written notice before the rent goes up",
            "the caretaker fixed the leaking tap the same day I reported it",
        ):
            assert model.predict(text)["labels"] == [], text

    def test_stays_quiet_on_an_unrelated_question(self, model):
        assert model.predict("How do I find a two bedroom apartment in Tema?")["labels"] == []

    def test_untrained_model_refuses_rather_than_guessing(self):
        with pytest.raises(RuntimeError, match="not trained"):
            ComplaintClassifier().predict("anything")

    def test_gibberish_does_not_crash_or_accuse(self, model):
        # With no recognisable features the logits collapse to the bias and
        # the model returns its prior: "asdkjh qwe zxc" came back as
        # harassment. On a public endpoint that accuses a real landlord.
        for text in ("asdkjh qwe zxc", "!!!???", "12345", "a", "zzz qqq xxx"):
            result = model.predict(text)
            assert result["labels"] == [], text
            assert result["abstained"] is True, text

    def test_abstains_on_a_language_it_was_not_trained_for(self, model):
        result = model.predict("bonjour je cherche un appartement a louer")
        assert result["abstained"] is True
        assert result["labels"] == []

    def test_does_not_abstain_on_a_real_complaint(self, model):
        result = model.predict("my landlord padlocked my door and threw out my things")
        assert result["abstained"] is False
        assert result["evidence"] > 1.5


class TestPersistence:
    def test_round_trips_through_disk(self, model, tmp_path):
        path = str(tmp_path / "legal.npz")
        model.save(path)

        reloaded = ComplaintClassifier()
        assert reloaded.load(path) is True

        text = "my landlord disconnected the electricity to force me out"
        assert reloaded.predict(text)["labels"] == model.predict(text)["labels"]
        assert np.allclose(reloaded.thresholds, model.thresholds)

    def test_artifact_is_small_enough_to_ship(self, model, tmp_path):
        # The weight matrix is 10 x 262144; stored densely that is 20MB of
        # mostly zeros in every image and every cold start.
        import os
        path = str(tmp_path / "legal.npz")
        model.save(path)
        assert os.path.getsize(path) < 5_000_000

    def test_a_failed_load_leaves_the_running_model_intact(self, model, tmp_path):
        path = str(tmp_path / "corrupt.npz")
        path_written = path if path.endswith(".npz") else path + ".npz"
        with open(path_written, "wb") as f:
            f.write(b"not an npz file")

        before = model.predict("my landlord changed the locks")
        assert model.load(path_written) is False
        assert model.predict("my landlord changed the locks") == before

    def test_refuses_an_artifact_built_for_a_different_feature_space(self, model, tmp_path):
        import json
        path = str(tmp_path / "legal.npz")
        model.save(path)

        data = dict(np.load(path, allow_pickle=False))
        meta = json.loads(str(data["meta"][0]))
        meta["nFeatures"] = 1024  # a different hash space: every index now means something else
        data["meta"] = np.array([json.dumps(meta)])
        np.savez_compressed(path, **data)

        assert ComplaintClassifier().load(path) is False

    def test_untrained_model_cannot_be_saved(self, tmp_path):
        with pytest.raises(RuntimeError, match="untrained"):
            ComplaintClassifier().save(str(tmp_path / "x.npz"))


class TestApi:
    def test_classify_endpoint_returns_labels(self, client, model, monkeypatch):
        from app.legal import classifier as module
        monkeypatch.setattr(module.complaint_classifier, "__dict__", model.__dict__, raising=False)

        res = client.post("/legal/classify",
                          json={"text": "my landlord padlocked my door and threw out my things"})
        assert res.status_code == 200
        body = res.json()
        assert "illegal_eviction" in body["labels"]
        assert len(body["scores"]) == len(LABEL_KEYS)

    def test_rejects_text_that_is_too_short_to_classify(self, client):
        assert client.post("/legal/classify", json={"text": "hi"}).status_code == 422

    def test_rejects_unbounded_text(self, client):
        assert client.post("/legal/classify",
                           json={"text": "x" * (MAX_CHARS + 1)}).status_code == 422

    def test_batch_is_bounded(self, client):
        assert client.post("/legal/classify-batch",
                           json={"texts": ["my landlord cut the water"] * 51}).status_code == 422
