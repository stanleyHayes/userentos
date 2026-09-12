"""Rental-complaint classification endpoints."""

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import require_api_key
from app.core.logging import get_logger
from app.legal.classifier import ComplaintClassifier, complaint_classifier
from app.schemas.legal import (
    BatchComplaintRequest,
    BatchComplaintResponse,
    ComplaintRequest,
    ComplaintResponse,
    LegalStatusResponse,
)

logger = get_logger(__name__)

router = APIRouter(tags=["legal"], prefix="/legal")


def guarded_classifier(_: None = Depends(require_api_key)) -> ComplaintClassifier:
    return complaint_classifier


def _require_trained(model: ComplaintClassifier) -> None:
    if not model.is_trained:
        raise HTTPException(
            status_code=503,
            detail="Complaint classifier is not trained. Run scripts/train_legal.py.",
        )


@router.post("/classify", response_model=ComplaintResponse)
def classify(
    req: ComplaintRequest, model: ComplaintClassifier = Depends(guarded_classifier)
) -> dict:
    _require_trained(model)
    try:
        return model.predict(req.text)
    except Exception as exc:
        logger.error("Complaint classification failed: %s", exc)
        raise HTTPException(status_code=500, detail="Classification failed") from exc


@router.post("/classify-batch", response_model=BatchComplaintResponse)
def classify_batch(
    req: BatchComplaintRequest, model: ComplaintClassifier = Depends(guarded_classifier)
) -> dict:
    _require_trained(model)
    results = []
    for text in req.texts:
        try:
            results.append(model.predict(text))
        except Exception as exc:  # keep the batch going on a bad row
            logger.warning("Batch item failed: %s", exc)
            results.append({"labels": [], "scores": [], "featureCount": 0, "modelVersion": ""})
    return {"results": results}


@router.get("/status", response_model=LegalStatusResponse)
def status(model: ComplaintClassifier = Depends(guarded_classifier)) -> dict:
    return model.get_status()
