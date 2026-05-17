#!/usr/bin/env python3
"""
Phase 2 — Daily voice processing (runbook: content/voice-reports/daily-voice-processing-pipeline.md).

Scans content/transcriptions/*.md, writes AI-ready outputs under content/{notes,meetings,...},
Updates content/processed/processed_files.json (readyForSite gate) + PROCESSED header on raw files.
"""

from __future__ import annotations

import hashlib
import importlib.util
import logging
import re
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from voice_registry import (
    STATUS_AI_PENDING,
    STATUS_AI_PROCESSED,
    STATUS_AI_RUNNING,
    STATUS_FAILED,
    STATUS_NEEDS_REVIEW,
    STATUS_READY,
    empty_ai_outputs,
    find_entry_by_raw_path,
    has_primary_ai_output,
    load_registry,
    primary_output_exists,
    save_registry,
    upsert_entry,
    utc_now_iso,
)

_SCRIPTS = Path(__file__).resolve().parent
REPO = _SCRIPTS.parent
CONTENT = REPO / "content"
TRANSCRIPTIONS = CONTENT / "transcriptions"
PROCESSED = CONTENT / "processed"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

CATEGORIES = ("meeting", "conversation", "self-recap", "voice-note", "self-talk")

CHAT_IMPORT_MARKERS = ("whatsapp", "chat export", "conversation export", "chat history")


def is_chat_import_source(source: str | None) -> bool:
    s = (source or "").lower()
    return any(m in s for m in CHAT_IMPORT_MARKERS)

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


def strip_processed_header(text: str) -> str:
    lines = text.splitlines()
    if lines and lines[0].strip().startswith("<!-- PROCESSED:"):
        return "\n".join(lines[1:]).lstrip("\n")
    return text


def write_processed_header(path: Path, *, iso: str, output_rel: str, checksum: str) -> None:
    text = strip_processed_header(path.read_text(encoding="utf-8"))
    header = f"<!-- PROCESSED: true | date: {iso} | output: {output_rel} | checksum: {checksum} -->\n"
    path.write_text(header + text, encoding="utf-8")


def should_skip_phase2(audio_key: str | None, entry: dict | None, checksum: str) -> bool:
    if not entry or not audio_key:
        return False
    if not entry.get("readyForSite") or entry.get("status") != STATUS_READY:
        return False
    prev = entry.get("source_checksum") or entry.get("raw_checksum")
    return prev == checksum and primary_output_exists(entry.get("aiOutputs"))


def build_ai_outputs(result: Phase2Result, out_rel: str, parsed) -> dict[str, str | None]:
    outputs = empty_ai_outputs()
    if result.category == "meeting":
        outputs["meeting"] = out_rel
    else:
        outputs["note"] = out_rel
    if result.tasks:
        outputs["tasks"] = "content/tasks/todo.md"
    if result.calendar_events:
        outputs["calendar"] = "content/calendar/events.md"
    if result.project and result.project != "uncategorized":
        outputs["project"] = f"content/projects/{result.project}.md"
    elif result.project:
        outputs["project"] = "content/projects/uncategorized.md"
    if result.decisions:
        outputs["decisions"] = f"content/decisions/{today_str()}.md"
    if result.open_points:
        outputs["openPoints"] = f"content/open-points/{today_str()}.md"
    return outputs


def resolve_final_status(result: Phase2Result, ai_outputs: dict[str, str | None]) -> tuple[str, bool]:
    if not has_primary_ai_output(ai_outputs) or not primary_output_exists(ai_outputs):
        return STATUS_FAILED, False
    if result.confidence < 0.6:
        return STATUS_NEEDS_REVIEW, False
    return STATUS_READY, True


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

    audio_match = find_entry_by_raw_path(registry, rel)
    audio_key = audio_match[0] if audio_match else None
    audio_entry = audio_match[1] if audio_match else None

    if should_skip_phase2(audio_key, audio_entry, checksum):
        stats["skipped"] += 1
        return

    if audio_key:
        upsert_entry(
            registry,
            audio_key,
            status=STATUS_AI_RUNNING,
            readyForSite=False,
            source_checksum=checksum,
        )

    try:
        parsed = mod.parse_transcription_md(md_path)
        if not parsed:
            raise ValueError("parse failed")

        if is_chat_import_source(rel) or is_chat_import_source(parsed.md_path.name):
            if audio_key:
                upsert_entry(
                    registry,
                    audio_key,
                    status=STATUS_NEEDS_REVIEW,
                    readyForSite=False,
                    aiProcessedAt=utc_now_iso(),
                    error="chat import — not published to site",
                )
            stats["skipped"] += 1
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

        ai_outputs = build_ai_outputs(result, out_rel, parsed)
        final_status, ready = resolve_final_status(result, ai_outputs)

        if audio_key:
            upsert_entry(
                registry,
                audio_key,
                rawTranscriptionPath=rel,
                source_checksum=checksum,
                aiOutputs=ai_outputs,
                aiProcessedAt=processing_date,
                status=final_status,
                readyForSite=ready,
                error=None,
                category=result.category,
                project=result.project,
            )
        else:
            log.warning("No audio registry entry for %s — marked needs_review only in raw file", rel)

        stats["processed"] += 1
        log.info(
            "Phase2 %s → %s (%s) → %s [%s]",
            md_path.name,
            result.category,
            result.project,
            out_path.name,
            final_status,
        )
        if not ready:
            stats["warnings"].append(md_path.name)
    except Exception as exc:
        stats["errors"] += 1
        log.exception("AI processing failed for %s", md_path.name)
        if audio_key:
            upsert_entry(
                registry,
                audio_key,
                status=STATUS_FAILED,
                readyForSite=False,
                error=str(exc)[:500],
            )


