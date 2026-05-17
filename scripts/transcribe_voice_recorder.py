#!/usr/bin/env python3
"""
Voice recorder transcription batch job (faster-whisper, auto language).

Per file: transcribe → raw_created → immediate Phase 2 AI processing.

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
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path

from voice_pipeline_progress import (
    format_bytes,
    mark_file_done,
    mark_file_start,
    mark_idle,
    mark_running_scan,
    write_progress,
)
from voice_registry import (
    STATUS_AI_PENDING,
    STATUS_DETECTED,
    STATUS_FAILED,
    STATUS_RAW_CREATED,
    STATUS_READY,
    load_registry,
    normalize_entry,
    save_registry,
    stable_id,
    upsert_entry,
)

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

REPO_ROOT = _SCRIPTS_DIR.parent
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
    if entry.get("size") != size or entry.get("modified_time") != mtime:
        return False
    normalized = normalize_entry(full_path, entry)
    if normalized.get("status") == STATUS_READY and normalized.get("readyForSite"):
        return True
    raw_rel = normalized.get("rawTranscriptionPath")
    if raw_rel and (REPO_ROOT / raw_rel).is_file() and normalized.get("aiProcessedAt"):
        return True
    return bool(raw_rel) and (REPO_ROOT / raw_rel).is_file()


def run_phase2_for_raw(raw_path: Path, registry: dict) -> None:
    import os
    import subprocess

    log.info("Phase 2 (immediate) for %s", raw_path.name)
    write_progress(message=f"AI processing (Cursor Composer): {raw_path.name}")

    if os.environ.get("VOICE_PHASE2_HEURISTIC") == "1":
        from process_daily_voice_phase2 import process_single_raw

        stats = process_single_raw(raw_path, registry, save=False)
        if stats.get("errors"):
            log.warning("Phase 2 heuristic errors for %s", raw_path.name)
        return

    if not os.environ.get("CURSOR_API_KEY"):
        log.warning(
            "CURSOR_API_KEY missing — skipping immediate Phase 2 for %s. "
            "Run: node scripts/cursor_voice_phase2.mjs after setting .env",
            raw_path.name,
        )
        return

    rel = raw_path.relative_to(REPO_ROOT).as_posix()
    result = subprocess.run(
        ["node", str(Path(__file__).resolve().parent / "cursor_voice_phase2.mjs"), rel],
        cwd=REPO_ROOT,
        env=os.environ,
    )
    if result.returncode != 0:
        log.warning("Cursor Composer Phase 2 failed for %s (exit %s)", raw_path.name, result.returncode)


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
    write_progress(message=f"Transcribing: {source.name}")

    upsert_entry(
        registry,
        full_path,
        file_name=source.name,
        full_path=full_path,
        size=size,
        modified_time=mtime,
        modified_datetime=format_mtime(mtime),
        sourceAudio=source.name,
        sourceAudioPath=full_path,
        id=stable_id(full_path, size, mtime),
        status=STATUS_DETECTED,
        readyForSite=False,
        error=None,
        aiOutputs={},
    )

    try:
        segment_rows, language, language_probability = transcribe_file(model, source)
    except Exception as exc:
        log.error("Transcription failed for %s: %s", source, exc)
        upsert_entry(
            registry,
            full_path,
            status=STATUS_FAILED,
            readyForSite=False,
            error=str(exc)[:500],
        )
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
        upsert_entry(
            registry,
            full_path,
            status=STATUS_FAILED,
            readyForSite=False,
            error=str(exc)[:500],
        )
        return False

    raw_rel = output_path.relative_to(REPO_ROOT).as_posix()
    upsert_entry(
        registry,
        full_path,
        output_markdown=str(output_path.resolve()),
        rawTranscriptionPath=raw_rel,
        processed_datetime=processed_at,
        rawCreatedAt=processed_at,
        detectedLanguage=language,
        languageProbability=language_probability,
        detected_language=language,
        language_probability=language_probability,
        status=STATUS_RAW_CREATED,
        readyForSite=False,
        error=None,
    )
    upsert_entry(registry, full_path, status=STATUS_AI_PENDING)
    log.info("Raw transcription created: %s", output_path)

    run_phase2_for_raw(output_path, registry)
    return True


def run_transcription() -> tuple[int, int, list[str]]:
    """Run transcription batch. Returns (audio_found, new_count, errors)."""
    ensure_directories()
    registry = load_registry()
    errors: list[str] = []

    audio_files = discover_audio_files()
    audio_found = len(audio_files)
    log.info("Audio files found: %d", audio_found)

    if not audio_files:
        log.info("No audio files to process.")
        save_registry(registry)
        return 0, 0, errors

    queue: list[tuple[Path, str, int, float]] = []
    skipped = 0
    bytes_total = 0
    for source in audio_files:
        try:
            full_path, size, mtime = file_identity(source)
        except OSError:
            continue
        if is_already_processed(registry, full_path, size, mtime):
            skipped += 1
            continue
        queue.append((source, full_path, size, mtime))
        bytes_total += size
        upsert_entry(
            registry,
            full_path,
            file_name=source.name,
            size=size,
            modified_time=mtime,
            modified_datetime=format_mtime(mtime),
            sourceAudio=source.name,
            id=stable_id(full_path, size, mtime),
            status=STATUS_DETECTED,
            readyForSite=False,
        )
    pending = len(queue)
    log.info("New files to transcribe: %d", pending)
    mark_running_scan(audio_found, skipped, pending, bytes_total)

    if pending == 0:
        write_progress(status="success", phase="done", message="All audio files already transcribed.")
        save_registry(registry)
        return audio_found, 0, errors

    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        msg = "faster-whisper is not installed. Run: pip install -r requirements-voice.txt"
        log.error("%s\n%s", msg, traceback.format_exc())
        errors.append(msg)
        errors.append(traceback.format_exc().strip())
        write_progress(status="error", phase="transcribe", message=msg)
        return audio_found, 0, errors

    log.info("Loading Whisper model %r (cpu, int8)...", WHISPER_MODEL)
    write_progress(phase="load_model", message=f"Loading Whisper model {WHISPER_MODEL!r}…")
    try:
        model = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
    except Exception as exc:
        msg = f"Failed to load Whisper model: {exc}"
        log.error("%s\n%s", msg, traceback.format_exc())
        errors.append(msg)
        errors.append(traceback.format_exc().strip())
        write_progress(status="error", phase="transcribe", message=msg)
        return audio_found, 0, errors

    processed_count = 0
    run_started = time.monotonic()
    total = len(queue)
    for index, (source, _full_path, size, _mtime) in enumerate(queue, start=1):
        mark_file_start(
            file_name=source.name,
            size_bytes=size,
            index=index,
            total=total,
            started_monotonic=run_started,
            completed_count=processed_count,
        )
        try:
            if process_file(model, registry, source):
                processed_count += 1
                save_registry(registry)
                mark_file_done(processed_count, total)
        except Exception as exc:
            err = f"Unexpected error for {source.name}: {exc}"
            log.error("%s\n%s", err, traceback.format_exc())
            errors.append(err)
            errors.append(traceback.format_exc().strip())
            write_progress(message=err)
            continue

    save_registry(registry)
    if errors:
        write_progress(
            status="error",
            phase="done",
            message=f"Transcription finished with {len(errors)} error(s).",
        )
    else:
        write_progress(
            status="success",
            phase="done",
            message=f"Transcription complete: {processed_count} new file(s).",
        )
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
