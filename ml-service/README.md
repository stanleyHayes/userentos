# RentOS Pricing ML Service

Standalone FastAPI microservice for the rent price prediction model.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/status` | Model metrics (R², epochs, samples) |
| POST | `/train` | Train model on property array |
| POST | `/predict` | Predict rent for a single property |
| POST | `/predict-batch` | Predict rent for multiple properties |
| POST | `/reload` | Reload model from disk |

## Run locally

```bash
cd ml-service
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Train

```bash
curl -X POST http://localhost:8000/train \
  -H "Content-Type: application/json" \
  -d '{"properties": [...]}'
```

## Predict

```bash
curl -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" \
  -d '{
    "bedrooms": 2,
    "bathrooms": 2,
    "floorArea": 95,
    "furnished": false,
    "parkingSpaces": 1,
    "advanceMonths": 3,
    "amenities": ["Water", "Electricity", "Security"],
    "city": "Accra",
    "type": "apartment",
    "region": "Greater Accra"
  }'
```

## Deploy

```bash
docker build -t rentos-pricing-ml .
docker run -p 8000:8000 -v $(pwd)/data:/app/data rentos-pricing-ml
```

## Env vars

- `MODEL_PATH` — path to persisted model JSON (default: `data/pricing-model.json`)
- `PORT` — server port (default: `8000`)
- `CORS_ORIGINS` — comma-separated allowed origins (default: `*`)