def migrate_legacy_ready_flags(registry: dict) -> None:
    """Normalize legacy entries; only ready_for_site when primary AI output exists."""
    from voice_registry import normalize_ai_outputs, normalize_entry

    for key, val in list(registry.get("processed", {}).items()):
        entry = normalize_entry(key, val if isinstance(val, dict) else {})
        raw_rel = entry.get("rawTranscriptionPath") or ""
        if not raw_rel and entry.get("output_markdown"):
            try:
                raw_rel = Path(entry["output_markdown"]).relative_to(REPO).as_posix()
            except ValueError:
                raw_rel = ""
        ai_outputs = normalize_ai_outputs(entry.get("aiOutputs"))
        ready = primary_output_exists(ai_outputs)
        if raw_rel and (REPO / raw_rel).is_file() and val.get("pipeline_classified") and ready:
            upsert_entry(
                registry,
                key,
                rawTranscriptionPath=raw_rel,
                aiOutputs=ai_outputs,
                status=STATUS_READY,
                readyForSite=True,
                aiProcessedAt=entry.get("aiProcessedAt") or utc_now_iso(),
            )


def process_single_raw(md_path: Path, registry: dict | None = None, *, save: bool = True) -> dict:
    """Process one raw transcription immediately (per-file pipeline)."""
    mod = load_pipeline_module()
    reg = registry if registry is not None else load_registry()
    stats = {"processed": 0, "skipped": 0, "errors": 0, "warnings": []}
    process_file(mod, md_path, reg, stats)
    if save:
        save_registry(reg)
    return stats


def run_cursor_composer_phase2(extra_args: list[str] | None = None) -> int:
    """Phase 2 via Cursor Composer (@cursor/sdk) — not OpenAI."""
    import os
    import subprocess

    if not os.environ.get("CURSOR_API_KEY"):
        log.error(
            "CURSOR_API_KEY is required for Phase 2 (Cursor Composer on local repo).\n"
            "  Add it to .env from https://cursor.com/dashboard\n"
            "  Install SDK: cd telegram-cursor-bot && npm install\n"
            "  Emergency keyword-only fallback: set VOICE_PHASE2_HEURISTIC=1"
        )
        return 1

    cmd = ["node", str(_SCRIPTS / "cursor_voice_phase2.mjs")]
    if extra_args:
        cmd.extend(extra_args)
    log.info("Phase 2 (Cursor Composer): %s", " ".join(cmd[2:]) or "all pending raw files")
    result = subprocess.run(cmd, cwd=REPO, env=os.environ)
    return int(result.returncode)


def main_heuristic() -> int:
    """Legacy keyword/heuristic Phase 2 — not Cursor AI. Use only with VOICE_PHASE2_HEURISTIC=1."""
    mod = load_pipeline_module()
    registry = load_registry()
    migrate_legacy_ready_flags(registry)
    stats = {"total": 0, "skipped": 0, "processed": 0, "errors": 0, "warnings": []}

    files = sorted(TRANSCRIPTIONS.glob("*.md"))
    stats["total"] = len(files)
    log.warning("Phase 2 HEURISTIC mode (not Cursor Composer): %d raw transcript(s)", len(files))

    for md in files:
        process_file(mod, md, registry, stats)
        save_registry(registry)

    save_registry(registry)

    log.info("--- Phase 2 summary ---")
    log.info("Total raw: %d", stats["total"])
    log.info("Skipped (unchanged): %d", stats["skipped"])
    log.info("Processed: %d", stats["processed"])
    log.info("Errors: %d", stats["errors"])
    if stats["warnings"]:
        log.info("Low-confidence files: %s", ", ".join(stats["warnings"]))

    return 1 if stats["errors"] and stats["processed"] == 0 else 0


def main() -> int:
    import os

    if os.environ.get("VOICE_PHASE2_HEURISTIC") == "1":
        return main_heuristic()
    return run_cursor_composer_phase2()


if __name__ == "__main__":
    sys.exit(main())
