#!/usr/bin/env python3
"""
Phase 2 — Daily voice processing (runbook: content/voice-reports/daily-voice-processing-pipeline.md).

Scans content/transcriptions/*.md, writes AI-ready outputs under content/{notes,meetings,...},
idempotent via content/processed/phase2_registry.json + PROCESSED header on raw files.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import logging
import re
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

_SCRIPTS = Path(__file__).resolve().parent
REPO = _SCRIPTS.parent
CONTENT = REPO / "content"
TRANSCRIPTIONS = CONTENT / "transcriptions"
PROCESSED = CONTENT / "processed"
REGISTRY_PATH = PROCESSED / "phase2_registry.json"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

CATEGORIES = ("meeting", "conversation", "self-recap", "voice-note", "self-talk")

ICON_MAP = (
    (("riflett", "introspe", "pensiero profondo"), "Brain", "#8B5CF6", "Riflessione"),
    (("emoz", "sfogo", "ansia", "triste", "arrabbi"), "Heart", "#EC4899", "Sfogo emotivo"),
    (("idea", "brainstorm", "startup", "business"), "Lightbulb", "#F59E0B", "Idea"),
    (("promemoria", "memo", "ricorda"), "StickyNote", "#FBBF24", "Appunto"),
    (("chat", "whatsapp", "conversaz"), "MessageCircle", "#06B6D4", "Conversazione"),
    (("recap", "giornata", "riepilogo"), "Sunset", "#F97316", "Recap giornata"),
    (("codice", "deploy", "api", "software"), "Code2", "#3B82F6", "Progetto tech"),
    (("viaggio", "volo", "aeroporto"), "Plane", "#10B981", "Viaggio"),
    (("salute", "medico", "allenamento"), "Activity", "#EF4444", "Salute"),
    (("soldi", "finanz", "budget"), "Wallet", "#22C55E", "Finanza"),
    (("riunione", "meeting", "call"), "Briefcase", "#6366F1", "Riunione"),
)


@dataclass
class Phase2Result:
    category: str
    project: str
    confidence: float
    title: str
    summary: str
    tags: list[str]
    self_talk: bool = False
    conversation: bool = False
    decisions: list[str] = field(default_factory=list)
    tasks: list[str] = field(default_factory=list)
    calendar_events: list[str] = field(default_factory=list)
    open_points: list[str] = field(default_factory=list)
    next_steps: list[str] = field(default_factory=list)
    important_points: list[str] = field(default_factory=list)
    icon_name: str = "FileText"
    icon_color: str = "#64748B"
    icon_label: str = "Nota vocale"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def today_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def short_id(rel_path: str) -> str:
    return hashlib.sha256(rel_path.encode("utf-8")).hexdigest()[:12]


def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


def load_pipeline_module():
    spec = importlib.util.spec_from_file_location(
        "process_voice_recorder_pipeline",
        _SCRIPTS / "process_voice_recorder_pipeline.py",
    )
    if spec is None or spec.loader is None:
        raise ImportError("Cannot load process_voice_recorder_pipeline.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


def load_registry() -> dict:
    if REGISTRY_PATH.is_file():
        try:
            return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pass
    return {"entries": {}}


def save_registry(data: dict) -> None:
    PROCESSED.mkdir(parents=True, exist_ok=True)
    REGISTRY_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def strip_processed_header(text: str) -> str:
    lines = text.splitlines()
    if lines and lines[0].strip().startswith("<!-- PROCESSED:"):
        return "\n".join(lines[1:]).lstrip("\n")
    return text


def write_processed_header(path: Path, *, iso: str, output_rel: str, checksum: str) -> None:
    text = strip_processed_header(path.read_text(encoding="utf-8"))
    header = f"<!-- PROCESSED: true | date: {iso} | output: {output_rel} | checksum: {checksum} -->\n"
    path.write_text(header + text, encoding="utf-8")


def should_skip(registry: dict, source_id: str, checksum: str) -> bool:
    entry = registry.get("entries", {}).get(source_id)
    return bool(entry and entry.get("processed") and entry.get("source_checksum") == checksum)


def classify_daily(mod, parsed) -> Phase2Result:
    text = parsed.body_text
    lower = text.lower()
    name = parsed.md_path.name.lower()

    if "whatsapp" in name or "chat" in name:
        cat, conv = "conversation", True
        conf = 0.85
    elif mod.keyword_score(lower, ("riunione", "meeting", "call", "zoom", "agenda", "partecipanti")) >= 2:
        cat, conv = "meeting", False
        conf = 0.75
    elif mod.keyword_score(lower, ("recap", "riepilogo", "giornata", "oggi ho fatto", "fine giornata")) >= 1:
        cat, conv = "self-recap", False
        conf = 0.7
    elif len(text) < 400:
        cat, conv = "voice-note", False
        conf = 0.65
    elif mod.keyword_score(lower, ("sento", "emozioni", "ansia", "triste", "solo io", "sfogo")) >= 2 and mod.keyword_score(
        lower, ("devo", "task", "appuntamento", "decidiamo")
    ) == 0:
        cat, conv = "self-talk", False
        conf = 0.7
    elif mod.keyword_score(lower, ("?", " dice ", " dici ", "risponde", "sì,", "no,")) >= 3:
        cat, conv = "conversation", True
        conf = 0.72
    else:
        cat, conv = "voice-note", False
        conf = 0.55

    project = mod.detect_project_slug(text) or "uncategorized"
    bullets = mod.extract_bullet_candidates(text)
    summary = bullets[0] if bullets else (text[:240] + ("…" if len(text) > 240 else ""))
    title_base = Path(parsed.source_file).stem.replace("_", " ")
    title = (summary[:57] + "…") if len(summary) > 60 else (summary or title_base)[:60]

    tags: list[str] = []
    if cat == "meeting":
        tags.append("meeting")
    if conv:
        tags.append("conversation")
    if project != "uncategorized":
        tags.append(project)

    decisions: list[str] = []
    tasks: list[str] = []
    events: list[str] = []
    open_pts: list[str] = []

    if cat != "self-talk":
        for b in bullets:
            bl = b.lower()
            if re.search(r"(decidiamo|decisione|facciamo così|ok andiamo|we decided)", bl):
                decisions.append(b)
            if re.search(r"(devo |ricordami |farò |must |need to |todo)", bl):
                tasks.append(b)
            if re.search(r"(domani|lunedì|appuntamento|alle \d|tomorrow|next week)", bl):
                events.append(f"{b} | confidence: low")
            if "?" in b and len(b) > 15:
                open_pts.append(f"{b} | owner: to confirm")

    next_steps = tasks[:3] if tasks else bullets[-2:]
    important = bullets[:3]

    icon_name, icon_color, icon_label = "FileText", "#64748B", "Nota vocale"
    for keys, iname, color, label in ICON_MAP:
        if any(k in lower or k in name for k in keys):
            icon_name, icon_color, icon_label = iname, color, label
            break
    if cat == "self-talk":
        icon_name, icon_color, icon_label = "Heart", "#EC4899", "Sfogo serale"
    elif cat == "meeting":
        icon_name, icon_color, icon_label = "Briefcase", "#6366F1", "Riunione"

    return Phase2Result(
        category=cat,
        project=project,
        confidence=conf,
        title=title,
        summary=summary,
        tags=tags[:5],
        self_talk=cat == "self-talk",
        conversation=conv or cat == "conversation",
        decisions=decisions[:5],
        tasks=tasks[:8],
        calendar_events=events[:5],
        open_points=open_pts[:5],
        next_steps=next_steps[:5],
        important_points=important,
        icon_name=icon_name,
        icon_color=icon_color,
        icon_label=icon_label,
    )


def visual_yaml(result: Phase2Result) -> str:
    counts = {
        "decisions": len(result.decisions),
        "tasks": len(result.tasks),
        "events": len(result.calendar_events),
        "open_points": len(result.open_points),
        "next_steps": len(result.next_steps),
    }
    nonzero = sum(1 for v in counts.values() if v > 0)
    if nonzero >= 2:
        colors = {
            "decisions": "#F59E0B",
            "tasks": "#3B82F6",
            "events": "#10B981",
            "open_points": "#EF4444",
            "next_steps": "#8B5CF6",
        }
        labels = {
            "decisions": "Decisions",
            "tasks": "Tasks",
            "events": "Events",
            "open_points": "Open",
            "next_steps": "Next",
        }
        lines = ["  type: ring", "  ring_data:"]
        for key, n in counts.items():
            if n > 0:
                lines.append(f'    - {{ label: "{labels[key]}", value: {n}, color: "{colors[key]}" }}')
        return "\n".join(lines)
    bg = result.icon_color + "26"
    return "\n".join(
        [
            "  type: icon",
            "  icon:",
            f'    name: {result.icon_name}',
            f'    color: {result.icon_color}',
            f"    bg_color: {bg}",
            f'    label: {result.icon_label}',
        ]
    )


def build_output_md(
    parsed,
    result: Phase2Result,
    *,
    source_id: str,
    checksum: str,
    processing_date: str,
) -> str:
    rel_trans = f"content/transcriptions/{parsed.md_path.name}"
    tags_yaml = ", ".join(result.tags) if result.tags else ""
    fm = f"""---
