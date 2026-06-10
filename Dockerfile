FROM python:3.11-slim-bookworm

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/app/.cache/huggingface \
    TRANSFORMERS_CACHE=/app/.cache/huggingface \
    NLTK_DATA=/app/.cache/nltk \
    PORT=8000

# System deps: ffmpeg for pydub audio processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Python deps (layer cached separately from app code)
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install torch --index-url https://download.pytorch.org/whl/cpu && \
    pip install -r requirements.txt

# Pre-download NLTK + HuggingFace model into image (fast cold starts on Render)
COPY scripts/preload_models.py scripts/preload_models.py
RUN mkdir -p /app/.cache/nltk /app/.cache/huggingface /app/audio_output && \
    python scripts/preload_models.py

# Application code
COPY main.py emotion_detector.py emotion_voice_map.py voice_modulator.py ssml_builder.py ./
COPY static/ static/
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:' + __import__('os').environ.get('PORT','8000') + '/health')" || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
