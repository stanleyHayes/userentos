"""Request/response schemas for the rental-complaint classifier."""

from typing import Any

from pydantic import BaseModel, Field

from app.legal.text import MAX_CHARS


class ComplaintRequest(BaseModel):
    """One free-text description of a rental situation."""

    # Bounded at both ends: too short to classify, or long enough to be a
    # CPU cost an unauthenticated endpoint should not accept.
    text: str = Field(..., min_length=5, max_length=MAX_CHARS)


class BatchComplaintRequest(BaseModel):
    texts: list[str] = Field(..., min_length=1, max_length=50)


class LabelScore(BaseModel):
    label: str
    probability: float
    threshold: float
    predicted: bool


class ComplaintResponse(BaseModel):
    """Labels only. Whether something is a VIOLATION is not decided here.

    The classifier says what a complaint is about. Applying the statute —
    is 3 months advance lawful, is 8 months not — is arithmetic against
    Section 25 and belongs in the deterministic layer, which is where the
    API does it. A model should not be the thing that decides someone
    committed a crime.
    """

    labels: list[str]
    scores: list[LabelScore]
    featureCount: int
    #: Largest logit contribution from the text alone, excluding the prior.
    evidence: float
    #: True when the text carried too little signal to assert anything.
    abstained: bool
    modelVersion: str


class BatchComplaintResponse(BaseModel):
    results: list[ComplaintResponse]


class LegalStatusResponse(BaseModel):
    isTrained: bool
    trainedAt: str
    sampleCount: int
    labels: list[str]
    metrics: dict[str, Any]
