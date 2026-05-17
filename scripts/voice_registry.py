#!/usr/bin/env python3
"""Unified voice pipeline registry (content/processed/processed_files.json)."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
PROCESSED_DIR = REPO_ROOT / "content" / "processed"
PROCESSED_JSON = PROCESSED_DIR / "processed_files.json"

STATUS_DETECTED = "detected"
STATUS_RAW_CREATED = "raw_created"
STATUS_AI_PENDING = "ai_processing_pending"
STATUS_AI_RUNNING = "ai_processing_running"
STATUS_AI_PROCESSED = "ai_processed"
STATUS_READY = "ready_for_site"
STATUS_FAILED = "failed"
STATUS_NEEDS_REVIEW = "needs_review"

# Main /admin/transcriptions feed — ai_processed or ready_for_site with readyForSite + outputs
VISIBLE_STATUSES = frozenset({STATUS_AI_PROCESSED, STATUS_READY})
PENDING_STATUSES = frozenset(
    {
        STATUS_DETECTED,
        STATUS_RAW_CREATED,
        STATUS_AI_PENDING,
        STATUS_AI_RUNNING,
        STATUS_FAILED,
        STATUS_NEEDS_REVIEW,
    }
)

ALLOWED_OUTPUT_PREFIXES = (
    "content/meetings/",
    "content/notes/",
    "content/tasks/",
    "content/calendar/",
    "content/projects/",
    "content/decisions/",
    "content/open-points/",
)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stable_id(audio_full_path: str) -> str:
    return hashlib.sha256(audio_full_path.encode("utf-8")).hexdigest()[:16]


def load_registry() -> dict[str, Any]:
    default: dict[str, Any] = {"processed": {}, "version": 2}
    if not PROCESSED_JSON.is_file():
        return default
    try:
        data = json.loads(PROCESSED_JSON.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return default
    if not isinstance(data, dict):
        return default
    if not isinstance(data.get("processed"), dict):
        data["processed"] = {}
    data.setdefault("version", 2)
    return data


def save_registry(data: dict[str, Any]) -> None:
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    PROCESSED_JSON.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def normalize_entry(key: str, raw: dict[str, Any]) -> dict[str, Any]:
    """Migrate legacy fields into the v2 shape."""
    full_path = raw.get("full_path") or raw.get("sourceAudioPath") or key
    raw_md = raw.get("rawTranscriptionPath") or raw.get("output_markdown") or ""
    if raw_md and not str(raw_md).startswith("content/"):
        try:
            raw_md = Path(raw_md).relative_to(REPO_ROOT).as_posix()
        except ValueError:
            raw_md = f"content/transcriptions/{Path(raw_md).name}"

    status = raw.get("status")
    if not status:
        if raw.get("readyForSite") or raw.get("pipeline_classified"):
            status = STATUS_READY if raw.get("readyForSite", True) else STATUS_AI_PROCESSED
        elif raw_md:
            status = STATUS_AI_PENDING
        else:
            status = STATUS_RAW_CREATED

    ready = bool(raw.get("readyForSite"))
    if status in VISIBLE_STATUSES:
        ready = ready or status == STATUS_READY

    ai_outputs = raw.get("aiOutputs")
    if not isinstance(ai_outputs, dict):
        ai_outputs = {}
        out = raw.get("output_path") or raw.get("phase2_output_path")
        if out:
            ai_outputs["primary"] = out

    return {
        "id": raw.get("id") or stable_id(full_path),
        "sourceAudio": raw.get("sourceAudio") or raw.get("file_name") or Path(full_path).name,
        "sourceAudioPath": full_path,
        "rawTranscriptionPath": raw_md,
        "aiOutputs": ai_outputs,
        "detected_language": raw.get("detected_language"),
        "language_probability": raw.get("language_probability"),
        "rawCreatedAt": raw.get("rawCreatedAt") or raw.get("processed_datetime"),
        "aiProcessedAt": raw.get("aiProcessedAt") or raw.get("pipeline_classified_datetime"),
        "status": status,
        "readyForSite": ready and status in VISIBLE_STATUSES,
        "error": raw.get("error"),
        "size": raw.get("size"),
        "modified_time": raw.get("modified_time"),
        "modified_datetime": raw.get("modified_datetime"),
        "file_name": raw.get("file_name") or Path(full_path).name,
        "full_path": full_path,
        "output_markdown": raw.get("output_markdown"),
        "processed_datetime": raw.get("processed_datetime"),
    }


def get_entry_by_audio_path(registry: dict[str, Any], audio_full_path: str) -> dict[str, Any] | None:
    raw = registry.get("processed", {}).get(audio_full_path)
    if not raw:
        return None
    return normalize_entry(audio_full_path, raw)


def upsert_entry(registry: dict[str, Any], audio_full_path: str, **fields: Any) -> dict[str, Any]:
    processed = registry.setdefault("processed", {})
    current = normalize_entry(audio_full_path, processed.get(audio_full_path, {}))
    current.update(fields)
    current["id"] = current.get("id") or stable_id(audio_full_path)
    current["sourceAudioPath"] = audio_full_path
    processed[audio_full_path] = current
    return current


def normalize_raw_rel(raw_rel: str) -> str:
    raw_rel = (raw_rel or "").strip().strip("`")
    if not raw_rel:
        return ""
    if raw_rel.startswith("content/"):
        return raw_rel
    return f"content/transcriptions/{Path(raw_rel).name}"


def find_entry_by_raw_path(registry: dict[str, Any], raw_rel: str) -> tuple[str, dict[str, Any]] | None:
    target = normalize_raw_rel(raw_rel)
    if not target:
        return None
    for key, val in registry.get("processed", {}).items():
        entry = normalize_entry(key, val)
        entry_raw = normalize_raw_rel(str(entry.get("rawTranscriptionPath") or ""))
        if entry_raw == target:
            return key, entry
    return None


def has_ai_output(entry: dict[str, Any]) -> bool:
    outputs = entry.get("aiOutputs")
    if not isinstance(outputs, dict):
        return False
    for val in outputs.values():
        if val:
            return True
    return bool(entry.get("aiProcessedAt"))


def is_visible_on_main_page(entry: dict[str, Any]) -> bool:
    """Main Transcriptions list: ai_processed or ready_for_site, readyForSite, with AI outputs."""
    return (
        entry.get("status") in VISIBLE_STATUSES
        and bool(entry.get("readyForSite"))
        and has_ai_output(entry)
    )


def is_ready_for_site(entry: dict[str, Any]) -> bool:
    """Alias used by index + publish validation."""
    return is_visible_on_main_page(entry)


def list_pending_sources(registry: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for key, val in registry.get("processed", {}).items():
        entry = normalize_entry(key, val)
        if is_visible_on_main_page(entry):
            continue
        if (
            entry.get("status") in PENDING_STATUSES
            or not entry.get("aiProcessedAt")
            or not entry.get("readyForSite")
        ):
            out.append(entry)
    return sorted(out, key=lambda e: e.get("rawCreatedAt") or "", reverse=True)
