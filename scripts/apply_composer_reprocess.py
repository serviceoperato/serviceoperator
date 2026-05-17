#!/usr/bin/env python3
"""Apply Composer-structured voice reprocess outputs (chat Phase 2)."""
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

from voice_registry import find_entry_by_raw_path, normalize_raw_rel  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
PROCESSED_JSON = REPO / "content" / "processed" / "processed_files.json"
DEFAULT_DATA = REPO / "content" / "processed" / "_composer_reprocess_data.json"
TODAY = datetime.now(timezone.utc).strftime("%Y-%m-%d")
NOW = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def short_id(rel: str) -> str:
    return hashlib.sha256(rel.encode()).hexdigest()[:12]


def sha256_file(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def slugify(stem: str) -> str:
    return re.sub(r"[^\w\-]+", "-", stem.lower()).strip("-")[:40]


def find_audio_key(registry: dict, raw_name: str) -> str | None:
    raw_rel = f"content/transcriptions/{raw_name}"
    match = find_entry_by_raw_path(registry, raw_rel)
    if match:
        return match[0]
    for key, val in registry.get("processed", {}).items():
        if not isinstance(val, dict):
            continue
        rp = val.get("rawTranscriptionPath") or ""
        if rp.endswith(raw_name) or raw_rel in str(rp):
            return key
    return None


def existing_primary_output(registry: dict, raw_name: str, primary: str) -> str | None:
    match = find_entry_by_raw_path(registry, f"content/transcriptions/{raw_name}")
    if not match:
        return None
    ai = match[1].get("aiOutputs") or {}
    if not isinstance(ai, dict):
        return None
    rel = ai.get("meeting") if primary == "meeting" else ai.get("note")
    if rel and (REPO / rel).is_file():
        return str(rel)
    return None


def build_md(item: dict, *, raw_name: str, note_rel: str, checksum: str, sid: str) -> str:
    primary = item["primary_type"]
    cat = item["category"]
    proj = item["project"]
    title = item["title"].replace('"', "'")
    src_audio = raw_name.replace(".md", "").replace("_", " ")

    def sec(name: str, lines: list[str]) -> str:
        body = "\n".join(f"- {x}" for x in lines) if lines else "- (none)"
        return f"## {name}\n{body}\n"

    summary_label = "Summary" if primary == "meeting" else "Clean Summary"
    parts = [
        f"""---
title: {title}
category: {cat}
project: {proj}
date: {TODAY}
processing_date: {NOW}
source_audio: {src_audio}
source_transcription: content/transcriptions/{raw_name}
source_id: {sid}
source_checksum: {checksum}
processed: true
tags: [{cat}]
self_talk: {str(cat == 'self-talk').lower()}
conversation: {str(cat == 'conversation').lower()}
visual:
  type: icon
  icon:
    name: FileText
    color: "#64748B"
    bg_color: "#64748B26"
    label: AI-ready
---

## Source
- **Source audio:** {src_audio}
- **Source transcription:** `{raw_name}`
- **Processing datetime:** {NOW}
- **Category:** {cat} (Composer)
- **Project:** {proj}

## {summary_label}
{item['clean_summary']}

## Top 3 Important Points
{chr(10).join(f"- {p}" for p in item.get('important_points', [])[:3]) or "- (none)"}

## Decisions
{chr(10).join(f"- {d}" for d in item.get('decisions', [])) or "- (none)"}

## Tasks
{chr(10).join(f"- [ ] {t}" for t in item.get('tasks', [])) or "- (none)"}

## Calendar Events
{chr(10).join(f"- {c}" for c in item.get('calendar', [])) or "- (none)"}

## Open Points
{chr(10).join(f"- {o}" for o in item.get('open_points', [])) or "- (none)"}

## Next Steps
{chr(10).join(f"- {n}" for n in item.get('next_steps', [])) or "- (none)"}

## Possible Actions
{chr(10).join(f"- {a}" for a in item.get('possible_actions', [])) or "- (none)"}

## Full Transcription Reference
See `content/transcriptions/{raw_name}`.
"""
    ]
    return "\n".join(parts)


def append_idempotent(path: Path, block: str, sid: str) -> None:
    if path.exists() and f"<!-- src: {sid} -->" in path.read_text(encoding="utf-8"):
        return
    if path.exists():
        text = path.read_text(encoding="utf-8")
        if not text.endswith("\n"):
            text += "\n"
        path.write_text(text + "\n" + block + "\n", encoding="utf-8")
    else:
        path.write_text(block + "\n", encoding="utf-8")


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
    parser = argparse.ArgumentParser(description="Apply Composer Phase 2 structured outputs")
    parser.add_argument(
        "--data",
        action="append",
        type=Path,
        help="JSON array of Composer items (default: _composer_reprocess_data.json)",
    )
    args = parser.parse_args()
    data_paths = args.data if args.data else [DEFAULT_DATA]
    items = load_items(data_paths)
    reg = json.loads(PROCESSED_JSON.read_text(encoding="utf-8"))
    processed = reg.setdefault("processed", {})

    for item in items:
        raw_name = item["raw_name"]
        raw_path = REPO / "content" / "transcriptions" / raw_name
        if not raw_path.is_file():
            print(f"SKIP missing {raw_name}")
            continue
        checksum = sha256_file(raw_path)
        match = find_entry_by_raw_path(processed, f"content/transcriptions/{raw_name}")
        sid = (match[1].get("id") if match else None) or short_id(f"content/transcriptions/{raw_name}")
        stem = Path(raw_name).stem
        primary = item.get("primary_type", "note")
        folder = REPO / "content" / ("meetings" if primary == "meeting" else "notes")
        folder.mkdir(parents=True, exist_ok=True)
        out_rel = existing_primary_output(processed, raw_name, primary)
        if out_rel:
            out_path = REPO / out_rel
        else:
            out_name = f"{TODAY}-{item['category']}-{slugify(stem)}-{sid}.md"
            out_path = folder / out_name
            out_rel = out_path.relative_to(REPO).as_posix()

        out_path.write_text(build_md(item, raw_name=raw_name, note_rel=out_rel, checksum=checksum, sid=sid), encoding="utf-8")

        raw_text = raw_path.read_text(encoding="utf-8")
        if raw_text.startswith("<!-- PROCESSED:"):
            raw_text = "\n".join(raw_text.splitlines()[1:]).lstrip("\n")
        raw_path.write_text(
            f"<!-- PROCESSED: true | date: {NOW} | output: {out_rel} | checksum: {checksum} -->\n" + raw_text,
            encoding="utf-8",
        )

        ai = {
            "meeting": out_rel if primary == "meeting" else None,
            "note": out_rel if primary != "meeting" else None,
            "tasks": "content/tasks/todo.md" if item.get("tasks") else None,
            "calendar": "content/calendar/events.md" if item.get("calendar") else None,
            "project": f"content/projects/{item['project']}.md" if item.get("project") else None,
            "decisions": f"content/decisions/{TODAY}.md" if item.get("decisions") else None,
            "openPoints": f"content/open-points/{TODAY}.md" if item.get("open_points") else None,
        }

        if item.get("tasks"):
            block = f"## {TODAY}\n" + "\n".join(f"- [ ] {t} <!-- src: {sid} -->" for t in item["tasks"])
            append_idempotent(REPO / "content/tasks/todo.md", block, sid)
        if item.get("calendar"):
            block = f"## {TODAY}\n" + "\n".join(f"- {c} <!-- src: {sid} -->" for c in item["calendar"])
            append_idempotent(REPO / "content/calendar/events.md", block, sid)
        if item.get("decisions"):
            block = "## Decisions\n\n" + "\n".join(f"- {d} <!-- src: {sid} -->" for d in item["decisions"])
            append_idempotent(REPO / "content/decisions" / f"{TODAY}.md", block, sid)
        if item.get("open_points"):
            block = "## Open points\n\n" + "\n".join(f"- {o} <!-- src: {sid} -->" for o in item["open_points"])
            append_idempotent(REPO / "content/open-points" / f"{TODAY}.md", block, sid)

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

        key = find_audio_key(processed, raw_name)
        if not key:
            key = f"content/transcriptions/{raw_name}"
        entry = processed.get(key, {}) if isinstance(processed.get(key), dict) else {}
        entry.update(
            {
                "id": sid,
                "sourceAudio": entry.get("sourceAudio") or src_audio_name(raw_name),
                "rawTranscriptionPath": f"content/transcriptions/{raw_name}",
                "aiOutputs": ai,
                "status": status,
                "readyForSite": ready,
                "aiProcessedAt": NOW,
                "error": None,
                "source_checksum": checksum,
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
                    "status": status,
                    "readyForSite": ready,
                    "aiProcessedAt": NOW,
                    "error": None,
                    "source_checksum": checksum,
                }
            )
            processed[reg_key] = val
        print(f"OK {raw_name} -> {out_rel} [{status}] ready={ready}")

    PROCESSED_JSON.write_text(json.dumps(reg, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def src_audio_name(raw_name: str) -> str:
    stem = Path(raw_name).stem.replace("_", " ")
    if stem.startswith("Memo "):
        return stem.replace("Memo ", "Memo ") + ".m4a"
    if stem.startswith("Voice "):
        return stem + ".m4a"
    if "chat" in raw_name.lower() or "whatsapp" in raw_name.lower():
        return stem
    return stem + ".m4a"


if __name__ == "__main__":
    main()
