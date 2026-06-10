"""
Text-to-speech generation with emotion-based audio modulation.

Uses gTTS for speech synthesis and pydub for post-processing effects.
"""

import io
import logging
import os
import shutil
import subprocess
import tempfile
import uuid
from collections import deque
from pathlib import Path
from typing import Any, Optional

import nltk
from gtts import gTTS
from nltk.tokenize import sent_tokenize

from emotion_voice_map import get_neutral_voice_params, get_voice_params

logger = logging.getLogger(__name__)

AUDIO_OUTPUT_DIR = Path(__file__).parent / "audio_output"
MAX_CACHE_SIZE = 10
BASE_PAUSE_MS = 400
TARGET_FRAME_RATE = 44100
FFMPEG_PATH: Optional[str] = None


def _configure_ffmpeg() -> None:
    """Locate ffmpeg and configure pydub (system PATH or bundled imageio-ffmpeg)."""
    global FFMPEG_PATH
    ffmpeg = shutil.which("ffmpeg")

    if not ffmpeg:
        try:
            import imageio_ffmpeg

            ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
            logger.info("Using bundled ffmpeg from imageio-ffmpeg.")
        except ImportError:
            logger.warning(
                "ffmpeg not found on PATH and imageio-ffmpeg not installed. "
                "Install ffmpeg or run: pip install imageio-ffmpeg"
            )
            return

    FFMPEG_PATH = ffmpeg

    import pydub.utils as pydub_utils

    pydub_utils.get_encoder_name = lambda: ffmpeg
    pydub_utils.get_prober_name = lambda: ffmpeg

    from pydub import AudioSegment

    AudioSegment.converter = ffmpeg
    AudioSegment.ffmpeg = ffmpeg
    AudioSegment.ffprobe = ffmpeg


_configure_ffmpeg()

from pydub import AudioSegment