title: {result.title.replace('"', "'")}
category: {result.category}
project: {result.project}
date: {parsed.processed_datetime[:10] if parsed.processed_datetime else today_str()}
processing_date: {processing_date}
source_audio: {parsed.source_file}
source_transcription: {rel_trans}
source_id: {source_id}
source_checksum: {checksum}
processed: true
tags: [{tags_yaml}]
self_talk: {str(result.self_talk).lower()}
conversation: {str(result.conversation).lower()}
visual:
{visual_yaml(result)}
---

## Source
- **Source audio:** {parsed.source_file}
- **Source transcription:** `{parsed.md_path.name}`
- **Processing datetime:** {processing_date}
- **Category:** {result.category} ({result.confidence:.0%})
- **Project:** {result.project}

## Summary
{result.summary}

## Top 3 Important Points
{chr(10).join(f"- {p}" for p in result.important_points) or "- (none)"}

## Decisions
{chr(10).join(f"- {d}" for d in result.decisions) or "- (none)"}

## Tasks
{chr(10).join(f"- [ ] {t} | due: null | priority: m" for t in result.tasks) or "- (none)"}

## Calendar Events
{chr(10).join(f"- {e}" for e in result.calendar_events) or "- (none)"}

## Open Points
{chr(10).join(f"- {o}" for o in result.open_points) or "- (none)"}

