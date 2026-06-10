"""
SSML markup builder for expressive speech reference output.

Note: gTTS does not support SSML playback. This module generates SSML
for display and documentation; actual audio uses pydub modulation.
"""

import re
from typing import Any
from xml.sax.saxutils import escape

from emotion_voice_map import EMOTION_VOICE_MAP, get_voice_params

# Words commonly associated with emotional intensity per emotion
EMOTION_KEYWORDS: dict[str, set[str]] = {
    "joy": {
        "amazing", "wonderful", "fantastic", "great", "best", "love", "happy",
        "excited", "promoted", "celebrate", "awesome", "brilliant", "perfect",
    },
    "anger": {
        "unacceptable", "furious", "angry", "hate", "worst", "terrible",
        "outrageous", "ridiculous", "waiting", "hours", "never", "disgusting",
    },
    "sadness": {
        "disappointed", "sad", "lonely", "miss", "cry", "hurt", "lost",
        "hopeless", "depressed", "nothing", "wrong", "sorry", "grief",
    },
    "fear": {
        "scared", "afraid", "terrified", "uncertain", "anxious", "worried",
        "danger", "panic", "nervous", "dread", "unknown", "happening",
    },
    "surprise": {
        "wow", "unexpected", "shocked", "suddenly", "unbelievable", "what",
        "incredible", "astonishing", "surprise", "gosh",
    },
    "disgust": {
        "gross", "revolting", "nasty", "vile", "repulsive", "sickening",
        "ugh", "yuck", "filthy", "disgusting",
    },
    "neutral": set(),
}

EXCLAMATION_PATTERN = re.compile(r"!+")
ALL_CAPS_PATTERN = re.compile(r"\b[A-Z]{2,}\b")
NUMBER_PATTERN = re.compile(r"\b\d+(?:\.\d+)?\b")
DATE_PATTERN = re.compile(
    r"\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|"
    r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4})\b",
    re.IGNORECASE,
)


