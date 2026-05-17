#!/usr/bin/env python3
"""
Pre-commit/push guard: block publishing raw-only voice transcriptions as site content.

Exit 0 when safe to commit AI-ready outputs; exit 1 with messages when not.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from voice_registry import (  # noqa: E402
    ALLOWED_OUTPUT_PREFIXES,
    PENDING_STATUSES,
    VISIBLE_STATUSES,
    find_entry_by_raw_path,
    is_visible_on_main_page,
    load_registry,
    normalize_entry,
    normalize_raw_rel,
)

REPO = _SCRIPTS_DIR.parent
INDEX_PATH = REPO / "content" / "processed" / "transcriptions_index.json"
TRANSCRIPTIONS_DIR = REPO / "content" / "transcriptions"

INDEX_CATEGORIES = frozenset(
    {"meetings", "notes", "tasks", "calendar", "projects", "decisions", "open-points"}
)


def validate_index(registry: dict) -> list[str]:
    errors: list[str] = []
    if not INDEX_PATH.is_file():
        return errors
    try:
        index = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return [f"Invalid transcriptions index: {exc}"]

    for item in index.get("items") or []:
        path = str(item.get("path") or "")
        item_id = item.get("id") or path
        cat = item.get("category")

        if path.startswith("content/transcriptions/"):
            errors.append(f"Index lists raw transcription as site item: {path}")
            continue

        if path and not any(path.startswith(p) for p in ALLOWED_OUTPUT_PREFIXES):
            errors.append(f"Index item outside AI-ready folders: {item_id} ({path})")
            continue

        if cat not in INDEX_CATEGORIES:
            errors.append(f"Index item missing/invalid category: {item_id} ({cat!r})")
            continue

        if not item.get("readyForSite"):
            errors.append(f"Index item not readyForSite: {item_id}")
            continue

        status = item.get("pipelineStatus")
        if status and status not in VISIBLE_STATUSES:
            errors.append(f"Index item status not visible: {item_id} ({status!r})")

        raw = item.get("source_transcription")
        if raw:
            match = find_entry_by_raw_path(registry, normalize_raw_rel(raw))
            if not match or not is_visible_on_main_page(match[1]):
                errors.append(f"Index item not AI-ready (registry): {item_id} ← {raw}")
    return errors


def validate_registry(registry: dict) -> list[str]:
    errors: list[str] = []
    warnings: list[str] = []
    for key, val in registry.get("processed", {}).items():
        entry = normalize_entry(key, val)
        status = entry.get("status")
        ready = entry.get("readyForSite")
        raw_rel = entry.get("rawTranscriptionPath")
        label = entry.get("sourceAudio") or key

        if ready and status not in VISIBLE_STATUSES:
            errors.append(f"readyForSite=true but status={status!r} for {label}")
        if status in PENDING_STATUSES and ready:
            errors.append(f"Pending status {status!r} cannot be readyForSite for {label}")
        if ready and not is_visible_on_main_page(entry):
            errors.append(f"readyForSite set without AI outputs or visible status: {label}")
        if raw_rel and ready:
            raw_path = REPO / raw_rel
            if raw_path.is_file():
                text = raw_path.read_text(encoding="utf-8", errors="replace")
                if "PROCESSED: true" not in text and "pipeline_classified: true" not in text.lower():
                    warnings.append(f"Raw file missing PROCESSED header: {raw_rel}")
    return errors, warnings


def main() -> int:
    registry = load_registry()
    errors = validate_index(registry)
    reg_errors, warnings = validate_registry(registry)
    errors.extend(reg_errors)

    pending = sum(
        1
        for _k, v in registry.get("processed", {}).items()
        if normalize_entry(_k, v).get("status") in PENDING_STATUSES
    )
    if TRANSCRIPTIONS_DIR.is_dir():
        raw_count = len(list(TRANSCRIPTIONS_DIR.glob("*.md")))
    else:
        raw_count = 0

    if warnings:
        for w in warnings:
            print(f"WARN: {w}", file=sys.stderr)
    if errors:
        for e in errors:
            print(f"ERROR: {e}", file=sys.stderr)
        print(
            f"\nPublish blocked: fix AI pipeline before commit/push "
            f"({pending} pending registry entries, {raw_count} raw file(s)).",
            file=sys.stderr,
        )
        return 1

    print(
        f"OK: voice publish validation passed "
        f"({raw_count} raw on disk, {pending} pending in registry)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
