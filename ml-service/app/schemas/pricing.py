"""Request/response schemas for the pricing API.

Field names stay camelCase for compatibility with the Node server's
mlClient (server/src/services/mlClient.ts).
"""

from typing import Any

from pydantic import BaseModel, Field


class PropertyInput(BaseModel):
    """Flat property description used for prediction."""

    bedrooms: int = Field(..., ge=0)
    bathrooms: int = Field(..., ge=0)
    floorArea: float | None = None
    furnished: bool | None = False
    parkingSpaces: int | None = None
    advanceMonths: int | None = None
    amenities: list[str] | None = None
    city: str
    type: str
    region: str | None = None
    floor: int | None = None
    yearBuilt: int | None = None
    stayType: str | None = None


class TrainRequest(BaseModel):
    """Train on an explicit property array (nested Mongo-style documents)."""

    # Bounded — an unbounded payload + huge maxEpochs is a CPU/memory DoS.
    properties: list[dict[str, Any]] = Field(..., max_length=5000)
    maxEpochs: int | None = Field(10000, le=10000)
    learningRate: float | None = Field(0.01, gt=0, le=1)
    lrDecay: float | None = Field(0.9995, gt=0, le=1)
    l2Lambda: float | None = Field(0.001, ge=0, le=1)
    patience: int | None = Field(500, le=1000)
    verbose: bool | None = False


class SeedTrainRequest(BaseModel):
    """Train on freshly generated Ghanaian seed data."""

    count: int = Field(2500, ge=20, le=10000)
    seed: int = 20260714
    maxEpochs: int | None = Field(10000, le=10000)
    learningRate: float | None = Field(0.01, gt=0, le=1)
    lrDecay: float | None = Field(0.9995, gt=0, le=1)
    l2Lambda: float | None = Field(0.001, ge=0, le=1)
    patience: int | None = Field(500, le=1000)
    verbose: bool | None = False


class ConfidenceInterval(BaseModel):
    low: int
    high: int


class FeatureContribution(BaseModel):
    feature: str
    contribution: float


class PredictResponse(BaseModel):
    predictedRent: int
    confidenceInterval: ConfidenceInterval
    featureContributions: list[FeatureContribution]
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


class HealthResponse(BaseModel):
    status: str
    modelLoaded: str


class ReloadResponse(BaseModel):
    loaded: str
    path: str


class SeedTrainResponse(StatusResponse):
    dataset: dict[str, Any]