class SSMLBuilder:
    """Build SSML markup from text, emotion analysis, and voice parameters."""

    def _speed_to_rate(self, speed: float) -> str:
        if speed >= 1.3:
            return "fast"
        if speed >= 1.1:
            return "medium"
        if speed <= 0.8:
            return "x-slow"
        if speed <= 0.9:
            return "slow"
        return "medium"

    def _pitch_to_ssml(self, semitones: float) -> str:
        if semitones == 0:
            return "+0st"
        sign = "+" if semitones > 0 else ""
        return f"{sign}{semitones:.1f}st"

    def _volume_to_ssml(self, db: float) -> str:
        if db == 0:
            return "medium"
        if db >= 4:
            return "loud"
        if db >= 2:
            return "medium"
        if db <= -4:
            return "x-soft"
        if db <= -2:
            return "soft"
        return "medium"

    def _pause_ms(self, pause_factor: float) -> int:
        base_pause = 400
        return max(100, int(base_pause * pause_factor))

    def _detect_emphasis_words(
        self, text: str, emotion: str, confidence: float
    ) -> set[str]:
        """Identify words that should receive SSML emphasis."""
        emphasis: set[str] = set()
        words = re.findall(r"\b[\w']+\b", text)

        for match in ALL_CAPS_PATTERN.finditer(text):
            emphasis.add(match.group().lower())

        if EXCLAMATION_PATTERN.search(text):
            for word in words[-3:]:
                emphasis.add(word.lower())

        keywords = EMOTION_KEYWORDS.get(emotion, set())
        for word in words:
            if word.lower() in keywords:
                emphasis.add(word.lower())

        if confidence > 0.7:
            for word in words:
                if len(word) > 6 and word.lower() not in {
                    "because", "through", "without", "between", "against",
                }:
                    if word[0].isupper() and word.lower() not in emphasis:
                        emphasis.add(word.lower())

        return emphasis

    def _wrap_emphasis(self, word: str, level: str = "moderate") -> str:
        return f'<emphasis level="{level}">{escape(word)}</emphasis>'

    def _process_token(
        self, token: str, emphasis_words: set[str], emotion: str, confidence: float
    ) -> str:
        """Process a single token for SSML wrapping."""
        if DATE_PATTERN.fullmatch(token):
            return f'<say-as interpret-as="date">{escape(token)}</say-as>'
        if NUMBER_PATTERN.fullmatch(token):
            return f'<say-as interpret-as="cardinal">{escape(token)}</say-as>'

        clean = re.sub(r"[^\w']", "", token).lower()
        if clean in emphasis_words:
            level = "strong" if confidence > 0.7 else "moderate"
            if emotion in ("anger", "surprise", "joy"):
                level = "strong"
            inner = escape(token)
            if clean != token.lower().strip(".,!?;:'\""):
                return self._wrap_emphasis(token, level)
            return self._wrap_emphasis(token, level)

        return escape(token)

    def _build_sentence_ssml(
        self,
        sentence: str,
        emotion: str,
        confidence: float,
        voice_params: dict[str, Any],
        use_global_prosody: bool,
    ) -> str:
        """Build SSML for a single sentence."""
        emphasis_words = self._detect_emphasis_words(sentence, emotion, confidence)
        tokens = re.findall(r"\S+|\s+", sentence)
        processed_parts = []

        for token in tokens:
            if token.isspace():
                processed_parts.append(token)
            else:
                processed_parts.append(
                    self._process_token(token, emphasis_words, emotion, confidence)
                )

        inner = "".join(processed_parts)

        if use_global_prosody:
            return inner

        rate = self._speed_to_rate(voice_params["speed"])
        pitch = self._pitch_to_ssml(voice_params["pitch_shift"])
        volume = self._volume_to_ssml(voice_params["volume_boost"])

        return (
            f'<prosody rate="{rate}" pitch="{pitch}" volume="{volume}">'
            f"{inner}</prosody>"
        )

    def build_ssml(
        self,
        text: str,
        emotion_result: dict[str, Any],
        voice_params: dict[str, Any] | None = None,
    ) -> str:
        """
        Build complete SSML document from text and emotion analysis.

        Uses per-sentence prosody when sentence emotions differ significantly
        from the overall primary emotion.
        """
        if voice_params is None:
            voice_params = get_voice_params(
                emotion_result["primary_emotion"],
                emotion_result["confidence"],
            )

        primary = emotion_result["primary_emotion"]
        confidence = emotion_result["confidence"]
        sentence_emotions = emotion_result.get("sentence_emotions", [])

        global_rate = self._speed_to_rate(voice_params["speed"])
        global_pitch = self._pitch_to_ssml(voice_params["pitch_shift"])
        global_volume = self._volume_to_ssml(voice_params["volume_boost"])
        pause_ms = self._pause_ms(voice_params["pause_factor"])

        parts: list[str] = []
        parts.append('<?xml version="1.0"?>')
        parts.append('<speak xmlns="http://www.w3.org/2001/10/synthesis" '
                     'xml:lang="en-US">')

        outer_open = (
            f'<prosody rate="{global_rate}" pitch="{global_pitch}" '
            f'volume="{global_volume}">'
        )

        has_varied_sentences = False
        if sentence_emotions:
            for se in sentence_emotions:
                if se["emotion"] != primary or abs(se["confidence"] - confidence) > 0.25:
                    has_varied_sentences = True
                    break

        if has_varied_sentences and sentence_emotions:
            parts.append(f"<p>{outer_open}")
            for i, se in enumerate(sentence_emotions):
                s_params = get_voice_params(se["emotion"], se["confidence"])
                sentence_ssml = self._build_sentence_ssml(
                    se["sentence"], se["emotion"], se["confidence"], s_params, False
                )
                parts.append(sentence_ssml)
                if i < len(sentence_emotions) - 1:
                    s_pause = self._pause_ms(s_params["pause_factor"])
                    parts.append(f'<break time="{s_pause}ms"/>')
            parts.append("</prosody></p>")
        else:
            parts.append(f"<p>{outer_open}")
            emphasis_words = self._detect_emphasis_words(text, primary, confidence)
            tokens = re.findall(r"\S+|\s+", text)
            for token in tokens:
                if token.isspace():
                    parts.append(token)
                else:
                    parts.append(
                        self._process_token(token, emphasis_words, primary, confidence)
                    )
            parts.append("</prosody></p>")

        parts.append("</speak>")
        return "".join(parts)

    def get_ssml_summary(self, emotion: str) -> str:
        """Return a brief description of the SSML strategy for an emotion."""
        info = EMOTION_VOICE_MAP.get(emotion, EMOTION_VOICE_MAP["neutral"])
        return (
            f"SSML uses prosody modulation ({info['emoji']} {emotion}) with "
            f"rate/pitch/volume adjustments and {info['description'].lower()}"
        )