class VoiceModulator:
    """Generate emotionally modulated speech audio from text."""

    def __init__(self, output_dir: Optional[Path] = None) -> None:
        self.output_dir = output_dir or AUDIO_OUTPUT_DIR
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self._file_cache: deque[str] = deque(maxlen=MAX_CACHE_SIZE)

    def apply_speed(self, audio: AudioSegment, speed_factor: float) -> AudioSegment:
        """
        Change playback speed without altering pitch (frame-rate trick).

        speed_factor > 1.0 = faster, < 1.0 = slower.
        """
        if speed_factor == 1.0:
            return audio
        new_frame_rate = int(audio.frame_rate * speed_factor)
        modified = audio._spawn(
            audio.raw_data, overrides={"frame_rate": new_frame_rate}
        )
        return modified.set_frame_rate(TARGET_FRAME_RATE)

    def apply_pitch(self, audio: AudioSegment, semitones: float) -> AudioSegment:
        """
        Shift pitch using frame-rate manipulation, then correct duration.

        Positive semitones = higher pitch.
        """
        if semitones == 0:
            return audio
        factor = 2 ** (semitones / 12.0)
        new_frame_rate = int(audio.frame_rate * factor)
        shifted = audio._spawn(
            audio.raw_data, overrides={"frame_rate": new_frame_rate}
        )
        shifted = shifted.set_frame_rate(TARGET_FRAME_RATE)
        return shifted

    def apply_volume(self, audio: AudioSegment, db_change: float) -> AudioSegment:
        """Adjust volume in decibels."""
        if db_change == 0:
            return audio
        return audio + db_change

    def _split_sentences(self, text: str) -> list[str]:
        text = text.strip()
        if not text:
            return []
        try:
            sentences = sent_tokenize(text)
        except LookupError:
            nltk.download("punkt", quiet=True)
            sentences = sent_tokenize(text)
        return [s.strip() for s in sentences if s.strip()]

    def _generate_sentence_audio(self, sentence: str) -> AudioSegment:
        """Generate raw TTS audio for a single sentence via gTTS."""
        if not FFMPEG_PATH:
            raise RuntimeError(
                "ffmpeg is required for audio processing. "
                "Install ffmpeg system-wide or run: pip install imageio-ffmpeg"
            )

        tts = gTTS(text=sentence, lang="en", slow=False)
        mp3_buffer = io.BytesIO()
        tts.write_to_fp(mp3_buffer)
        mp3_data = mp3_buffer.getvalue()

        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
                tmp.write(mp3_data)
                tmp_path = tmp.name

            cmd = [FFMPEG_PATH, "-y", "-i", tmp_path, "-f", "wav", "-"]
            result = subprocess.run(cmd, capture_output=True, check=True)
            return AudioSegment.from_wav(io.BytesIO(result.stdout))
        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.unlink(tmp_path)

    def _modulate_segment(
        self, audio: AudioSegment, voice_params: dict[str, Any]
    ) -> AudioSegment:
        """Apply all voice modulation effects to an audio segment."""
        result = audio
        result = self.apply_speed(result, voice_params["speed"])
        result = self.apply_pitch(result, voice_params["pitch_shift"])
        result = self.apply_volume(result, voice_params["volume_boost"])
        return result

    def _make_silence(self, pause_factor: float) -> AudioSegment:
        duration_ms = max(50, int(BASE_PAUSE_MS * pause_factor))
        return AudioSegment.silent(duration=duration_ms, frame_rate=TARGET_FRAME_RATE)

    def _cleanup_old_files(self) -> None:
        """Remove cached files beyond the maximum cache size."""
        while len(self._file_cache) > MAX_CACHE_SIZE:
            old_file = self._file_cache.popleft()
            old_path = self.output_dir / old_file
            if old_path.exists():
                try:
                    old_path.unlink()
                    logger.debug("Removed cached audio: %s", old_file)
                except OSError as exc:
                    logger.warning("Could not delete %s: %s", old_file, exc)

    def generate_audio(
        self,
        text: str,
        emotion_result: dict[str, Any],
        force_neutral: bool = False,
    ) -> str:
        """
        Generate modulated speech audio and return the output filename.

        Args:
            text: Input text to speak.
            emotion_result: Output from EmotionDetector.analyze().
            force_neutral: If True, use flat/neutral voice parameters.

        Returns:
            Filename (not full path) of the generated MP3.
        """
        if not text or not text.strip():
            raise ValueError("Text cannot be empty.")

        if force_neutral:
            voice_params = get_neutral_voice_params()
            voice_params["speed"] = 1.0
            voice_params["pitch_shift"] = 0
            voice_params["volume_boost"] = 0.0
            voice_params["pause_factor"] = 1.0
        else:
            voice_params = get_voice_params(
                emotion_result["primary_emotion"],
                emotion_result["confidence"],
            )

        sentences = self._split_sentences(text)
        if not sentences:
            sentences = [text.strip()]

        sentence_emotions = emotion_result.get("sentence_emotions", [])
        combined = AudioSegment.empty()

        for i, sentence in enumerate(sentences):
            raw = self._generate_sentence_audio(sentence)

            if force_neutral:
                params = voice_params
            elif sentence_emotions and i < len(sentence_emotions):
                se = sentence_emotions[i]
                params = get_voice_params(se["emotion"], se["confidence"])
            else:
                params = voice_params

            modulated = self._modulate_segment(raw, params)
            combined += modulated

            if i < len(sentences) - 1:
                combined += self._make_silence(params["pause_factor"])

        filename = f"{uuid.uuid4().hex}.mp3"
        output_path = self.output_dir / filename
        combined.export(str(output_path), format="mp3", bitrate="192k")

        self._file_cache.append(filename)
        self._cleanup_old_files()

        logger.info("Generated audio: %s (emotion=%s)", filename, voice_params.get("emotion"))
        return filename


# Module-level singleton
_modulator_instance: Optional[VoiceModulator] = None


def get_modulator() -> VoiceModulator:
    """Return a shared VoiceModulator instance."""
    global _modulator_instance
    if _modulator_instance is None:
        _modulator_instance = VoiceModulator()
    return _modulator_instance
