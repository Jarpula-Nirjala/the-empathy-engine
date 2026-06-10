# 🎙️ The Empathy Engine

**AI that doesn't just speak — it feels.**

The Empathy Engine is a production-ready web application that detects emotion from text using a state-of-the-art transformer model and generates expressive, emotionally modulated AI speech audio. Enter any sentence — joy, anger, sadness, fear — and hear it spoken with a voice that matches the feeling.

## Key Features

- **7-emotion detection** — joy, anger, sadness, fear, surprise, disgust, neutral
- **Transformer-powered analysis** — `j-hartmann/emotion-english-distilroberta-base` with VADER fallback
- **Emotion-modulated TTS** — gTTS + pydub speed/pitch/volume/pause adjustment
- **Side-by-side comparison** — hear flat/robotic vs emotional/empathetic speech
- **SSML preview** — generated Speech Synthesis Markup Language for reference
- **Interactive radar chart** — visualize all emotion scores at once
- **Live waveform visualization** — Web Audio API bars during playback
- **Sentence-level analysis** — per-sentence emotion breakdown for granular modulation

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Browser (index.html)                        │
│  Tailwind CSS · Chart.js · Web Audio API · Fetch API               │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTP
┌──────────────────────────────▼──────────────────────────────────────┐
│                      FastAPI Backend (main.py)                      │
│  POST /analyze  ·  POST /generate  ·  POST /compare  ·  GET /audio │
└──────┬──────────────────┬─────────────────────┬─────────────────────┘
       │                  │                     │
┌──────▼──────┐  ┌────────▼────────┐  ┌────────▼────────┐
│  Emotion    │  │  SSML Builder   │  │ Voice Modulator │
│  Detector   │  │  (reference)    │  │  gTTS + pydub   │
│ transformers│  │                 │  │                 │
│  or VADER   │  └─────────────────┘  └────────┬────────┘
└─────────────┘                                 │
       │                              ┌──────────▼──────────┐
       │                              │  emotion_voice_map  │
       │                              │  (parameter config) │
       └──────────────────────────────┴─────────────────────┘
```

## Project Structure

```
The_Empathy_Engine/
├── main.py                  # FastAPI backend
├── emotion_detector.py      # Emotion classification logic
├── voice_modulator.py       # TTS + audio parameter modulation
├── ssml_builder.py          # SSML prompt builder for expressive speech
├── emotion_voice_map.py     # Emotion → vocal parameter mapping config
├── requirements.txt
├── .env.example
├── static/
│   └── index.html           # Full frontend
├── audio_output/            # Generated audio files (auto-created)
└── README.md
```

## Setup Instructions

### Prerequisites

- **Python 3.10+**
- **ffmpeg** — required by pydub for audio processing (bundled automatically via `imageio-ffmpeg`, or install system-wide)

#### Installing ffmpeg

**Windows (winget):**
```bash
winget install ffmpeg
```

**Windows (Chocolatey):**
```bash
choco install ffmpeg
```

**macOS:**
```bash
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt update && sudo apt install ffmpeg
```

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd The_Empathy_Engine
   ```

2. **Install Python dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Download NLTK punkt tokenizer**
   ```bash
   python -c "import nltk; nltk.download('punkt'); nltk.download('punkt_tab')"
   ```

4. **Start the server**
   ```bash
   uvicorn main:app --reload
   ```

