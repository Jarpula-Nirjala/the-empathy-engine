#!/usr/bin/env bash
# Render native Python build (alternative to Docker)
set -o errexit

pip install --upgrade pip
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt

python -c "import nltk; nltk.download('punkt'); nltk.download('punkt_tab')"

echo "Build complete."
