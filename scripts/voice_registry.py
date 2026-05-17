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

# Main /admin/transcriptions list: ONLY ready_for_site
VISIBLE_STATUSES = frozenset({STATUS_READY})

# Secondary pending box: everything not published on main list
PENDING_STATUSES = frozenset(
    {
        STATUS_DETECTED,
        STATUS_RAW_CREATED,
        STATUS_AI_PENDING,
        STATUS_AI_RUNNING,
        STATUS_AI_PROCESSED,
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

AI_OUTPUT_KEYS = ("meeting", "note", "tasks", "calendar", "project", "decisions", "openPoints")


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stable_id(
    audio_full_path: str,
    size: int | None = None,
    mtime: float | None = None,
) -> str:
    payload = str(audio_full_path)
    if size is not None:
        payload += f"|{size}"
    if mtime is not None:
        payload += f"|{mtime}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


def empty_ai_outputs() -> dict[str, str | None]:
    return {k: None for k in AI_OUTPUT_KEYS}


def normalize_ai_outputs(raw: Any) -> dict[str, str | None]:
    out = empty_ai_outputs()
    if not isinstance(raw, dict):
        return out
    alias = {"open-points": "openPoints", "open_points": "openPoints", "primary": None}
    for key, val in raw.items():
        if not val:
            continue
        target = alias.get(key, key)
        if target is None:
            if isinstance(val, str) and val.startswith("content/"):
                if "meetings/" in val:
                    out["meeting"] = val
                elif "notes/" in val:
                    out["note"] = val
            continue
        if target in out:
            out[target] = str(val)
    return out


def has_primary_ai_output(ai_outputs: dict[str, str | None] | None) -> bool:
    if not ai_outputs:
        return False
    return bool(ai_outputs.get("meeting") or ai_outputs.get("note"))


def primary_output_exists(ai_outputs: dict[str, str | None] | None) -> bool:
    if not has_primary_ai_output(ai_outputs):
        return False
    rel = (ai_outputs or {}).get("meeting") or (ai_outputs or {}).get("note")
    return bool(rel and (REPO_ROOT / rel).is_file())


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
    full_path = raw.get("full_path") or raw.get("sourceAudioPath") or key
    size = raw.get("size")
    mtime = raw.get("modified_time")
    raw_md = raw.get("rawTranscriptionPath") or raw.get("output_markdown") or ""
    if raw_md and not str(raw_md).startswith("content/"):
        try:
            raw_md = Path(raw_md).relative_to(REPO_ROOT).as_posix()
        except ValueError:
            raw_md = f"content/transcriptions/{Path(raw_md).name}"

    status = raw.get("status")
    if not status:
        if raw.get("readyForSite"):
            status = STATUS_READY
        elif raw.get("pipeline_classified") or raw.get("aiProcessedAt"):
            status = STATUS_AI_PROCESSED
        elif raw_md:
            status = STATUS_AI_PENDING
        else:
            status = STATUS_DETECTED

    ai_outputs = normalize_ai_outputs(raw.get("aiOutputs"))
    legacy_out = raw.get("output_path") or raw.get("phase2_output_path")
    if legacy_out and isinstance(legacy_out, str):
        if "meetings/" in legacy_out and not ai_outputs["meeting"]:
            ai_outputs["meeting"] = legacy_out
        elif "notes/" in legacy_out and not ai_outputs["note"]:
            ai_outputs["note"] = legacy_out

    ready = bool(raw.get("readyForSite")) and status == STATUS_READY
    if ready and not primary_output_exists(ai_outputs):
        ready = False
        status = STATUS_AI_PROCESSED if primary_output_exists(ai_outputs) else STATUS_AI_PENDING

    lang = raw.get("detectedLanguage") or raw.get("detected_language")
    lang_prob = raw.get("languageProbability")
    if lang_prob is None:
        lang_prob = raw.get("language_probability")

    return {
        "id": raw.get("id")
        or stable_id(full_path, size if isinstance(size, int) else None, mtime if mtime is not None else None),
        "sourceAudio": raw.get("sourceAudio") or raw.get("file_name") or Path(full_path).name,
        "sourceAudioPath": full_path,
        "rawTranscriptionPath": raw_md,
        "aiOutputs": ai_outputs,
        "detectedLanguage": lang,
        "languageProbability": lang_prob,
        "detected_language": lang,
        "language_probability": lang_prob,
        "rawCreatedAt": raw.get("rawCreatedAt") or raw.get("processed_datetime"),
        "aiProcessedAt": raw.get("aiProcessedAt") or raw.get("pipeline_classified_datetime"),
        "status": status,
        "readyForSite": ready,
        "error": raw.get("error"),
        "size": size,
        "modified_time": mtime,
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
    if "aiOutputs" in fields and fields["aiOutputs"] is not None:
        merged = empty_ai_outputs()
        merged.update(normalize_ai_outputs(current.get("aiOutputs")))
        merged.update(normalize_ai_outputs(fields["aiOutputs"]))
        fields = {**fields, "aiOutputs": merged}
    current.update(fields)
    size = current.get("size")
    mtime = current.get("modified_time")
    current["id"] = stable_id(
        audio_full_path,
        size if isinstance(size, int) else None,
        mtime if mtime is not None else None,
    )
    current["sourceAudioPath"] = audio_full_path
    if current.get("readyForSite"):
        if primary_output_exists(current.get("aiOutputs")):
            current["status"] = STATUS_READY
        else:
            current["readyForSite"] = False
    elif current.get("status") == STATUS_READY:
        current["readyForSite"] = False
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
        if normalize_raw_rel(str(entry.get("rawTranscriptionPath") or "")) == target:
            return key, entry
    return None


def is_visible_on_main_page(entry: dict[str, Any]) -> bool:
    """Main Transcriptions list: ONLY ready_for_site with primary AI output on disk."""
    return is_ready_for_site(entry)


def is_ready_for_site(entry: dict[str, Any]) -> bool:
    return (
        bool(entry.get("readyForSite"))
        and entry.get("status") == STATUS_READY
        and primary_output_exists(entry.get("aiOutputs"))
    )


def list_pending_sources(registry: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for key, val in registry.get("processed", {}).items():
        entry = normalize_entry(key, val)
        if is_ready_for_site(entry):
            continue
        if entry.get("status") in PENDING_STATUSES or not entry.get("aiProcessedAt"):
            out.append(entry)
    return sorted(out, key=lambda e: e.get("rawCreatedAt") or "", reverse=True)