## Next Steps
{chr(10).join(f"- {n}" for n in result.next_steps) or "- (none)"}

## Full Transcription Reference
See `{rel_trans}`.
"""
    return fm


def output_path_for(result: Phase2Result, source_id: str, stem: str) -> Path:
    safe = re.sub(r"[^\w\-]+", "-", stem.lower()).strip("-")[:40]
    date = today_str()
    if result.category == "meeting":
        folder = CONTENT / "meetings"
    else:
        folder = CONTENT / "notes"
    folder.mkdir(parents=True, exist_ok=True)
    return folder / f"{date}-{result.category}-{safe}-{source_id}.md"


def append_idempotent(path: Path, block: str, source_id: str) -> None:
    if path.exists() and f"<!-- src: {source_id} -->" in path.read_text(encoding="utf-8"):
        return
    if path.exists():
        existing = path.read_text(encoding="utf-8")
        if existing and not existing.endswith("\n"):
            existing += "\n"
        path.write_text(existing + "\n" + block + "\n", encoding="utf-8")
    else:
        path.write_text(block + "\n", encoding="utf-8")


def append_aggregates(result: Phase2Result, parsed, source_id: str) -> None:
    if result.self_talk:
        return
    if result.tasks:
        lines = [f"## {today_str()}\n"]
        for t in result.tasks:
            lines.append(f"- [ ] {t} <!-- src: {source_id} -->")
        append_idempotent(CONTENT / "tasks" / "todo.md", "\n".join(lines), source_id)
    if result.calendar_events:
        block = f"## {today_str()}\n\n" + "\n".join(
            f"- {e} <!-- src: {source_id} -->" for e in result.calendar_events
        )
        append_idempotent(CONTENT / "calendar" / "events.md", block, source_id)
    if result.decisions:
        dec_path = CONTENT / "decisions" / f"{today_str()}.md"
        dec_path.parent.mkdir(parents=True, exist_ok=True)
        block = "\n".join(f"- {d} <!-- src: {source_id} -->" for d in result.decisions)
        append_idempotent(dec_path, f"## Decisions\n\n{block}", source_id)
    if result.project != "uncategorized":
        proj_path = CONTENT / "projects" / f"{result.project}.md"
        proj_path.parent.mkdir(parents=True, exist_ok=True)
        block = f"## Update {today_str()}\n\n{result.summary}\n\n<!-- src: {source_id} -->"
        append_idempotent(proj_path, block, source_id)


def process_file(mod, md_path: Path, registry: dict, stats: dict) -> None:
    rel = md_path.relative_to(REPO).as_posix()
    source_id = short_id(rel)
    checksum = file_sha256(md_path)

    if should_skip(registry, source_id, checksum):
        stats["skipped"] += 1
        return

    parsed = mod.parse_transcription_md(md_path)
    if not parsed:
        stats["errors"] += 1
        log.warning("Parse failed: %s", md_path.name)
        return

    result = classify_daily(mod, parsed)
    out_path = output_path_for(result, source_id, parsed.md_path.stem)
    processing_date = utc_now_iso()
    body = build_output_md(
        parsed, result, source_id=source_id, checksum=checksum, processing_date=processing_date
    )
    out_path.write_text(body, encoding="utf-8")
    out_rel = out_path.relative_to(REPO).as_posix()

    write_processed_header(md_path, iso=processing_date, output_rel=out_rel, checksum=checksum)
    append_aggregates(result, parsed, source_id)

    stat_counts = (
        len(result.decisions),
        len(result.tasks),
        len(result.calendar_events),
        len(result.open_points),
        len(result.next_steps),
    )
    chart_slices = sum(1 for n in stat_counts if n > 0)
    registry.setdefault("entries", {})[source_id] = {
        "id": source_id,
        "source_path": rel,
        "source_checksum": checksum,
        "output_path": out_rel,
        "processed": True,
        "processing_date": processing_date,
        "category": result.category,
        "project": result.project,
        "has_chart_data": chart_slices >= 2,
        "visual_type": "ring" if chart_slices >= 2 else "icon",
        "stats": {
            "decisions": stat_counts[0],
            "tasks": stat_counts[1],
            "events": stat_counts[2],
            "open_points": stat_counts[3],
            "next_steps": stat_counts[4],
        },
    }

    stats["processed"] += 1
    log.info(
        "Phase2 %s → %s (%s) → %s",
        md_path.name,
        result.category,
        result.project,
        out_path.name,
    )
    if result.confidence < 0.6:
        stats["warnings"].append(md_path.name)


def main() -> int:
    mod = load_pipeline_module()
    registry = load_registry()
    stats = {"total": 0, "skipped": 0, "processed": 0, "errors": 0, "warnings": []}

    files = sorted(TRANSCRIPTIONS.glob("*.md"))
    stats["total"] = len(files)
    log.info("Phase 2: %d raw transcript(s)", len(files))

    for md in files:
        try:
            process_file(mod, md, registry, stats)
            save_registry(registry)
        except Exception as exc:
            stats["errors"] += 1
            log.exception("Failed %s: %s", md.name, exc)

    save_registry(registry)

    log.info("--- Phase 2 summary ---")
    log.info("Total raw: %d", stats["total"])
    log.info("Skipped (unchanged): %d", stats["skipped"])
    log.info("Processed: %d", stats["processed"])
    log.info("Errors: %d", stats["errors"])
    if stats["warnings"]:
        log.info("Low-confidence files: %s", ", ".join(stats["warnings"]))

    return 1 if stats["errors"] and stats["processed"] == 0 else 0


if __name__ == "__main__":
    sys.exit(main())
