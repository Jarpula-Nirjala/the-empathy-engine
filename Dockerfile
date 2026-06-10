FROM python:3.11-slim-bookworm

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HF_HOME=/app/.cache/huggingface \
    TRANSFORMERS_CACHE=/app/.cache/huggingface \
    NLTK_DATA=/app/.cache/nltk

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir -r requirements.txt

RUN mkdir -p /app/.cache/nltk /app/.cache/huggingface /app/audio_output && \
    python -c "import nltk; nltk.download('punkt', download_dir='/app/.cache/nltk'); nltk.download('punkt_tab', download_dir='/app/.cache/nltk')"

# Pre-download emotion model during image build (avoids cold-start timeout)
RUN python -c "\
from transformers import pipeline; \
pipeline('text-classification', model='j-hartmann/emotion-english-distilroberta-base', top_k=None, truncation=True, max_length=512); \
print('Emotion model cached.')"

COPY . .

EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
