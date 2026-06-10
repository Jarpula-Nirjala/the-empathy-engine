"""
Emotion-to-voice parameter mapping for The Empathy Engine.

Each emotion defines baseline vocal characteristics that are scaled by
detection confidence via intensity_scale().
"""

from typing import Any

EMOTIONS = ("joy", "anger", "sadness", "fear", "surprise", "disgust", "neutral")

EMOTION_VOICE_MAP: dict[str, dict[str, Any]] = {
    "joy": {
        "speed": 1.3,
        "pitch_shift": 3,
        "volume_boost": 3.0,
        "pause_factor": 0.7,
        "description": (
            "Upbeat and energetic delivery — faster pace, brighter pitch, "
            "and a confident volume lift that conveys warmth and excitement."
        ),
        "color": "#fbbf24",
        "emoji": "😊",
    },
    "anger": {
        "speed": 1.4,
        "pitch_shift": -2,
        "volume_boost": 5.0,
        "pause_factor": 0.5,
        "description": (
            "Forceful and clipped — rapid speech, a lower pitch edge, "
            "and elevated volume with minimal pauses between sentences."
        ),
        "color": "#ef4444",
        "emoji": "😡",
    },
    "sadness": {
        "speed": 0.75,
        "pitch_shift": -4,
        "volume_boost": -3.0,
        "pause_factor": 1.8,
        "description": (
            "Somber and reflective — slower tempo, a deeper pitch, "
            "softer volume, and extended pauses that give weight to each phrase."
        ),
        "color": "#6366f1",
        "emoji": "😔",
    },
    "fear": {
        "speed": 1.2,
        "pitch_shift": 4,
        "volume_boost": -2.0,
        "pause_factor": 0.6,
        "description": (
            "Anxious and tense — slightly rushed delivery, a higher pitch, "
            "quieter volume, and short hesitant pauses between sentences."
        ),
        "color": "#a855f7",
        "emoji": "😨",
    },
    "surprise": {
        "speed": 1.35,
        "pitch_shift": 5,
        "volume_boost": 0.0,
        "pause_factor": 0.4,
        "description": (
            "A sudden burst of energy — fast delivery, a sharp pitch rise, "
            "and very short pauses that mimic an exclamation of astonishment."
        ),
        "color": "#f97316",
        "emoji": "😲",
    },
    "disgust": {
        "speed": 0.85,
        "pitch_shift": -2,
        "volume_boost": 0.0,
        "pause_factor": 1.1,
        "description": (
            "Measured and dismissive — deliberately slower speech with a "
            "slightly lower pitch and normal volume, conveying revulsion."
        ),
        "color": "#84cc16",
        "emoji": "🤢",
    },
    "neutral": {
        "speed": 1.0,
        "pitch_shift": 0,
        "volume_boost": 0.0,
        "pause_factor": 1.0,
        "description": (
            "Balanced and clear — standard pace, pitch, and volume "
            "with natural pauses for everyday conversational speech."
        ),
        "color": "#94a3b8",
        "emoji": "😐",
    },
}


def intensity_scale(base_value: float, emotion_score: float, neutral: float = 0.0) -> float:
    """
    Scale a vocal parameter by emotion confidence.

    At score 0.5 → 50% of max modulation from neutral is applied.
    At score 1.0 → 100% of max modulation is applied.

    Uses scale = emotion_score * 2 so that a confidence of 0.5 yields
    exactly half the full effect (e.g. joy pitch +3 at 0.6 → +3.6 semitones).
    """
    scale = min(emotion_score * 2.0, 1.0)
    delta = base_value - neutral
    return neutral + delta * scale


def get_intensity_label(confidence: float) -> str:
    """Map confidence score to a human-readable intensity label."""
    if confidence < 0.4:
        return "low"
    if confidence <= 0.7:
        return "medium"
    return "high"


def get_voice_params(emotion: str, confidence: float) -> dict[str, Any]:
    """
    Return scaled voice parameters for the given emotion and confidence.

    All modulation parameters are linearly scaled from neutral (1.0 / 0 dB)
    based on the detection confidence score.
    """
    base = EMOTION_VOICE_MAP.get(emotion, EMOTION_VOICE_MAP["neutral"]).copy()
    scale = min(confidence * 2.0, 1.0)

    speed = 1.0 + (base["speed"] - 1.0) * scale
    pitch_shift = round(base["pitch_shift"] * confidence * 2.0, 1)
    volume_boost = round(base["volume_boost"] * confidence * 2.0, 1)
    pause_factor = 1.0 + (base["pause_factor"] - 1.0) * scale

    return {
        "speed": round(speed, 3),
        "pitch_shift": pitch_shift,
        "volume_boost": volume_boost,
        "pause_factor": round(pause_factor, 3),
        "description": base["description"],
        "color": base["color"],
        "emoji": base["emoji"],
        "emotion": emotion,
        "confidence": confidence,
        "intensity": get_intensity_label(confidence),
    }


def get_neutral_voice_params() -> dict[str, Any]:
    """Return flat/neutral voice parameters for comparison audio."""
    return get_voice_params("neutral", 0.0)
