"""
Emotion detection for The Empathy Engine.

Primary: HuggingFace j-hartmann/emotion-english-distilroberta-base
Fallback: VADER sentiment analysis
"""

import logging
from typing import Any, Optional

import nltk
from nltk.tokenize import sent_tokenize

from emotion_voice_map import EMOTIONS, get_intensity_label

logger = logging.getLogger(__name__)

# Model label → our canonical emotion names
MODEL_LABEL_MAP = {
    "joy": "joy",
    "anger": "anger",
    "sadness": "sadness",
    "fear": "fear",
    "surprise": "surprise",
    "disgust": "disgust",
    "neutral": "neutral",
    "love": "joy",
    "optimism": "joy",
}


class EmotionDetector:
    """Detect emotions from text using a transformer model or VADER fallback."""

    def __init__(self) -> None:
        self._pipeline = None
        self._vader = None
        self._use_transformers = False
        self._model_loaded = False
        self._load_model()

    def _load_model(self) -> None:
        """Attempt to load the HuggingFace emotion classifier."""
        try:
            from transformers import pipeline

            logger.info(
                "Loading emotion model (j-hartmann/emotion-english-distilroberta-base). "
                "First run downloads ~250 MB — please wait..."
            )
            self._pipeline = pipeline(
                "text-classification",
                model="j-hartmann/emotion-english-distilroberta-base",
                top_k=None,
                truncation=True,
                max_length=512,
            )
            self._use_transformers = True
            self._model_loaded = True
            logger.info("Emotion model loaded successfully.")
        except Exception as exc:
            logger.warning(
                "Transformers model unavailable (%s). Falling back to VADER.", exc
            )
            self._load_vader()

    def _load_vader(self) -> None:
        """Load VADER sentiment analyzer as fallback."""
        try:
            from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

            self._vader = SentimentIntensityAnalyzer()
            self._use_transformers = False
            self._model_loaded = True
            logger.info("VADER sentiment analyzer loaded as fallback.")
        except Exception as exc:
            logger.error("Failed to load VADER fallback: %s", exc)
            self._model_loaded = False

    @property
    def model_loaded(self) -> bool:
        return self._model_loaded

    @property
    def using_transformers(self) -> bool:
        return self._use_transformers

    def _normalize_scores(self, raw_scores: dict[str, float]) -> dict[str, float]:
        """Ensure all 7 emotions are present and scores sum to ~1."""
        scores = {e: 0.0 for e in EMOTIONS}
        for label, score in raw_scores.items():
            mapped = MODEL_LABEL_MAP.get(label.lower(), label.lower())
            if mapped in scores:
                scores[mapped] = max(scores[mapped], score)
        total = sum(scores.values())
        if total > 0:
            scores = {k: round(v / total, 4) for k, v in scores.items()}
        else:
            scores["neutral"] = 1.0
        return scores

    def _analyze_transformers(self, text: str) -> dict[str, float]:
        """Run HuggingFace pipeline on text."""
        results = self._pipeline(text)[0]
        raw = {item["label"].lower(): item["score"] for item in results}
        return self._normalize_scores(raw)

    def _analyze_vader(self, text: str) -> dict[str, float]:
        """Map VADER compound score to emotion distribution."""
        compound = self._vader.polarity_scores(text)["compound"]
        scores = {e: 0.0 for e in EMOTIONS}

        if compound >= 0.5:
            scores["joy"] = 0.6 + compound * 0.3
            scores["surprise"] = 0.1
            scores["neutral"] = max(0.0, 0.3 - compound * 0.2)
        elif compound >= 0.05:
            scores["joy"] = 0.4 + compound * 0.3
            scores["neutral"] = 0.4 - compound * 0.2
        elif compound <= -0.5:
            scores["sadness"] = 0.5 + abs(compound) * 0.3
            scores["anger"] = 0.2 + abs(compound) * 0.1
            scores["fear"] = 0.1
        elif compound <= -0.05:
            scores["sadness"] = 0.35 + abs(compound) * 0.3
            scores["anger"] = 0.15 + abs(compound) * 0.2
            scores["neutral"] = max(0.0, 0.4 - abs(compound) * 0.2)
        else:
            scores["neutral"] = 0.85
            scores["surprise"] = 0.05
            scores["joy"] = 0.05
            scores["sadness"] = 0.05

        total = sum(scores.values())
        return {k: round(v / total, 4) for k, v in scores.items()}

    def _score_text(self, text: str) -> dict[str, float]:
        """Score a single text snippet."""
        cleaned = text.strip()
        if not cleaned:
            return {e: (1.0 if e == "neutral" else 0.0) for e in EMOTIONS}

        if self._use_transformers and self._pipeline is not None:
            return self._analyze_transformers(cleaned)
        if self._vader is not None:
            return self._analyze_vader(cleaned)
        return {e: (1.0 if e == "neutral" else 0.0) for e in EMOTIONS}

    def _split_sentences(self, text: str) -> list[str]:
        """Split text into sentences using NLTK."""
        text = text.strip()
        if not text:
            return []
        try:
            sentences = sent_tokenize(text)
        except LookupError:
            nltk.download("punkt", quiet=True)
            sentences = sent_tokenize(text)
        return [s.strip() for s in sentences if s.strip()]

    def _primary_from_scores(self, scores: dict[str, float]) -> tuple[str, float]:
        """Extract primary emotion and confidence from score dict."""
        primary = max(scores, key=scores.get)
        confidence = scores[primary]
        return primary, confidence

    def analyze(self, text: str) -> dict[str, Any]:
        """
        Analyze text for emotions.

        Returns primary emotion, confidence, intensity, all scores,
        and per-sentence breakdown.
        """
        if not text or not text.strip():
            raise ValueError("Text cannot be empty.")

        all_scores = self._score_text(text)
        primary, confidence = self._primary_from_scores(all_scores)

        sentences = self._split_sentences(text)
        sentence_emotions = []
        for sentence in sentences:
            s_scores = self._score_text(sentence)
            s_primary, s_conf = self._primary_from_scores(s_scores)
            sentence_emotions.append(
                {
                    "sentence": sentence,
                    "emotion": s_primary,
                    "confidence": s_conf,
                    "scores": s_scores,
                }
            )

        return {
            "primary_emotion": primary,
            "confidence": round(confidence, 4),
            "intensity": get_intensity_label(confidence),
            "all_scores": all_scores,
            "sentence_emotions": sentence_emotions,
        }


# Module-level singleton for reuse across requests
_detector_instance: Optional[EmotionDetector] = None


def get_detector() -> EmotionDetector:
    """Return a shared EmotionDetector instance."""
    global _detector_instance
    if _detector_instance is None:
        _detector_instance = EmotionDetector()
    return _detector_instance
