"""HTTP API tests (TestClient)."""

from tests.conftest import SAMPLE_INPUT


def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "modelLoaded": "True"}


def test_status(client):
    res = client.get("/status")
    assert res.status_code == 200
    body = res.json()
    assert body["isTrained"] is True
    assert body["sampleCount"] >= 20
    assert 0 <= body["r2Score"] <= 1


def test_predict(client):
    res = client.post("/predict", json=SAMPLE_INPUT)
    assert res.status_code == 200
    body = res.json()
    assert body["predictedRent"] > 0
    assert body["confidenceInterval"]["low"] < body["confidenceInterval"]["high"]
    assert body["featureContributions"]


def test_predict_batch(client):
    res = client.post("/predict-batch", json=[SAMPLE_INPUT, {**SAMPLE_INPUT, "city": "Kumasi"}])
    assert res.status_code == 200
    assert len(res.json()) == 2


def test_train_seed_endpoint(client):
    res = client.post("/train/seed", json={"count": 300, "seed": 99})
    assert res.status_code == 200
    body = res.json()
    assert body["isTrained"] is True
    assert body["sampleCount"] == 300
    assert body["dataset"]["count"] == 300
    assert body["dataset"]["rentMin"] > 0


def test_train_endpoint_with_properties(client):
    from app.seed.generator import generate_properties

    res = client.post("/train", json={"properties": generate_properties(150, seed=21)})
    assert res.status_code == 200
    assert res.json()["sampleCount"] == 150


def test_train_too_few_properties_422(client):
    res = client.post("/train", json={"properties": [{"rentAmount": 1000}]})
    assert res.status_code == 422


def test_reload(client):
    res = client.post("/reload")
    assert res.status_code == 200
    assert "loaded" in res.json()
