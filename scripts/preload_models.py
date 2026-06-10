"""Pre-download NLTK data and HuggingFace emotion model for Docker/Render."""

import os
import sys


def main() -> None:
    nltk_dir = os.environ.get("NLTK_DATA", "/app/.cache/nltk")
    os.makedirs(nltk_dir, exist_ok=True)

    print("Downloading NLTK punkt tokenizers...")
    import nltk

    nltk.download("punkt", download_dir=nltk_dir)
    nltk.download("punkt_tab", download_dir=nltk_dir)
    print("NLTK ready.")

    hf_home = os.environ.get("HF_HOME", "/app/.cache/huggingface")
    os.makedirs(hf_home, exist_ok=True)
    os.environ["TRANSFORMERS_CACHE"] = hf_home

    print("Downloading emotion model (~250 MB)...")
    from transformers import pipeline

    pipeline(
        "text-classification",
        model="j-hartmann/emotion-english-distilroberta-base",
        top_k=None,
        truncation=True,
        max_length=512,
    )
    print("Emotion model cached successfully.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"preload_models failed: {exc}", file=sys.stderr)
        sys.exit(1)
