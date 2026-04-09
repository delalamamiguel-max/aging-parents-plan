#!/usr/bin/env python3
"""
Aging Parents Plan — Local Whisper Transcription Server
========================================================
Runs a lightweight Flask HTTP server that accepts audio files and returns
transcripts using faster-whisper (a faster reimplementation of OpenAI Whisper).

Usage
-----
1. Install dependencies (one-time):
   pip install faster-whisper flask

2. Start the server:
   python whisper_server.py

   Or with a specific model size:
   WHISPER_MODEL=small python whisper_server.py

3. The server runs at http://localhost:9000
   The app will POST audio to: POST /transcribe

Model sizes
-----------
  tiny    ~75MB   Fastest, lower accuracy. Good for clear speech.
  base    ~145MB  Recommended. Good balance of speed and accuracy.
  small   ~465MB  Better at names and medical terms.
  medium  ~1.5GB  Best accuracy. Needs a good GPU or wait ~60s on CPU.

Environment variables
---------------------
  WHISPER_MODEL   Model size to load (default: base)
  WHISPER_PORT    Port to listen on (default: 9000)
  WHISPER_DEVICE  'cpu' or 'cuda' (default: cpu)
"""

import os
import io
import sys
import tempfile
import logging
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [whisper_server] %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ── Check dependencies ────────────────────────────────────────────────────────

try:
    from faster_whisper import WhisperModel
except ImportError:
    log.error("faster-whisper not installed. Run: pip install faster-whisper flask")
    sys.exit(1)

try:
    from flask import Flask, request, jsonify
except ImportError:
    log.error("Flask not installed. Run: pip install faster-whisper flask")
    sys.exit(1)

# ── Config ────────────────────────────────────────────────────────────────────

MODEL_SIZE = os.environ.get("WHISPER_MODEL", "base")
PORT = int(os.environ.get("WHISPER_PORT", "9000"))
DEVICE = os.environ.get("WHISPER_DEVICE", "cpu")
COMPUTE_TYPE = "int8"  # best for CPU, change to "float16" for CUDA

SUPPORTED_EXTENSIONS = {".m4a", ".mp4", ".wav", ".mp3", ".webm", ".caf", ".ogg", ".flac"}

# ── Load model (at startup) ───────────────────────────────────────────────────

log.info(f"Loading Whisper model: {MODEL_SIZE!r} on {DEVICE!r}...")
log.info("This may take a minute on first run while the model downloads.")

try:
    model = WhisperModel(MODEL_SIZE, device=DEVICE, compute_type=COMPUTE_TYPE)
    log.info(f"Whisper model loaded. Server ready.")
except Exception as e:
    log.error(f"Failed to load Whisper model: {e}")
    sys.exit(1)

# ── Flask app ─────────────────────────────────────────────────────────────────

app = Flask(__name__)


@app.route("/health", methods=["GET"])
def health():
    """Health check — used by the app to confirm the server is reachable."""
    return jsonify({"status": "ok", "model": MODEL_SIZE})


@app.route("/transcribe", methods=["POST"])
def transcribe():
    """
    Transcribe an uploaded audio file.

    Request:  multipart/form-data
              file: audio file (any format in SUPPORTED_EXTENSIONS)
              language: optional, 'en' or 'es' (default: auto-detect)

    Response: { "transcript": "...", "language": "en", "duration_s": 12.4 }
    Error:    { "error": "...", "code": "no_speech|format_error|server_error" }
    """
    if "file" not in request.files:
        return jsonify({"error": "No audio file provided", "code": "format_error"}), 400

    audio_file = request.files["file"]
    language = request.form.get("language", None)  # None = auto-detect

    # Validate extension
    filename = audio_file.filename or "audio.m4a"
    ext = Path(filename).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        log.warning(f"Unsupported file type: {ext!r}")
        # Try anyway — whisper is usually tolerant
        ext = ".m4a"

    # Save to temp file
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp_path = tmp.name
        audio_file.save(tmp_path)

    try:
        log.info(f"Transcribing {tmp_path!r} (language={language or 'auto'})...")

        segments, info = model.transcribe(
            tmp_path,
            language=language,         # None = auto-detect
            beam_size=5,
            vad_filter=True,           # skip silent segments
            vad_parameters={
                "min_silence_duration_ms": 500,
            },
        )

        # Collect all segments
        text_parts = []
        for segment in segments:
            text_parts.append(segment.text.strip())

        transcript = " ".join(text_parts).strip()

        if not transcript:
            log.warning("No speech detected in audio.")
            return jsonify({
                "error": "No speech detected. Please speak clearly and try again.",
                "code": "no_speech",
            }), 422

        log.info(f"Transcript ({info.language}, {info.duration:.1f}s): {transcript[:80]}...")

        return jsonify({
            "transcript": transcript,
            "language": info.language,
            "duration_s": round(info.duration, 2),
        })

    except Exception as e:
        log.error(f"Transcription error: {e}", exc_info=True)
        return jsonify({
            "error": "Transcription failed due to a server error.",
            "code": "server_error",
        }), 500

    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


# ── Run ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    log.info(f"Starting Whisper server on http://localhost:{PORT}")
    log.info(f"POST audio to: http://localhost:{PORT}/transcribe")
    # Use threaded=True so multiple requests don't block each other
    app.run(host="0.0.0.0", port=PORT, debug=False, threaded=True)
