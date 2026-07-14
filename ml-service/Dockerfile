# RentOS Pricing ML Service — production image
FROM python:3.13-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    MODEL_PATH=/app/data/pricing-model.json \
    PORT=8000

# Dependencies first (better layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code + seed tooling
COPY app/ ./app/
COPY scripts/ ./scripts/

# Bake in a pre-trained model (from deterministic seed data) so the service
# is useful on first boot; POST /train can retrain on production data later.
RUN mkdir -p /app/data && python scripts/train_seed.py --count 2500

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
