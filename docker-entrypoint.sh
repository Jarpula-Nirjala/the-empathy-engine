#!/bin/sh
echo "========================================"
echo " The Empathy Engine — starting"
echo " PORT=${PORT:-8000}"
echo " USE_VADER_ONLY=${USE_VADER_ONLY:-false}"
echo "========================================"

mkdir -p /app/audio_output /app/.cache/nltk 2>/dev/null || true

python -c "
import sys
print('Checking imports...')
import main
print('All imports OK — launching uvicorn')
" || {
  echo "FATAL: Python import failed — see error above"
  exit 1
}

exec python -m uvicorn main:app \
  --host 0.0.0.0 \
  --port "${PORT:-8000}" \
  --workers 1 \
  --log-level info
