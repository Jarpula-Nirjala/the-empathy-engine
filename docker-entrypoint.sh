#!/bin/sh
set -e

echo "Starting The Empathy Engine..."
echo "PORT=${PORT:-8000}"

# Ensure runtime directories exist (Render ephemeral disk)
mkdir -p /app/audio_output /app/.cache/huggingface /app/.cache/nltk

exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 1
