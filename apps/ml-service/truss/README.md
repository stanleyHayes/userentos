# Deploying the rent-pricing model to Baseten

This directory packages the RentOS rent-pricing model as a [Truss](https://docs.baseten.co)
so Baseten can serve it (ML roadmap §10).

## What is actually deployed

Not a copy of the model. `config.yaml` bundles the ml-service `app` package
via `external_package_dirs`, so Baseten runs the same `RentPriceModel` and the
same feature extraction that the FastAPI service and the 49-test suite run.

That matters more than it sounds. Two of the three bugs fixed in this model in
September 2026 came from a second implementation of the feature vector
drifting from the first — an omitted field imputed differently on one side
than the other put a live valuation 39% under the truth. A Truss that
redefined `extract_features` would reintroduce that by construction.

`model/model.py` is therefore thin: load the artifact, adapt the request and
response shape, nothing else.

## Deploy

```bash
pip install truss
cd apps/ml-service/truss

# Development deployment, rebuilt on save
truss push --watch

# Immutable production deployment
truss push
```

Baseten prints a model id. Put it in the API's environment:

```
BASETEN_API_KEY=<your key>
BASETEN_MODEL_ID=<the id Baseten printed>
BASETEN_ENVIRONMENT=production
```

`apps/api/src/services/ml/baseten.ts` then builds
`https://model-<id>.api.baseten.co/environments/production/predict`. If your
deployment does not follow that pattern, set `BASETEN_MODEL_URL` to the full
URL from the dashboard instead — it takes precedence.

## The model artifact

`data/pricing-model.json` is bundled into the image and loaded at startup.
`load()` raises if it is missing or unreadable, so a deployment that cannot
work fails its health check rather than answering every request with
"Model not trained".

To ship a retrained model:

```bash
cd apps/ml-service
.venv/bin/python scripts/train_seed.py --count 2500
cp data/pricing-model.json truss/data/pricing-model.json
cd truss && truss push
```

Note that `train_seed.py` trains on **generated** data. Its R² measures how
well a linear model recovers the formula that generated the listings, not how
well it predicts Ghanaian rents. Use `GET /api/pricing/model-evaluation` for
the number that means something — it scores logged predictions against rents
that actually happened.

## Request and response

A single property:

```bash
curl -X POST https://model-<id>.api.baseten.co/environments/production/predict \
  -H "Authorization: Api-Key $BASETEN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"city":"Accra","type":"apartment","bedrooms":2,"bathrooms":2,"floorArea":95}'
```

Or a batch of up to 100, which returns `{"predictions": [...]}`:

```bash
-d '{"instances":[{...},{...}]}'
```

The response carries the valuation, the baseline (what the average training
property is worth), signed per-feature attribution in cedis, and a
`dataQuality` block naming every field that was imputed rather than supplied.
Omitted fields are imputed with the training mean, never with zero — see the
comments in `app/ml/features.py` for why that distinction is load-bearing.

## Cost

The model is pure NumPy: no GPU, 1 CPU and 1 GiB is enough, and a prediction
takes well under a millisecond. The cost here is the container sitting warm,
not the inference.

Baseten scales deployments to zero, so the first request after an idle period
pays a cold start. `basetenClient.warm()` exists to absorb that at API boot.
The pricing route also falls through to the self-hosted ML service and then to
the in-process TypeScript model, so a cold or unreachable deployment degrades
the estimate rather than breaking the page.
