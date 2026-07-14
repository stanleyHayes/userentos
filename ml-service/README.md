# RentOS Pricing ML Service

Standalone FastAPI microservice that predicts Ghanaian rent prices with a
pure-NumPy linear regression model (mirrors `server/src/services/ml/`).
The Node.js server proxies to it when `ML_SERVICE_URL` is set; otherwise it
runs its own TypeScript copy of the same model.

## Layout

```
ml-service/
├── app/
│   ├── main.py            # FastAPI app factory, lifespan, CORS
│   ├── config.py          # pydantic-settings configuration (env-driven)
│   ├── api/
│   │   ├── deps.py        # shared dependencies (model accessor)
│   │   └── routes/        # health.py · predict.py · train.py
│   ├── core/logging.py    # logging setup
│   ├── ml/
│   │   ├── features.py    # feature extraction + target-mean encodings
│   │   └── model.py       # RentPriceModel (train / predict / persist)
│   ├── schemas/pricing.py # request/response pydantic models
│   └── seed/
│       ├── pools.py       # Ghanaian cities, types, amenities, neighborhoods
│       └── generator.py   # deterministic realistic listing generator
├── scripts/train_seed.py  # CLI: generate dataset + train + persist model
├── seed-data/             # generated datasets (pricing-seed.json)
├── data/                  # trained model artifact (pricing-model.json)
└── tests/                 # pytest suite (features, model, API)
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET    | `/health`        | Health check |
| GET    | `/status`        | Model metrics (R², epochs, samples) |
| POST   | `/train`         | Train on a caller-supplied property array |
| POST   | `/train/seed`    | Generate a fresh Ghanaian dataset and train on it |
| POST   | `/predict`       | Predict rent for one property |
| POST   | `/predict-batch` | Predict rent for many properties |
| POST   | `/reload`        | Reload the model artifact from disk |

## Run locally

```bash
cd ml-service
python3.13 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

## Seed data & training

A deterministic generator produces realistic Ghanaian rental listings
(16 cities across all regions, 9 property types, 2025–26 GHS rents):

```bash
# Generate 5,000 listings, write seed-data/pricing-seed.json, train + persist
python scripts/train_seed.py --count 5000 --save-dataset

# Or train the running service on freshly generated data
curl -X POST http://localhost:8000/train/seed \
  -H "Content-Type: application/json" \
  -d '{"count": 5000, "seed": 20260714}'
```

Same `(count, seed)` → identical dataset, always.

## Predict

```bash
curl -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" \
  -d '{
    "bedrooms": 2, "bathrooms": 2, "floorArea": 95,
    "furnished": false, "parkingSpaces": 1, "advanceMonths": 3,
    "amenities": ["Water", "Electricity", "Security"],
    "city": "Accra", "type": "apartment", "region": "Greater Accra"
  }'
```

## Tests

```bash
python -m pytest -q
```

## Deploy

```bash
docker build -t rentos-pricing-ml .
docker run -p 8000:8000 -v rentos-ml-data:/app/data rentos-pricing-ml
```

The image bakes in a model pre-trained on 2,500 seed listings, so the
service answers predictions on first boot. (Also wired into the root
`docker-compose.yml` as the `ml-service` container.)

## Env vars

| Var | Default | Description |
|-----|---------|-------------|
| `MODEL_PATH`   | `data/pricing-model.json` | model artifact path |
| `PORT`         | `8000` | server port |
| `CORS_ORIGINS` | `*` | comma-separated allowed origins |
| `LOG_LEVEL`    | `INFO` | logging level |
