#!/usr/bin/env python3
"""Write one grouped AI-ready file per source transcription (Composer Phase 2)."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from key_point_validation import filter_key_points  # noqa: E402
from tx_summary_utils import card_preview_of  # noqa: E402
from voice_registry import find_entry_by_raw_path, normalize_raw_rel  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
PROCESSED_JSON = REPO / "content" / "processed" / "processed_files.json"
GROUPED_DIR = REPO / "content" / "ai-ready-transcriptions"
DEFAULT_DATA = [
    REPO / "content" / "processed" / "_composer_reprocess_data.json",
    REPO / "content" / "processed" / "_composer_batch_remaining8.json",
]
TODAY = datetime.now(timezone.utc).strftime("%Y-%m-%d")
NOW = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def short_id(rel: str) -> str:
    return hashlib.sha256(rel.encode()).hexdigest()[:12]


def sha256_file(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def slugify(stem: str) -> str:
    return re.sub(r"[^\w\-]+", "-", stem.lower()).strip("-")[:40]


def find_audio_key(reg: dict, raw_name: str) -> str | None:
    raw_rel = f"content/transcriptions/{raw_name}"
    match = find_entry_by_raw_path(reg, raw_rel)
    if match:
        return match[0]
    for key, val in reg.get("processed", {}).items():
        if not isinstance(val, dict):
            continue
        rp = val.get("rawTranscriptionPath") or ""
        if rp.endswith(raw_name) or raw_rel in str(rp):
            return key
    return None


def src_audio_name(raw_name: str) -> str:
    stem = Path(raw_name).stem.replace("_", " ")
    if stem.startswith("Memo "):
        return stem + ".m4a"
    if stem.startswith("Voice "):
        return stem + ".m4a"
    if "chat" in raw_name.lower() or "whatsapp" in raw_name.lower():
        return stem
    return stem + ".m4a"


def index_category(primary: str, cat: str) -> str:
    if primary == "meeting":
        return "meetings"
    return "notes"


def key_points(item: dict) -> list[str]:
    raw = [str(p).strip() for p in (item.get("important_points") or []) if str(p).strip()]
    return filter_key_points(raw, max_items=3)


def bullet_section(title: str, lines: list[str], *, checkbox_tasks: bool = False) -> str:
    if not lines:
        return f"## {title}\n- (none)\n"
    if checkbox_tasks:
        body = "\n".join(f"- [ ] {x}" for x in lines)
    else:
        body = "\n".join(f"- {x}" for x in lines)
    return f"## {title}\n{body}\n"


def build_grouped_md(item: dict, *, raw_name: str, grouped_rel: str, checksum: str, sid: str) -> str:
    primary = item.get("primary_type", "note")
    cat = item["category"]
    proj = item["project"]
    title = item["title"].replace('"', "'")
    src_audio = src_audio_name(raw_name)
    raw_rel = f"content/transcriptions/{raw_name}"
    people = item.get("people_involved") or ["to confirm"]
    project_updates = item.get("project_updates") or []

    kp = key_points(item)
    summary = item["clean_summary"].strip()
    card_preview_of(summary)  # index derives preview/cardSummary from full summary at reindex

    parts = [
        f"""---
title: {title}
main_category: {cat}
category: {index_category(primary, cat)}
project: {proj}
date: {TODAY}
processing_date: {NOW}
processed_date: {NOW}
source_audio: {src_audio}
source_transcription: {raw_rel}
source_id: {sid}
source_checksum: {checksum}
grouped_output: {grouped_rel}
primary_type: {primary}
processed: true
tags: [{cat}]
---

## Title
{title}

## Source
- **Source audio:** {src_audio}
- **Source transcription:** `{raw_name}`
- **Processed date:** {NOW}
- **Main category:** {cat}
- **Project:** {proj}

## Summary
{summary}

## Top 3 Key Points
{chr(10).join(f"- {p}" for p in kp) if kp else ""}

{bullet_section("People Involved", people)}
{bullet_section("Tasks", item.get("tasks") or [], checkbox_tasks=True)}
{bullet_section("Calendar Events", item.get("calendar") or [])}
{bullet_section("Decisions", item.get("decisions") or [])}
{bullet_section("Open Points", item.get("open_points") or [])}
{bullet_section("Project Updates", project_updates)}
{bullet_section("Next Steps", item.get("next_steps") or [])}

