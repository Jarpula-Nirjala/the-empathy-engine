#!/bin/sh
set -e
echo "=== The Empathy Engine ==="
echo "PORT=${PORT:-8000} USE_VADER_ONLY=${USE_VADER_ONLY:-false}"
mkdir -p /app/audio_output /app/.cache/nltk /app/.cache/huggingface 2>/dev/null || true
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 1 --timeout-keep-alive 75 --log-level info
