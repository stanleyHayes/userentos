"""FastAPI service for RentOS pricing ML model."""

import os
from typing import Any, Dict, List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.model import rent_price_model

# ─── Config ───
MODEL_PATH = os.environ.get("MODEL_PATH", "data/pricing-model.json")
PORT = int(os.environ.get("PORT", "8000"))


# ─── Pydantic models ───
class PropertyInput(BaseModel):
    bedrooms: int = Field(..., ge=0)
    bathrooms: int = Field(..., ge=0)
    floorArea: Optional[float] = None
    furnished: Optional[bool] = False
    parkingSpaces: Optional[int] = None
    advanceMonths: Optional[int] = None
    amenities: Optional[List[str]] = None
    city: str
    type: str
    region: Optional[str] = None
    floor: Optional[int] = None
    yearBuilt: Optional[int] = None
    stayType: Optional[str] = None


class TrainRequest(BaseModel):
    properties: List[Dict[str, Any]]
    maxEpochs: Optional[int] = 10000
    learningRate: Optional[float] = 0.01
    lrDecay: Optional[float] = 0.9995
    l2Lambda: Optional[float] = 0.001
    patience: Optional[int] = 500
    verbose: Optional[bool] = False


class PredictResponse(BaseModel):
    predictedRent: int
    confidenceInterval: Dict[str, int]
    featureContributions: List[Dict[str, Any]]
    modelVersion: str
    r2Score: float
    sampleCount: int


class StatusResponse(BaseModel):
    isTrained: bool
    trainedAt: str
    sampleCount: int
    r2Score: float
    epochs: int
    finalLoss: float


# ─── Lifespan ───
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: try to load existing model
    loaded = rent_price_model.load(MODEL_PATH)
    if loaded:
        print(f"[ML] Loaded model from {MODEL_PATH} (R²={rent_price_model.r2_score:.3f})")
    else:
        print("[ML] No saved model found. Train via POST /train")
    yield
    # Shutdown
    if rent_price_model.is_trained:
        rent_price_model.save(MODEL_PATH)
        print(f"[ML] Saved model to {MODEL_PATH}")


# ─── App ───
app = FastAPI(
    title="RentOS Pricing ML Service",
    description="Standalone microservice for rent price prediction.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Routes ───
@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok", "modelLoaded": str(rent_price_model.is_trained)}


@app.get("/status", response_model=StatusResponse)
def status() -> Dict[str, Any]:
    return rent_price_model.get_status()


@app.post("/train")
def train(req: TrainRequest) -> StatusResponse:
    try:
        rent_price_model.train(
            req.properties,
            max_epochs=req.maxEpochs or 10000,
            learning_rate=req.learningRate or 0.01,
            lr_decay=req.lrDecay or 0.9995,
            l2_lambda=req.l2Lambda or 0.001,
            patience=req.patience or 500,
            verbose=req.verbose or False,
        )
        rent_price_model.save(MODEL_PATH)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return rent_price_model.get_status()


@app.post("/predict", response_model=PredictResponse)
def predict(req: PropertyInput) -> Dict[str, Any]:
    if not rent_price_model.is_trained:
        raise HTTPException(status_code=503, detail="Model not trained. Call POST /train first.")
    try:
        return rent_price_model.predict(req.model_dump())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/predict-batch")
def predict_batch(reqs: List[PropertyInput]) -> List[Dict[str, Any]]:
    if not rent_price_model.is_trained:
        raise HTTPException(status_code=503, detail="Model not trained. Call POST /train first.")
    results = []
    for req in reqs:
        try:
            results.append(rent_price_model.predict(req.model_dump()))
        except Exception as e:
            results.append({"error": str(e)})
    return results


@app.post("/reload")
def reload() -> Dict[str, str]:
    loaded = rent_price_model.load(MODEL_PATH)
    return {"loaded": str(loaded), "path": MODEL_PATH}
