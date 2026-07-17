"""API-key enforcement tests — when ML_API_KEY is set, unauthenticated
requests to train/predict endpoints must be rejected (model-poisoning fix)."""

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import create_app
from tests.conftest import SAMPLE_INPUT, trained_model  # noqa: F401


@pytest.fixture()
def secured_client(trained_model, monkeypatch):  # noqa: F811
    monkeypatch.setenv("ML_API_KEY", "test-secret-key")
    get_settings.cache_clear()
    with TestClient(create_app()) as c:
        yield c
    get_settings.cache_clear()


def test_health_stays_open(secured_client):
    assert secured_client.get("/health").status_code == 200


def test_predict_rejects_missing_key(secured_client):
    res = secured_client.post("/predict", json=SAMPLE_INPUT)
    assert res.status_code == 401


def test_predict_rejects_wrong_key(secured_client):
    res = secured_client.post("/predict", json=SAMPLE_INPUT, headers={"x-api-key": "wrong"})
    assert res.status_code == 401


def test_predict_accepts_correct_key(secured_client):
    res = secured_client.post("/predict", json=SAMPLE_INPUT, headers={"x-api-key": "test-secret-key"})
    assert res.status_code == 200


def test_train_requires_key(secured_client):
    res = secured_client.post("/train/seed", json={"count": 20})
    assert res.status_code == 401


def test_reload_requires_key(secured_client):
    res = secured_client.post("/reload")
    assert res.status_code == 401