## Full Transcription Reference
See `{raw_rel}`.
"""
    ]
    return "\n".join(parts)


def load_items(data_paths: list[Path]) -> list[dict]:
    merged: dict[str, dict] = {}
    for path in data_paths:
        if not path.is_file():
            print(f"SKIP missing data file {path}")
            continue
        batch = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(batch, list):
            raise SystemExit(f"Expected JSON array in {path}")
        for item in batch:
            merged[item["raw_name"]] = item
    return list(merged.values())


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply grouped AI-ready transcriptions")
    parser.add_argument("--data", action="append", type=Path, help="Composer JSON batch (array)")
    args = parser.parse_args()
    data_paths = args.data if args.data else DEFAULT_DATA
    items = load_items(data_paths)
    GROUPED_DIR.mkdir(parents=True, exist_ok=True)

    reg = json.loads(PROCESSED_JSON.read_text(encoding="utf-8"))
    processed = reg.setdefault("processed", {})

    ok = 0
    review = 0
    for item in items:
        raw_name = item["raw_name"]
        raw_path = REPO / "content" / "transcriptions" / raw_name
        if not raw_path.is_file():
            print(f"SKIP missing {raw_name}")
            continue

        checksum = sha256_file(raw_path)
        match = find_entry_by_raw_path(reg, f"content/transcriptions/{raw_name}")
        sid = (match[1].get("id") if match else None) or short_id(f"content/transcriptions/{raw_name}")
        stem = Path(raw_name).stem
        primary = item.get("primary_type", "note")

        out_name = f"{TODAY}-{item['category']}-{slugify(stem)}-{sid}.md"
        out_path = GROUPED_DIR / out_name
        grouped_rel = out_path.relative_to(REPO).as_posix()

        out_path.write_text(
            build_grouped_md(item, raw_name=raw_name, grouped_rel=grouped_rel, checksum=checksum, sid=sid),
            encoding="utf-8",
        )

        raw_text = raw_path.read_text(encoding="utf-8")
        if raw_text.startswith("<!-- PROCESSED:"):
            raw_text = "\n".join(raw_text.splitlines()[1:]).lstrip("\n")
        raw_path.write_text(
            f"<!-- PROCESSED: true | date: {NOW} | output: {grouped_rel} | checksum: {checksum} -->\n"
            + raw_text,
            encoding="utf-8",
        )

        force_ready = bool(item.get("force_ready") or item.get("ready_for_site"))
        low_quality = (
            not force_ready
            and (
                raw_name in ("Voice_001.md", "Voice_002.md", "Voice_250621_185357.md")
                or not item.get("clean_summary")
            )
        )
        status = "ready_for_site" if force_ready or not low_quality else "needs_review"
        ready = status == "ready_for_site"

        ai = {
            "meeting": grouped_rel if primary == "meeting" else None,
            "note": grouped_rel if primary != "meeting" else None,
            "tasks": "content/tasks/todo.md" if item.get("tasks") else None,
            "calendar": "content/calendar/events.md" if item.get("calendar") else None,
            "project": f"content/projects/{item['project']}.md" if item.get("project") else None,
            "decisions": f"content/decisions/{TODAY}.md" if item.get("decisions") else None,
            "openPoints": f"content/open-points/{TODAY}.md" if item.get("open_points") else None,
        }

        key = find_audio_key(reg, raw_name)
        if not key:
            key = f"content/transcriptions/{raw_name}"
        entry = processed.get(key, {}) if isinstance(processed.get(key), dict) else {}
        if match and match[0] != key and isinstance(processed.get(match[0]), dict):
            entry = {**processed[match[0]], **entry}
        entry.update(
            {
                "id": sid,
                "sourceAudio": entry.get("sourceAudio") or src_audio_name(raw_name),
                "rawTranscriptionPath": f"content/transcriptions/{raw_name}",
                "aiOutputs": ai,
                "groupedOutputPath": grouped_rel,
                "status": status,
                "readyForSite": ready,
                "aiProcessedAt": NOW,
                "error": None if ready else entry.get("error") or "low quality or missing summary",
                "source_checksum": checksum,
                "category": item.get("category"),
                "project": item.get("project"),
                "primary_type": primary,
            }
        )
        processed[key] = entry

        raw_rel = f"content/transcriptions/{raw_name}"
        for reg_key, val in list(processed.items()):
            if reg_key == key or not isinstance(val, dict):
                continue
            rp = normalize_raw_rel(str(val.get("rawTranscriptionPath") or ""))
            if rp != raw_rel:
                continue
            val = dict(val)
            val.update(
                {
                    "id": sid,
                    "aiOutputs": ai,
                    "groupedOutputPath": grouped_rel,
                    "status": status,
                    "readyForSite": ready,
                    "aiProcessedAt": NOW,
                    "error": None if ready else val.get("error"),
                    "source_checksum": checksum,
                    "category": item.get("category"),
                    "project": item.get("project"),
                    "primary_type": primary,
                }
            )
            processed[reg_key] = val
        entry["primary_type"] = primary

        if ready:
            ok += 1
        else:
            review += 1
        print(f"OK {raw_name} -> {grouped_rel} [{status}]")

    PROCESSED_JSON.write_text(json.dumps(reg, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Done: {ok} ready_for_site, {review} needs_review, {len(items)} total batches")


if __name__ == "__main__":
    main()
