#!/usr/bin/env python3
"""
Voice recorder transcription batch job (faster-whisper, auto language).

Usage:
  pip install faster-whisper
  winget install Gyan.FFmpeg
  python scripts/transcribe_voice_recorder.py
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
INPUT_DIR = Path(r"G:\My Drive\Voice Recorder")
TRANSCRIPTIONS_DIR = REPO_ROOT / "content" / "transcriptions"
PROCESSED_DIR = REPO_ROOT / "content" / "processed"
PROCESSED_JSON = PROCESSED_DIR / "processed_files.json"

AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".mp4", ".mkv", ".ogg", ".flac"}
WHISPER_MODEL = "small"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)


def ensure_directories() -> None:
    TRANSCRIPTIONS_DIR.mkdir(parents=True, exist_ok=True)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)


def load_processed_registry() -> dict:
    default = {"processed": {}}
    if not PROCESSED_JSON.exists():
        return default
    try:
        data = json.loads(PROCESSED_JSON.read_text(encoding="utf-8"))
        if not isinstance(data, dict) or not isinstance(data.get("processed"), dict):
            log.warning("Invalid processed_files.json; resetting registry.")
            return default
        return data
    except (json.JSONDecodeError, OSError) as exc:
        log.warning("Could not read processed_files.json (%s); resetting registry.", exc)
        return default


def save_processed_registry(data: dict) -> None:
    PROCESSED_JSON.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def file_identity(path: Path) -> tuple[str, int, float]:
    stat = path.stat()
    return (str(path.resolve()), stat.st_size, stat.st_mtime)


def is_already_processed(
    registry: dict,
    path: Path,
    full_path: str,
    size: int,
    mtime: float,
) -> bool:
    entry = registry["processed"].get(full_path)
    if not entry:
        return False
    return (
        entry.get("size") == size
        and entry.get("modified_time") == mtime
        and Path(entry.get("output_markdown", "")).is_file()
    )


def format_timestamp(seconds: float) -> str:
    total_ms = int(round(seconds * 1000))
    hours, rem = divmod(total_ms, 3_600_000)
    minutes, rem = divmod(rem, 60_000)
    secs, ms = divmod(rem, 1000)
    if hours:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}.{ms:03d}"
    return f"{minutes:02d}:{secs:02d}.{ms:03d}"


def markdown_output_path(source: Path) -> Path:
    stem = source.stem
    safe_stem = "".join(c if c.isalnum() or c in "._-" else "_" for c in stem)
    return TRANSCRIPTIONS_DIR / f"{safe_stem}.md"


def build_markdown(
    source: Path,
    full_path: str,
    processed_at: str,
    language: str,
    language_probability: float | None,
    segments: list[tuple[str, float, float]],
) -> str:
    lines = [
        f"# Transcription: {source.name}",
        "",
        f"- **Source file:** {source.name}",
        f"- **Source path:** `{full_path}`",
        f"- **Processed:** {processed_at}",
        f"- **Detected language:** {language}",
    ]
    if language_probability is not None:
        lines.append(f"- **Language probability:** {language_probability:.4f}")
    lines.extend(["", "## Transcription", ""])
    for text, start, end in segments:
        start_s = format_timestamp(start)
        end_s = format_timestamp(end)
        lines.append(f"**[{start_s} → {end_s}]** {text.strip()}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def discover_audio_files() -> list[Path]:
    if not INPUT_DIR.is_dir():
        log.error("Input directory not found: %s", INPUT_DIR)
        return []
    files: list[Path] = []
    for path in INPUT_DIR.rglob("*"):
        if path.is_file() and path.suffix.lower() in AUDIO_EXTENSIONS:
            files.append(path)
    return sorted(files, key=lambda p: p.stat().st_mtime)


def transcribe_file(
    model, source: Path
) -> tuple[list[tuple[str, float, float]], str, float | None]:
    segments_out: list[tuple[str, float, float]] = []
    segments, info = model.transcribe(str(source), task="transcribe")
    language = getattr(info, "language", None) or "unknown"
    language_probability = getattr(info, "language_probability", None)
    for segment in segments:
        segments_out.append((segment.text, segment.start, segment.end))
    return segments_out, language, language_probability


def process_file(model, registry: dict, source: Path) -> bool:
    try:
        full_path, size, mtime = file_identity(source)
    except OSError as exc:
        log.error("Cannot stat %s: %s", source, exc)
        return False

    if is_already_processed(registry, source, full_path, size, mtime):
        log.info("Skip (already processed): %s", source.name)
        return False

    log.info("Transcribing: %s", source)
    try:
        segment_rows, language, language_probability = transcribe_file(model, source)
    except Exception as exc:
        log.error("Transcription failed for %s: %s", source, exc)
        return False

    prob_msg = (
        f", probability={language_probability:.4f}"
        if language_probability is not None
        else ""
    )
    log.info("Detected language: %s%s", language, prob_msg)

    processed_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    output_path = markdown_output_path(source)
    try:
        output_path.write_text(
            build_markdown(
                source,
                full_path,
                processed_at,
                language,
                language_probability,
                segment_rows,
            ),
            encoding="utf-8",
        )
    except OSError as exc:
        log.error("Could not write %s: %s", output_path, exc)
        return False

    registry["processed"][full_path] = {
        "file_name": source.name,
        "full_path": full_path,
        "size": size,
        "modified_time": mtime,
        "output_markdown": str(output_path.resolve()),
        "processed_datetime": processed_at,
    }
    log.info("Saved: %s", output_path)
    return True


def main() -> int:
    ensure_directories()
    registry = load_processed_registry()

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        log.error("faster-whisper is not installed. Run: pip install faster-whisper")
        return 1

    audio_files = discover_audio_files()
    if not audio_files:
        log.info("No audio files to process.")
        save_processed_registry(registry)
        return 0

    log.info("Loading Whisper model %r (cpu, int8)...", WHISPER_MODEL)
    try:
        model = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
    except Exception as exc:
        log.error("Failed to load Whisper model: %s", exc)
        return 1

    processed_count = 0
    for source in audio_files:
        try:
            if process_file(model, registry, source):
                processed_count += 1
                save_processed_registry(registry)
        except Exception as exc:
            log.error("Unexpected error for %s: %s", source, exc)
            continue

    save_processed_registry(registry)
    log.info("Done. New transcriptions: %d", processed_count)
    return 0


if __name__ == "__main__":
    sys.exit(main())