5. **Open the app**
   
   Navigate to [http://localhost:8000](http://localhost:8000)

> **Note:** On first run, the HuggingFace emotion model (~250 MB) downloads automatically. You'll see a startup message in the terminal — please wait for it to complete before making requests.

## API Endpoints

| Method | Endpoint       | Description                              |
|--------|----------------|------------------------------------------|
| GET    | `/`            | Serve the frontend                       |
| POST   | `/analyze`     | Emotion analysis only (no audio)         |
| POST   | `/generate`    | Full pipeline: analyze + generate audio  |
| POST   | `/compare`     | Generate emotional + flat audio pair     |
| GET    | `/audio/{file}`| Serve generated MP3 files                |
| GET    | `/health`      | Health check + model status              |

## Emotion-to-Voice Mapping

| Emotion   | Speed | Pitch | Volume | Pauses | Emoji |
|-----------|-------|-------|--------|--------|-------|
| Joy       | 1.3×  | +3 st | +3 dB  | 0.7×   | 😊    |
| Anger     | 1.4×  | −2 st | +5 dB  | 0.5×   | 😡    |
| Sadness   | 0.75× | −4 st | −3 dB  | 1.8×   | 😔    |
| Fear      | 1.2×  | +4 st | −2 dB  | 0.6×   | 😨    |
| Surprise  | 1.35× | +5 st | 0 dB   | 0.4×   | 😲    |
| Disgust   | 0.85× | −2 st | 0 dB   | 1.1×   | 🤢    |
| Neutral   | 1.0×  | 0 st  | 0 dB   | 1.0×   | 😐    |

All parameters are scaled linearly by detection confidence. At confidence 0.5, 50% of max modulation is applied; at 1.0, 100% is applied. Example: joy at 0.6 confidence → pitch shift = +3 × 0.6 × 2 = +3.6 semitones.

## Design Decisions

### Why DistilRoBERTa over VADER?

VADER is a lexicon-based sentiment analyzer that only distinguishes positive/negative/neutral compound scores. It cannot detect fine-grained emotions like fear, disgust, or surprise independently. The `j-hartmann/emotion-english-distilroberta-base` model is fine-tuned on emotion-labeled data and returns calibrated scores across all 7 emotion categories simultaneously — essential for nuanced voice modulation. VADER remains as a lightweight fallback when transformers/torch are unavailable.

### Why gTTS + pydub over pyttsx3?

`pyttsx3` uses OS-native voices (SAPI5 on Windows, NSS on macOS) which vary wildly in quality and cannot be deployed consistently in server environments. **gTTS** produces clean, consistent English speech via Google's TTS API and works identically across platforms. **pydub** then applies post-processing (speed via frame-rate manipulation, pitch shifting, volume dB adjustment, inter-sentence pauses) to modulate the flat gTTS output into emotionally expressive speech — a approach that separates synthesis from expression.

### How Intensity Scaling Works

Each emotion defines baseline vocal parameters (speed, pitch, volume, pause factor). The model's confidence score (0.0–1.0) scales the *delta* from neutral:

```
scaled_value = neutral + (base_value − neutral) × min(confidence × 2, 1.0)
```

For pitch/volume: `scaled = base × confidence × 2` (e.g., joy pitch +3 at 0.6 confidence → +3.6 semitones). This ensures low-confidence detections produce subtle modulation while high-confidence detections produce dramatic, clearly audible differences.

### SSML Generation Approach

SSML (Speech Synthesis Markup Language) is generated for display and documentation purposes. Since gTTS does not support SSML playback, the actual audio pipeline uses pydub post-processing. The SSML preview shows what *would* be sent to an SSML-capable engine (Amazon Polly, Google Cloud TTS), including `<prosody>`, `<break>`, `<emphasis>`, and `<say-as>` tags. Per-sentence prosody is applied when sentence-level emotions differ significantly from the overall primary emotion.

## Known Limitations

- **Internet required for gTTS** — speech synthesis calls Google's TTS API
- **ffmpeg dependency** — pydub requires ffmpeg; `imageio-ffmpeg` is included in requirements as a bundled fallback, or install ffmpeg system-wide for best performance
- **First-run model download** — ~250 MB HuggingFace model download on initial startup
- **English only** — emotion model and TTS are English-language only
- **Pitch/speed artifacts** — frame-rate pitch shifting can introduce minor quality degradation at extreme values
- **No real-time streaming** — audio is generated per-request and saved to disk

## Future Improvements

- Support for additional languages and multilingual emotion models
- Integration with SSML-capable TTS engines (Amazon Polly, Azure Speech)
- Real-time streaming audio generation via WebSockets
- User-adjustable emotion override sliders
- Voice selection (male/female/accent variants)
- Docker containerization with ffmpeg bundled
- GPU acceleration for batch emotion analysis

## License

MIT License — see LICENSE file for details.
