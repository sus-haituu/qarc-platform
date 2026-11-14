FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Secrets must be injected at runtime via host environment variables:
#   ANGEL_API_KEY, ANGEL_CLIENT_CODE, ANGEL_PASSWORD, ANGEL_TOTP_SECRET,
#   DATABASE_URL, GEMINI_API_KEY, QARC_MODEL_ENDPOINT

COPY requirements-cloud.txt .
RUN pip install --no-cache-dir -r requirements-cloud.txt

COPY *.py ./
COPY data/raw_bhavcopy_data.csv data/nse_bulk_block_deals_cache.csv data/regime_vector_panel.csv ./data/

EXPOSE 7860

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860}"]
