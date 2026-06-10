"""
The Empathy Engine — FastAPI backend.

Detects emotion from text and generates emotionally modulated AI speech.
"""

import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import nltk
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from emotion_detector import get_detector
from emotion_voice_map import EMOTION_VOICE_MAP, EMOTIONS, get_voice_params
from ssml_builder import SSMLBuilder
from voice_modulator import AUDIO_OUTPUT_DIR, get_modulator

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

STATIC_DIR = Path(__file__).parent / "static"
ssml_builder = SSMLBuilder()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: create directories, download NLTK data, warm up models."""
    AUDIO_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    STATIC_DIR.mkdir(parents=True, exist_ok=True)

    logger.info("Downloading NLTK punkt tokenizer...")
    try:
        nltk.download("punkt", quiet=True)
        nltk.download("punkt_tab", quiet=True)
    except Exception as exc:
        logger.warning("NLTK download issue (may retry on demand): %s", exc)

    logger.info(
        "Initializing The Empathy Engine — emotion model may download ~250 MB on first run."
    )
    detector = get_detector()
    if detector.model_loaded:
        backend = "transformers" if detector.using_transformers else "VADER"
        logger.info("Emotion detector ready (backend: %s).", backend)
    else:
        logger.error("Emotion detector failed to initialize.")

    get_modulator()
    logger.info("Voice modulator ready. Server is live.")
    yield
    logger.info("Shutting down The Empathy Engine.")


app = FastAPI(
    title="The Empathy Engine",
    description="Detect emotion from text and generate expressive AI speech.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/assets", StaticFiles(directory=str(STATIC_DIR)), name="assets")


class TextRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)


class GenerateRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    preview_only: bool = False
    emotion_override: str | None = Field(
        default=None,
        description="Force a specific emotion (joy, anger, sadness, fear, surprise, disgust, neutral)",
    )


# In-memory session statistics
_session_stats: dict[str, Any] = {
    "total_analyses": 0,
    "total_generations": 0,
    "total_comparisons": 0,
    "emotion_counts": {},
}


def _record_emotion(emotion: str) -> None:
    counts = _session_stats["emotion_counts"]
    counts[emotion] = counts.get(emotion, 0) + 1


def _apply_emotion_override(
    emotion_result: dict[str, Any], override: str | None
) -> dict[str, Any]:
    """Apply manual emotion override if provided."""
    if not override:
        return emotion_result
    override = override.lower().strip()
    from emotion_voice_map import EMOTIONS

    if override not in EMOTIONS:
        raise ValueError(f"Invalid emotion override. Choose from: {', '.join(EMOTIONS)}")

    result = dict(emotion_result)
    confidence = max(result["confidence"], 0.75)
    result["primary_emotion"] = override
    result["confidence"] = confidence
    result["intensity"] = (
        "high" if confidence > 0.7 else "medium" if confidence >= 0.4 else "low"
    )
    scores = {e: 0.05 for e in EMOTIONS}
    scores[override] = confidence
    remaining = 1.0 - confidence
    others = [e for e in EMOTIONS if e != override]
    per_other = remaining / len(others)
    for e in others:
        scores[e] = round(per_other, 4)
    result["all_scores"] = scores
    result["overridden"] = True
    return result


def _build_analysis_response(text: str) -> dict[str, Any]:
    """Run emotion analysis and attach voice params + SSML preview."""
    detector = get_detector()
    result = detector.analyze(text)
    voice_params = get_voice_params(result["primary_emotion"], result["confidence"])
    ssml = ssml_builder.build_ssml(text, result, voice_params)
    return {
        **result,
        "voice_params": voice_params,
        "ssml_preview": ssml,
    }


@app.get("/")
async def serve_index():
    """Serve the single-page frontend."""
    index_path = STATIC_DIR / "index.html"
    if not index_path.exists():
        raise HTTPException(status_code=404, detail="Frontend not found.")
    return FileResponse(index_path, media_type="text/html")


@app.post("/analyze")
async def analyze_text(request: TextRequest):
    """Analyze text for emotions without generating audio."""
    try:
        start = time.perf_counter()
        response = _build_analysis_response(request.text)
        response["processing_time_ms"] = round((time.perf_counter() - start) * 1000)
        _session_stats["total_analyses"] += 1
        _record_emotion(response["primary_emotion"])
        return response
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Analysis failed")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {exc}") from exc


@app.post("/generate")
async def generate_audio(request: GenerateRequest):
    """Detect emotion and generate modulated speech audio."""
    try:
        start = time.perf_counter()
        detector = get_detector()
        modulator = get_modulator()

        emotion_result = detector.analyze(request.text)
        emotion_result = _apply_emotion_override(
            emotion_result, request.emotion_override
        )
        voice_params = get_voice_params(
            emotion_result["primary_emotion"], emotion_result["confidence"]
        )
        ssml = ssml_builder.build_ssml(request.text, emotion_result, voice_params)

        if request.preview_only:
            return {
                "preview_only": True,
                "emotion": emotion_result["primary_emotion"],
                "confidence": emotion_result["confidence"],
                "intensity": emotion_result["intensity"],
                "overridden": emotion_result.get("overridden", False),
                "voice_params": voice_params,
                "all_scores": emotion_result["all_scores"],
                "sentence_emotions": emotion_result["sentence_emotions"],
                "ssml": ssml,
                "processing_time_ms": round((time.perf_counter() - start) * 1000),
            }

        filename = modulator.generate_audio(request.text, emotion_result)
        elapsed = round((time.perf_counter() - start) * 1000)
        _session_stats["total_generations"] += 1
        _record_emotion(emotion_result["primary_emotion"])

        return {
            "audio_url": f"/audio/{filename}",
            "filename": filename,
            "emotion": emotion_result["primary_emotion"],
            "confidence": emotion_result["confidence"],
            "intensity": emotion_result["intensity"],
            "overridden": emotion_result.get("overridden", False),
            "voice_params": voice_params,
            "all_scores": emotion_result["all_scores"],
            "sentence_emotions": emotion_result["sentence_emotions"],
            "ssml": ssml,
            "processing_time_ms": elapsed,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Audio generation failed")
        raise HTTPException(
            status_code=500, detail=f"Audio generation failed: {exc}"
        ) from exc


@app.post("/compare")
async def compare_voices(request: TextRequest):
    """Generate emotional and flat/neutral audio for side-by-side comparison."""
    try:
        start = time.perf_counter()
        detector = get_detector()
        modulator = get_modulator()

        emotion_result = detector.analyze(request.text)
        voice_params = get_voice_params(
            emotion_result["primary_emotion"], emotion_result["confidence"]
        )
        ssml = ssml_builder.build_ssml(request.text, emotion_result, voice_params)

        emotional_file = modulator.generate_audio(request.text, emotion_result)
        flat_file = modulator.generate_audio(
            request.text, emotion_result, force_neutral=True
        )

        elapsed = round((time.perf_counter() - start) * 1000)
        _session_stats["total_comparisons"] += 1
        _record_emotion(emotion_result["primary_emotion"])

        return {
            "emotional_audio_url": f"/audio/{emotional_file}",
            "flat_audio_url": f"/audio/{flat_file}",
            "emotional_filename": emotional_file,
            "flat_filename": flat_file,
            "emotion": emotion_result["primary_emotion"],
            "confidence": emotion_result["confidence"],
            "intensity": emotion_result["intensity"],
            "voice_params": voice_params,
            "all_scores": emotion_result["all_scores"],
            "sentence_emotions": emotion_result["sentence_emotions"],
            "ssml": ssml,
            "processing_time_ms": elapsed,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Compare generation failed")
        raise HTTPException(
            status_code=500, detail=f"Compare generation failed: {exc}"
        ) from exc


@app.get("/audio/{filename}")
async def serve_audio(filename: str):
    """Serve a generated audio file."""
    if not filename.endswith(".mp3") or ".." in filename or "/" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename.")

    audio_path = AUDIO_OUTPUT_DIR / filename
    if not audio_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found.")

    return FileResponse(audio_path, media_type="audio/mpeg")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    detector = get_detector()
    return {
        "status": "ok",
        "model_loaded": detector.model_loaded,
        "backend": "transformers" if detector.using_transformers else "vader",
    }


@app.get("/emotions")
async def list_emotions():
    """Return emotion metadata for the UI."""
    return {
        "emotions": [
            {"id": e, **EMOTION_VOICE_MAP[e]} for e in EMOTIONS
        ]
    }


@app.get("/stats")
async def session_stats():
    """Return in-memory session statistics."""
    top_emotion = None
    if _session_stats["emotion_counts"]:
        top_emotion = max(
            _session_stats["emotion_counts"],
            key=_session_stats["emotion_counts"].get,
        )
    return {
        **_session_stats,
        "top_emotion": top_emotion,
        "total_requests": (
            _session_stats["total_analyses"]
            + _session_stats["total_generations"]
            + _session_stats["total_comparisons"]
        ),
    }
