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
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
_DEFAULT_INPUT = r"G:\My Drive\Voice Recorder"
INPUT_DIR = Path(os.environ.get("VOICE_RECORDER_INPUT_DIR", _DEFAULT_INPUT))
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


def format_mtime(mtime: float) -> str:
    return datetime.fromtimestamp(mtime, tz=timezone.utc).strftime(
        "%Y-%m-%d %H:%M:%S UTC"
    )


def is_already_processed(
    registry: dict,
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
    size: int,
    modified_at: str,
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
        f"- **File size:** {size} bytes",
        f"- **Modified:** {modified_at}",
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
    log.info("Scanning folder: %s", INPUT_DIR)
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

    if is_already_processed(registry, full_path, size, mtime):
        log.info("Skip (already processed): %s", source.name)
        return False

    log.info("Processing file: %s", source.name)
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
    modified_at = format_mtime(mtime)
    output_path = markdown_output_path(source)
    try:
        output_path.write_text(
            build_markdown(
                source,
                full_path,
                size,
                modified_at,
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
        "modified_datetime": modified_at,
        "output_markdown": str(output_path.resolve()),
        "processed_datetime": processed_at,
        "detected_language": language,
        "language_probability": language_probability,
    }
    log.info("Output path: %s", output_path)
    return True


def run_transcription() -> tuple[int, int, list[str]]:
    """Run transcription batch. Returns (audio_found, new_count, errors)."""
    ensure_directories()
    registry = load_processed_registry()
    errors: list[str] = []

    audio_files = discover_audio_files()
    audio_found = len(audio_files)
    log.info("Audio files found: %d", audio_found)

    if not audio_files:
        log.info("No audio files to process.")
        save_processed_registry(registry)
        return 0, 0, errors

    pending = 0
    for source in audio_files:
        try:
            full_path, size, mtime = file_identity(source)
        except OSError:
            continue
        if not is_already_processed(registry, full_path, size, mtime):
            pending += 1
    log.info("New files to transcribe: %d", pending)

    if pending == 0:
        save_processed_registry(registry)
        return audio_found, 0, errors

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        msg = "faster-whisper is not installed. Run: pip install faster-whisper"
        log.error(msg)
        errors.append(msg)
        return audio_found, 0, errors

    log.info("Loading Whisper model %r (cpu, int8)...", WHISPER_MODEL)
    try:
        model = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
    except Exception as exc:
        msg = f"Failed to load Whisper model: {exc}"
        log.error(msg)
        errors.append(msg)
        return audio_found, 0, errors

    processed_count = 0
    for source in audio_files:
        try:
            if process_file(model, registry, source):
                processed_count += 1
                save_processed_registry(registry)
        except Exception as exc:
            err = f"Unexpected error for {source.name}: {exc}"
            log.error(err)
            errors.append(err)
            continue

    save_processed_registry(registry)
    log.info("Transcription complete. New transcriptions: %d", processed_count)
    return audio_found, processed_count, errors


def main() -> int:
    audio_found, processed_count, errors = run_transcription()
    log.info(
        "Final summary: scanned=%d, new_transcriptions=%d, errors=%d",
        audio_found,
        processed_count,
        len(errors),
    )
    return 1 if errors and processed_count == 0 and audio_found > 0 else 0


if __name__ == "__main__":
    sys.exit(main())
