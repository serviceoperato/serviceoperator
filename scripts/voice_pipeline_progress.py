"""Live progress for admin UI — written to content/processed/pipeline_progress.json."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
PROGRESS_JSON = REPO_ROOT / "content" / "processed" / "pipeline_progress.json"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def format_bytes(num: int) -> str:
    if num < 1024:
        return f"{num} B"
    if num < 1024**2:
        return f"{num / 1024:.1f} KB"
    if num < 1024**3:
        return f"{num / 1024**2:.1f} MB"
    return f"{num / 1024**3:.2f} GB"


def read_progress() -> dict:
    if not PROGRESS_JSON.exists():
        return {}
    try:
        data = json.loads(PROGRESS_JSON.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}


def write_progress(**fields) -> dict:
    PROGRESS_JSON.parent.mkdir(parents=True, exist_ok=True)
    doc = read_progress()
    doc.update(fields)
    doc["updated_at"] = utc_now_iso()
    PROGRESS_JSON.write_text(
        json.dumps(doc, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return doc


def mark_idle() -> None:
    write_progress(
        status="idle",
        phase=None,
        current_file=None,
        current_index=None,
        current_size_bytes=None,
        estimated_finish_at=None,
        estimated_seconds_remaining=None,
    )


def mark_running_scan(files_total: int, files_skipped: int, files_to_process: int, bytes_total: int) -> None:
    write_progress(
        status="running",
        phase="scan",
        started_at=utc_now_iso(),
        files_total=files_total,
        files_skipped=files_skipped,
        files_to_process=files_to_process,
        files_completed=0,
        bytes_total=bytes_total,
        bytes_total_human=format_bytes(bytes_total),
        current_file=None,
        message=f"Found {files_total} audio file(s); {files_to_process} to transcribe ({files_skipped} already done).",
    )


def mark_file_start(
    *,
    file_name: str,
    size_bytes: int,
    index: int,
    total: int,
    started_monotonic: float,
    completed_count: int,
) -> None:
    import time

    elapsed = max(0.001, time.monotonic() - started_monotonic)
    remaining = max(0, total - index + 1)
    if completed_count > 0:
        sec_per_file = elapsed / completed_count
    else:
        sec_per_file = max(120.0, size_bytes / (1024 * 1024) * 90.0)
    eta_sec = int(sec_per_file * remaining)
    finish_at = (datetime.now(timezone.utc) + timedelta(seconds=eta_sec)).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )
    write_progress(
        status="running",
        phase="transcribe",
        current_file=file_name,
        current_index=index,
        current_of=total,
        current_size_bytes=size_bytes,
        current_size_human=format_bytes(size_bytes),
        files_completed=completed_count,
        estimated_seconds_remaining=eta_sec,
        estimated_finish_at=finish_at,
        message=f"Transcribing ({index}/{total}): {file_name} ({format_bytes(size_bytes)})",
    )


def mark_file_done(completed_count: int, total: int) -> None:
    write_progress(
        files_completed=completed_count,
        message=f"Completed {completed_count}/{total} new transcription(s).",
    )
