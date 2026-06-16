FROM python:3.12-slim

WORKDIR /app

# Install uvicorn dependencies
RUN apt-get update && apt-get install -y --no-install-recommends gcc && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/

# Create data directory for model persistence
RUN mkdir -p /app/data

ENV MODEL_PATH=/app/data/pricing-model.json
ENV PORT=8000

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
