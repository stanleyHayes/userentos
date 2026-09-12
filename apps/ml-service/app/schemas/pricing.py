"""Request/response schemas for the pricing API.

Field names stay camelCase for compatibility with the Node server's
mlClient (server/src/services/mlClient.ts).
"""

from typing import Any

from pydantic import BaseModel, Field


class PropertyInput(BaseModel):
    """Flat property description used for prediction.

    Every numeric field is bounded at both ends. Unbounded ones let a caller
    push the linear model's output past exp()'s overflow point, which the
    model now clamps — but a nonsense input deserves a 422, not a clamped
    answer that looks like a real valuation.
    """

    bedrooms: int = Field(..., ge=0, le=100)
    # Optional, like every other descriptive field: an unstated bathroom count
    # is imputed from the training average and reported as estimated, rather
    # than silently assumed to be 1.
    bathrooms: int | None = Field(None, ge=0, le=100)
    floorArea: float | None = Field(None, ge=0, le=1_000_000)
    furnished: bool | None = None
    parkingSpaces: int | None = Field(None, ge=0, le=1000)
    advanceMonths: int | None = Field(None, ge=0, le=120)
    amenities: list[str] | None = Field(None, max_length=100)
    city: str = Field(..., max_length=200)
    type: str = Field(..., max_length=200)
    region: str | None = Field(None, max_length=200)
    floor: int | None = Field(None, ge=-20, le=300)
    yearBuilt: int | None = Field(None, ge=1800, le=2200)
    stayType: str | None = Field(None, max_length=50)


class TrainingParams(BaseModel):
    """Hyperparameters shared by both training endpoints.

    maxEpochs and patience are bounded BELOW as well as above. Without
    ge=1, maxEpochs=-1 made `range(max_epochs)` empty: the gradient loop
    never ran, the randomly initialised weights were de-normalised as if
    they were trained, is_trained flipped to True, and the caller's garbage
    model was persisted over the good artifact.
    """

    maxEpochs: int | None = Field(10000, ge=1, le=10000)
    learningRate: float | None = Field(0.01, gt=0, le=1)
    lrDecay: float | None = Field(0.9995, gt=0, le=1)
    l2Lambda: float | None = Field(0.001, ge=0, le=1)
    patience: int | None = Field(500, ge=1, le=1000)
    verbose: bool | None = False

    def training_kwargs(self) -> dict[str, Any]:
        """Resolve explicit nulls to defaults without swallowing valid zeros.

        `req.l2Lambda or 0.001` silently rewrote a caller's deliberate
        l2Lambda=0 (ge=0 accepts it) into the default, so "train without
        regularisation" was impossible to ask for.
        """
        defaults: dict[str, Any] = {
            "max_epochs": (self.maxEpochs, 10000),
            "learning_rate": (self.learningRate, 0.01),
            "lr_decay": (self.lrDecay, 0.9995),
            "l2_lambda": (self.l2Lambda, 0.001),
            "patience": (self.patience, 500),
            "verbose": (self.verbose, False),
        }
        return {k: (fallback if given is None else given) for k, (given, fallback) in defaults.items()}


class TrainRequest(TrainingParams):
    """Train on an explicit property array (nested Mongo-style documents)."""

    # Bounded — an unbounded payload + huge maxEpochs is a CPU/memory DoS.
    properties: list[dict[str, Any]] = Field(..., max_length=5000)


class SeedTrainRequest(TrainingParams):
    """Train on freshly generated Ghanaian seed data."""

    count: int = Field(2500, ge=20, le=10000)
    seed: int = 20260714


class ConfidenceInterval(BaseModel):
    low: int
    high: int


class FeatureContribution(BaseModel):
    """One feature's signed effect, measured against the average property."""

    feature: str
    contribution: float  # GHS above/below the baseline rent
    impactPercent: float  # the same effect as a percentage
    value: float  # the value used, after imputation


class DataQuality(BaseModel):
    """How much of this estimate rests on supplied facts vs. averages."""

    suppliedFields: int
    totalFields: int
    imputedFields: list[str]
    warning: str | None = None


class PredictResponse(BaseModel):
    predictedRent: int
    baselineRent: int  # what the average property in training is worth
    confidenceInterval: ConfidenceInterval
    featureContributions: list[FeatureContribution]
    dataQuality: DataQuality
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
