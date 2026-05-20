#!/usr/bin/env python3
"""
Build AI-ready transcriptions index for /admin/transcriptions.

Indexes grouped outputs in content/ai-ready-transcriptions/ (one card per source) and
legacy folders content/{meetings,notes,...}. Raw files under content/transcriptions/
are tracked as sources only (never main list items).
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

log = logging.getLogger("index_transcriptions")

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from key_point_validation import is_valid_key_point, summary_explains_sparse_points  # noqa: E402
from tx_icon_concept import assign_icon_concepts_for_items, assign_icon_concepts_tree  # noqa: E402
from tx_speaker_format import apply_speaker_format_to_item  # noqa: E402
from tx_summary_utils import card_preview_of  # noqa: E402
from voice_registry import (  # noqa: E402
    ALLOWED_OUTPUT_PREFIXES,
    find_entry_by_raw_path,
    find_entry_by_source_id,
    is_visible_on_main_page,
    list_pending_sources,
    load_registry,
    normalize_entry,
    normalize_raw_rel,
)

REPO_ROOT = _SCRIPTS_DIR.parent
CONTENT = REPO_ROOT / "content"
PROCESSED = CONTENT / "processed"
INDEX_PATH = PROCESSED / "transcriptions_index.json"
SYNC_SETTINGS_PATH = PROCESSED / "sync_settings.json"
LATEST_PIPELINE_PATH = PROCESSED / "latest_pipeline_run.json"
TRANSCRIPTIONS_DIR = CONTENT / "transcriptions"
AI_READY_DIR = CONTENT / "ai-ready-transcriptions"

CATEGORIES = ("meetings", "notes", "tasks", "calendar", "projects", "decisions", "open-points")

PRIMARY_CATEGORY_ALIASES: dict[str, str] = {
    "meeting": "meetings",
    "meetings": "meetings",
    "note": "notes",
    "notes": "notes",
    "voice-note": "notes",
    "voice note": "notes",
    "conversation": "notes",
    "task": "tasks",
    "tasks": "tasks",
    "calendar": "calendar",
    "event": "calendar",
    "events": "calendar",
    "project": "projects",
    "projects": "projects",
    "decision": "decisions",
    "decisions": "decisions",
    "open-point": "open-points",
    "open-points": "open-points",
    "open point": "open-points",
    "open points": "open-points",
}


def normalize_primary_category(value: Any, fallback: str | None = None) -> str:
    """Map frontmatter / labels to a single index category key."""
    raw = str(value or "").strip().lower()
    if raw.startswith("[") and raw.endswith("]"):
        raw = raw.strip("[]").split(",")[0].strip().strip("'\"")
    if raw in PRIMARY_CATEGORY_ALIASES:
        return PRIMARY_CATEGORY_ALIASES[raw]
    for token in re.split(r"[\s,/|]+", raw):
        if token in PRIMARY_CATEGORY_ALIASES:
            return PRIMARY_CATEGORY_ALIASES[token]
    fb = str(fallback or "notes").strip().lower()
    if fb in CATEGORIES:
        return fb
    return PRIMARY_CATEGORY_ALIASES.get(fb, "notes")


SCAN_FOLDERS: dict[str, str] = {
    "meetings": "meetings",
    "notes": "notes",
    "tasks": "tasks",
    "calendar": "calendar",
    "projects": "projects",
    "decisions": "decisions",
    "open-points": "open-points",
}

LEGACY_SKIP_FILES = frozenset(
    {
        "2026-05-17-voice-note.md",
        "2026-05-17-meeting-voice-note.md",
        "2026-05-17-meeting-memo_003-c890c918890b.md",
        "2026-05-19-meeting-0519-dc086e74533d.md",
        "2026-05-20-meeting-0519-dc086e74533d.md",
        "todo.md",
        "events.md",
    }
)

CHAT_IMPORT_MARKERS = ("whatsapp", "chat history", "chat wi.md", "chat wi.")

SECTION_ALIASES = {
    "source": "Source",
    "summary": "Summary",
    "clean summary": "Summary",
    "top 3 important points": "Important Points",
    "important points": "Important Points",
    "decisions": "Decisions",
    "tasks": "Tasks",
    "open points": "Open Points",
    "next steps": "Next Steps",
    "possible actions": "Possible Actions",
    "calendar events": "Calendar Events",
    "top 3 key points": "Important Points",
    "people involved": "People Involved",
    "project updates": "Project Updates",
    "full transcription reference": "Full Transcription Reference",
}


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def ensure_dirs() -> None:
    for name in SCAN_FOLDERS:
        (CONTENT / name).mkdir(parents=True, exist_ok=True)
    AI_READY_DIR.mkdir(parents=True, exist_ok=True)
    PROCESSED.mkdir(parents=True, exist_ok=True)
    TRANSCRIPTIONS_DIR.mkdir(parents=True, exist_ok=True)


def short_id(rel_path: str) -> str:
    return hashlib.sha256(rel_path.encode("utf-8")).hexdigest()[:12]


def parse_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    if not text.startswith("---"):
        return {}, text
    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}, text
    meta: dict[str, Any] = {}
    for line in parts[1].splitlines():
        if ":" not in line:
            continue
        key, val = line.split(":", 1)
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key:
            meta[key] = val
    return meta, parts[2].lstrip("\n")


def parse_sections(body: str) -> dict[str, str]:
    sections: dict[str, str] = {}
    current_key = "_preamble"
    current_lines: list[str] = []
    for line in body.splitlines():
        m = re.match(r"^##\s+(.+?)\s*$", line)
        if m:
            sections[current_key] = "\n".join(current_lines).strip()
            title = m.group(1).strip()
            current_key = SECTION_ALIASES.get(title.lower(), title)
            current_lines = []
        else:
            current_lines.append(line)
    sections[current_key] = "\n".join(current_lines).strip()
    if "_preamble" in sections and not sections["_preamble"]:
        del sections["_preamble"]
    return sections


def parse_source_meta(source_text: str) -> dict[str, str]:
    meta: dict[str, str] = {}
    for line in source_text.splitlines():
        m = re.match(r"^\s*-\s+\*\*([^*]+):\*\*\s*(.+)\s*$", line)
        if m:
            meta[m.group(1).strip().lower()] = m.group(2).strip().strip("`")
    return meta


def bullets_from(section: str) -> list[str]:
    if not section:
        return []
    out: list[str] = []
    for line in section.splitlines():
        m = re.match(r"^\s*-\s+(?:\[[ xX]\]\s+)?(.+)$", line)
        if not m:
            continue
        text = m.group(1).strip()
        if text and not re.search(r"none extracted", text, re.I):
            out.append(text)
    return out


def category_label_from_path(rel: str) -> str:
    name = Path(rel).stem
    if "meeting" in name:
        return "Meeting"
    if "voice-note" in name or "voice_note" in name:
        return "Voice note"
    if "conversation" in name:
        return "Conversation"
    if "self-recap" in name:
        return "Self recap"
    return "Note"


def preview_of(text: str, max_len: int = 200) -> str:
    t = re.sub(r"\s+", " ", (text or "").strip())
    if len(t) <= max_len:
        return t
    return t[: max_len - 1] + "…"


def parse_iso_date(value: str | None) -> str | None:
    if not value:
        return None
    v = value.strip()
    if not v or re.search(r"confirm|unknown|tbd", v, re.I):
        return None
    if re.match(r"^\d{4}-\d{2}-\d{2}", v):
        try:
            return datetime.fromisoformat(v[:10]).date().isoformat()
        except ValueError:
            return None
    try:
        dt = datetime.fromisoformat(v.replace("Z", "+00:00"))
        return dt.date().isoformat()
    except ValueError:
        pass
    m = re.search(r"(\d{4}-\d{2}-\d{2})", v)
    return m.group(1) if m else None


def parse_processing_date(value: str | None) -> str | None:
    if not value:
        return None
    v = value.strip()
    if not v or re.search(r"confirm|unknown", v, re.I):
        return None
    normalized = v.replace(" UTC", "").replace("Z", "")
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(
                normalized[:19] if "T" in fmt else normalized[:10], fmt
            ).replace(tzinfo=timezone.utc)
            return dt.replace(microsecond=0).isoformat().replace("+00:00", "Z")
        except ValueError:
            continue
    iso = parse_iso_date(v)
    return f"{iso}T00:00:00Z" if iso else None


def strip_html_comment(text: str) -> str:
    return re.sub(r"\s*<!--[^>]+-->\s*$", "", text).strip()


def latin_letter_ratio(text: str) -> float:
    letters = re.findall(r"[A-Za-zÀ-ÿ]", text)
    if not letters:
        return 0.0
    all_chars = re.findall(r"\S", text)
    return len(letters) / max(len(all_chars), 1)


def is_garbage_text(text: str) -> bool:
    t = strip_html_comment(text)
    if len(t) < 12:
        return True
    if re.search(r"none extracted", t, re.I):
        return True
    if latin_letter_ratio(t) < 0.35 and len(t) > 20:
        return True
    if re.fullmatch(r"[\W\d_]+", t):
        return True
    return False


def is_meaningful_line(text: str) -> bool:
    t = strip_html_comment(text)
    if not is_valid_key_point(t):
        return False
    return not is_garbage_text(t)


def is_chat_import_source(source_transcription: str | None) -> bool:
    s = (source_transcription or "").lower()
    return any(m in s for m in CHAT_IMPORT_MARKERS)


def canonical_outputs_by_raw(registry: dict[str, Any]) -> dict[str, set[str]]:
    """Map normalized raw path -> set of primary output paths from canonical registry rows."""
    out: dict[str, set[str]] = {}
    for key, val in registry.get("processed", {}).items():
        entry = normalize_entry(key, val)
        raw_rel = normalize_raw_rel(str(entry.get("rawTranscriptionPath") or ""))
        if not raw_rel:
            continue
        paths: set[str] = set()
        grouped = entry.get("groupedOutputPath")
        if grouped:
            paths.add(str(grouped))
        ai = entry.get("aiOutputs") or {}
        for p in (ai.get("meeting"), ai.get("note")):
            if p:
                paths.add(str(p))
        if paths:
            out.setdefault(raw_rel, set()).update(paths)
    return out


def raw_has_grouped_output(raw_rel: str | None, registry: dict[str, Any]) -> bool:
    if not raw_rel:
        return False
    canonical = canonical_outputs_by_raw(registry).get(normalize_raw_rel(raw_rel), set())
    return any(p.startswith("content/ai-ready-transcriptions/") for p in canonical)


def output_is_canonical(filepath: str, source_transcription: str | None, registry: dict[str, Any]) -> bool:
    rel = filepath.replace("\\", "/")
    raw = normalize_raw_rel(source_transcription or "")
    if not raw:
        return True
    canonical = canonical_outputs_by_raw(registry).get(raw)
    if not canonical:
        return True
    return rel in canonical


def summary_looks_like_raw_paste(summary: str, source_transcription: str | None) -> bool:
    if not summary or not source_transcription:
        return False
    raw_rel = normalize_raw_rel(source_transcription)
    match = None
    try:
        from voice_ai_validation import validate_paths

        entry = find_entry_by_raw_path(load_registry(), raw_rel)
        if entry:
            out_rel = entry[1].get("groupedOutputPath") or (entry[1].get("aiOutputs") or {}).get(
                "meeting"
            ) or (entry[1].get("aiOutputs") or {}).get("note")
            if out_rel:
                check = validate_paths(raw_rel, str(out_rel))
                return not bool(check.get("ok"))
    except Exception:
        pass
    raw_path = REPO_ROOT / raw_rel
    if not raw_path.is_file():
        return False
    raw_text = raw_path.read_text(encoding="utf-8")
    snippet = re.sub(r"\s+", " ", summary.strip())[:120].lower()
    if len(snippet) < 40:
        return False
    raw_norm = re.sub(r"\s+", " ", raw_text).lower()
    return snippet in raw_norm


def resolve_source_transcription(
    item: dict[str, Any], registry: dict[str, Any]
) -> str | None:
    raw = item.get("source_transcription")
    if raw:
        return normalize_raw_rel(raw)
    audio = item.get("source_audio")
    if audio:
        for key, val in registry.get("processed", {}).items():
            entry = normalize_entry(key, val)
            if entry.get("sourceAudio") == audio or audio in key:
                return normalize_raw_rel(str(entry.get("rawTranscriptionPath") or "")) or None
    extracted = item.get("extracted_items") or {}
    blob = json.dumps(extracted, ensure_ascii=False)
    m = re.search(r"src:\s*([a-f0-9]{8,16})", blob, re.I)
    if m:
        match = find_entry_by_source_id(registry, m.group(1))
        if match:
            return normalize_raw_rel(str(match[1].get("rawTranscriptionPath") or "")) or None
    return None


def is_header_only_file(text: str, sections: dict[str, str]) -> bool:
    body = re.sub(r"^#+\s+.+$", "", text, flags=re.M).strip()
    body = re.sub(r"^---[\s\S]*?---", "", body).strip()
    if len(body) < 40:
        return True
    meaningful = sum(1 for v in sections.values() if v and not re.match(r"^\(none\)$", v.strip(), re.I))
    return meaningful == 0


def base_item(
    *,
    category: str,
    title: str,
    filepath: str,
    preview: str | None = None,
    summary: str | None = None,
    source_audio: str | None = None,
    source_transcription: str | None = None,
    project: str | None = None,
    date_val: str | None = None,
    processing_date: str | None = None,
    stats: dict[str, int] | None = None,
    extracted_items: dict[str, Any] | None = None,
    raw_sections: dict[str, str] | None = None,
    needs_review: bool = False,
    item_type: str = "file",
) -> dict[str, Any]:
    stats = stats or {
        "decisions_count": 0,
        "tasks_count": 0,
        "open_points_count": 0,
        "calendar_events_count": 0,
        "next_steps_count": 0,
    }
    counts_for_chart = [
        stats["decisions_count"],
        stats["tasks_count"],
        stats["open_points_count"],
        stats["calendar_events_count"],
        stats["next_steps_count"],
    ]
    full_summary = (summary if summary is not None else preview or "").strip()
    card = card_preview_of(full_summary) if full_summary else preview_of(preview or "", 280)
    if not card:
        card = preview_of(preview or full_summary or title, 280)
    return {
        "id": short_id(filepath),
        "category": category,
        "categoryLabel": category.replace("-", " ").title(),
        "title": title[:120],
        "filepath": filepath,
        "path": filepath,
        "source_audio": source_audio,
        "source_transcription": source_transcription,
        "sourceAudio": source_audio,
        "sourceTranscription": source_transcription,
        "project": project,
        "date": date_val,
        "eventDate": date_val,
        "processing_date": processing_date,
        "processedDate": processing_date,
        "preview": card,
        "cardSummary": card,
        "summary": full_summary,
        "stats": stats,
        "has_chart_data": sum(1 for c in counts_for_chart if c > 0) >= 2,
        "raw_sections": raw_sections or {},
        "extracted_items": extracted_items or {},
        "related_files": [],
        "source_only": False,
        "needs_review": needs_review,
        "item_type": item_type,
        "reviewed": False,
    }


def read_md(abs_path: Path) -> tuple[str, dict[str, Any], dict[str, str], dict[str, str]]:
    text = abs_path.read_text(encoding="utf-8")
    frontmatter, body = parse_frontmatter(text)
    sections = parse_sections(body)
    source_meta = parse_source_meta(sections.get("Source", ""))
    return text, frontmatter, sections, source_meta


def meta_from_file(
    frontmatter: dict[str, Any], source_meta: dict[str, str], abs_path: Path
) -> tuple[str | None, str | None, str | None, str | None]:
    source_audio = (
        str(frontmatter.get("source_audio", "") or "").strip()
        or source_meta.get("source audio")
        or source_meta.get("source file")
    ) or None
    source_transcription = (
        str(frontmatter.get("source_transcription", "") or "").strip()
        or source_meta.get("source transcription")
    )
    if source_transcription:
        source_transcription = source_transcription.strip("`")
    project = str(frontmatter.get("project", "") or source_meta.get("project") or "").strip() or None
    if project in ("uncategorized", "personal", "thaifans") and not source_audio:
        pass
    date_val = parse_iso_date(str(frontmatter.get("date", "") or "")) or parse_iso_date(
        source_meta.get("date")
    )
    processing_date = parse_processing_date(
        str(frontmatter.get("processing_date", "") or "")
    ) or parse_processing_date(source_meta.get("processing datetime"))
    return source_audio, source_transcription, project, date_val, processing_date


def index_meeting_file(abs_path: Path, registry: dict[str, Any] | None = None) -> dict[str, Any] | None:
    rel = abs_path.relative_to(REPO_ROOT).as_posix()
    if abs_path.name in LEGACY_SKIP_FILES:
        return None
    text, frontmatter, sections, source_meta = read_md(abs_path)
    if is_header_only_file(text, sections):
        return None
    source_audio, source_transcription, project, date_val, processing_date = meta_from_file(
        frontmatter, source_meta, abs_path
    )
    if is_chat_import_source(source_transcription):
        return None
    if registry is not None and raw_has_grouped_output(source_transcription, registry):
        return None
    if registry is not None and not output_is_canonical(rel, source_transcription, registry):
        return None
    summary = sections.get("Summary", "")
    decisions = [b for b in bullets_from(sections.get("Decisions", "")) if is_meaningful_line(b)]
    tasks = [b for b in bullets_from(sections.get("Tasks", "")) if is_meaningful_line(b)]
    open_pts = [b for b in bullets_from(sections.get("Open Points", "")) if is_meaningful_line(b)]
    next_steps = [b for b in bullets_from(sections.get("Next Steps", "")) if is_meaningful_line(b)]
    important = [
        b for b in bullets_from(sections.get("Important Points", "")) if is_meaningful_line(b)
    ]
    for alt in ("Top 3 Important Points", "Top 3 Key Points"):
        if not important and sections.get(alt):
            important = [b for b in bullets_from(sections[alt]) if is_meaningful_line(b)]
    if not summary and not important:
        return None
    if is_garbage_text(summary) and not important:
        return None
    needs_review = is_garbage_text(summary) or summary_looks_like_raw_paste(summary, source_transcription)
    title = str(frontmatter.get("title", "") or preview_of(summary or important[0], 60))
    stats = {
        "decisions_count": len(decisions),
        "tasks_count": len(tasks),
        "open_points_count": len(open_pts),
        "calendar_events_count": 0,
        "next_steps_count": len(next_steps),
    }
    full_summary = summary or (important[0] if important else "")
    return base_item(
        category="meetings",
        title=title,
        filepath=rel,
        summary=full_summary,
        preview=card_preview_of(full_summary) or preview_of(full_summary or title, 70),
        source_audio=source_audio,
        source_transcription=source_transcription,
        project=project,
        date_val=date_val,
        processing_date=processing_date,
        stats=stats,
        extracted_items={
            "decisions": decisions,
            "tasks": tasks,
            "open_points": open_pts,
            "next_steps": next_steps,
            "important_points": important,
        },
        raw_sections={k: v for k, v in sections.items() if v and k != "Full Transcription Reference"},
        needs_review=needs_review,
    )


def index_grouped_file(abs_path: Path, registry: dict[str, Any] | None = None) -> dict[str, Any] | None:
    """One grouped AI-ready file per source transcription."""
    rel = abs_path.relative_to(REPO_ROOT).as_posix()
    if abs_path.name in LEGACY_SKIP_FILES:
        return None
    text, frontmatter, sections, source_meta = read_md(abs_path)
    if is_header_only_file(text, sections):
        return None
    source_audio, source_transcription, project, date_val, processing_date = meta_from_file(
        frontmatter, source_meta, abs_path
    )
    if registry is not None and not output_is_canonical(rel, source_transcription, registry):
        return None
    main_cat = str(frontmatter.get("main_category", "") or frontmatter.get("tags", "") or "").strip()
    primary_type = str(frontmatter.get("primary_type", "") or "note")
    type_fallback = "meetings" if primary_type == "meeting" else "notes"
    if not main_cat:
        main_cat = str(frontmatter.get("category", "") or primary_type or "note")
    index_cat = normalize_primary_category(main_cat, type_fallback)
    summary = sections.get("Summary", "") or sections.get("Clean Summary", "")
    important = [
        b for b in bullets_from(sections.get("Important Points", "")) if is_valid_key_point(b)
    ]
    if not important:
        important = [
            b for b in bullets_from(sections.get("Top 3 Key Points", "")) if is_valid_key_point(b)
        ]
    decisions = [b for b in bullets_from(sections.get("Decisions", "")) if is_meaningful_line(b)]
    tasks = [b for b in bullets_from(sections.get("Tasks", "")) if is_meaningful_line(b)]
    open_pts = [b for b in bullets_from(sections.get("Open Points", "")) if is_meaningful_line(b)]
    next_steps = [b for b in bullets_from(sections.get("Next Steps", "")) if is_meaningful_line(b)]
    calendar = [b for b in bullets_from(sections.get("Calendar Events", "")) if is_meaningful_line(b)]
    people = [b for b in bullets_from(sections.get("People Involved", "")) if is_meaningful_line(b)]
    project_updates = [
        b for b in bullets_from(sections.get("Project Updates", "")) if is_meaningful_line(b)
    ]
    if not summary and not important:
        return None
    needs_review = is_garbage_text(summary) or summary_looks_like_raw_paste(summary, source_transcription)
    title = str(frontmatter.get("title", "") or sections.get("Title", "") or preview_of(summary, 60))
    stats = {
        "decisions_count": len(decisions),
        "tasks_count": len(tasks),
        "open_points_count": len(open_pts),
        "calendar_events_count": len(calendar),
        "next_steps_count": len(next_steps),
    }
    full_summary = summary or (important[0] if important else "")
    return base_item(
        category=index_cat,
        title=title.strip() or preview_of(summary, 60),
        filepath=rel,
        summary=full_summary,
        preview=card_preview_of(full_summary) or preview_of(full_summary or title, 70),
        source_audio=source_audio,
        source_transcription=source_transcription,
        project=project,
        date_val=date_val,
        processing_date=processing_date,
        stats=stats,
        extracted_items={
            "decisions": decisions,
            "tasks": tasks,
            "open_points": open_pts,
            "next_steps": next_steps,
            "important_points": important,
            "calendar_events": calendar,
            "people": people,
            "project_updates": project_updates,
            "main_category": main_cat,
        },
        raw_sections={k: v for k, v in sections.items() if v and k != "Full Transcription Reference"},
        needs_review=needs_review,
        item_type="grouped",
    )


def index_note_file(abs_path: Path, registry: dict[str, Any] | None = None) -> dict[str, Any] | None:
    rel = abs_path.relative_to(REPO_ROOT).as_posix()
    if abs_path.name in LEGACY_SKIP_FILES:
        return None
    text, frontmatter, sections, source_meta = read_md(abs_path)
    if is_header_only_file(text, sections):
        return None
    source_audio, source_transcription, project, date_val, processing_date = meta_from_file(
        frontmatter, source_meta, abs_path
    )
    if is_chat_import_source(source_transcription):
        return None
    if registry is not None and raw_has_grouped_output(source_transcription, registry):
        return None
    if registry is not None and not output_is_canonical(rel, source_transcription, registry):
        return None
    conv = str(frontmatter.get("conversation", "")).lower() == "true"
    if conv and is_chat_import_source(source_transcription or abs_path.name):
        return None
    summary = sections.get("Summary", "") or sections.get("Clean Summary", "")
    important = [
        b for b in bullets_from(sections.get("Important Points", "")) if is_meaningful_line(b)
    ]
    actions = [
        b for b in bullets_from(sections.get("Possible Actions", "")) if is_meaningful_line(b)
    ]
    if not summary and not important and not actions:
        return None
    if is_garbage_text(summary) and not important and not actions:
        return None
    raw_title = str(frontmatter.get("title", "") or "").strip()
    if source_audio and (not raw_title or len(raw_title) > 50):
        title = f"{source_audio} · {category_label_from_path(rel)}"
    else:
        title = raw_title or preview_of(summary or (important[0] if important else rel), 60)
    full_summary = summary or (important[0] if important else "")
    card = card_preview_of(full_summary) if full_summary else preview_of(title, 70)
    return base_item(
        category="notes",
        title=title,
        filepath=rel,
        summary=full_summary,
        preview=card or title,
        source_audio=source_audio,
        source_transcription=source_transcription,
        project=project,
        date_val=date_val,
        processing_date=processing_date,
        stats={
            "decisions_count": 0,
            "tasks_count": len(actions),
            "open_points_count": 0,
            "calendar_events_count": 0,
            "next_steps_count": 0,
        },
        extracted_items={"important_points": important, "possible_actions": actions},
        raw_sections={k: v for k, v in sections.items() if v and k != "Full Transcription Reference"},
        needs_review=is_garbage_text(summary) or summary_looks_like_raw_paste(summary, source_transcription),
    )


def index_project_file(abs_path: Path) -> dict[str, Any] | None:
    rel = abs_path.relative_to(REPO_ROOT).as_posix()
    text = abs_path.read_text(encoding="utf-8")
    if len(text.strip()) < 80:
        return None
    if is_chat_import_source(abs_path.name):
        return None
    lines = [ln.strip() for ln in text.splitlines() if ln.strip() and not ln.strip().startswith("<!--")]
    content_lines = [
        ln
        for ln in lines
        if not re.match(r"^#+\s", ln) and not re.match(r"^##\s+Update\b", ln)
    ]
    body = " ".join(content_lines)
    if len(body) < 60 or is_garbage_text(body):
        return None
    if re.search(r"Messages and calls are end-to-end encrypted", body, re.I):
        return None
    if re.search(r"Saved on:\s*\d", body, re.I) and "Jack" in body:
        return None
    slug = abs_path.stem
    if slug in ("personal", "thaifans", "uncategorized") and len(body) < 120:
        return None
    title = f"Project update · {slug.replace('-', ' ').title()}"
    return base_item(
        category="projects",
        title=title,
        filepath=rel,
        preview=preview_of(body, 240),
        project=slug,
        date_val=parse_iso_date(lines[0].replace("## Update ", "")) if lines else None,
        item_type="file",
    )


def index_task_lines(todo_path: Path) -> list[dict[str, Any]]:
    if not todo_path.is_file():
        return []
    text = todo_path.read_text(encoding="utf-8")
    if re.match(r"^#\s+Voice tasks\s*$", text.strip(), re.M) and text.count("- [ ]") < 1:
        return []
    items: list[dict[str, Any]] = []
    current_audio: str | None = None
    current_trans: str | None = None
    current_date: str | None = None
    for line in text.splitlines():
        m_audio = re.search(r"\*\*Source audio:\*\*\s*(.+)", line)
        if m_audio:
            current_audio = m_audio.group(1).strip()
        m_trans = re.search(r"\*\*Source transcription:\*\*\s*`?([^`]+)`?", line)
        if m_trans:
            current_trans = m_trans.group(1).strip()
        if re.match(r"^##\s+(\d{4}-\d{2}-\d{2})", line.strip()):
            current_date = line.strip().replace("##", "").strip()
        m_task = re.match(r"^\s*-\s+\[\s*\]\s+(.+)$", line)
        if not m_task:
            continue
        task_text = strip_html_comment(m_task.group(1))
        task_text = re.sub(r"\s*\(from [^)]+\)\s*$", "", task_text, flags=re.I).strip()
        if not is_meaningful_line(task_text):
            continue
        rel = f"content/tasks/todo.md#task-{short_id(task_text)}"
        items.append(
            base_item(
                category="tasks",
                title=preview_of(task_text, 80),
                filepath=rel,
                preview=task_text,
                source_audio=current_audio,
                source_transcription=current_trans,
                date_val=parse_iso_date(current_date or ""),
                item_type="task",
                stats={
                    "decisions_count": 0,
                    "tasks_count": 1,
                    "open_points_count": 0,
                    "calendar_events_count": 0,
                    "next_steps_count": 0,
                },
                extracted_items={"tasks": [task_text]},
            )
        )
    return items


def index_calendar_lines(events_path: Path) -> list[dict[str, Any]]:
    if not events_path.is_file():
        return []
    text = events_path.read_text(encoding="utf-8")
    items: list[dict[str, Any]] = []
    current_audio: str | None = None
    current_trans: str | None = None
    block_lines: list[str] = []
    for line in text.splitlines() + [""]:
        if re.match(r"^##\s+\d{4}-\d{2}-\d{2}", line.strip()) or line.strip() == "":
            if block_lines:
                detail = " ".join(
                    ln
                    for ln in block_lines
                    if not ln.strip().startswith("- **") and ln.strip().startswith("-")
                )
                detail = strip_html_comment(detail.lstrip("- ").strip())
                if detail and is_meaningful_line(detail):
                    rel = f"content/calendar/events.md#event-{short_id(detail)}"
                    items.append(
                        base_item(
                            category="calendar",
                            title=preview_of(detail, 80),
                            filepath=rel,
                            preview=detail,
                            source_audio=current_audio,
                            source_transcription=current_trans,
                            item_type="calendar_event",
                            stats={
                                "decisions_count": 0,
                                "tasks_count": 0,
                                "open_points_count": 0,
                                "calendar_events_count": 1,
                                "next_steps_count": 0,
                            },
                            extracted_items={"calendar_events": [detail]},
                        )
                    )
            block_lines = []
        if re.search(r"\*\*Source audio:\*\*", line):
            current_audio = re.sub(r".*\*\*Source audio:\*\*\s*", "", line).strip()
        if re.search(r"\*\*Source transcription:\*\*", line):
            current_trans = re.sub(r".*`\s*", "", line).strip(" `")
        if line.strip().startswith("-") and "**When:**" not in line:
            block_lines.append(line)
    return items


def index_decision_open_files(
    category: str, folder: Path, registry: dict[str, Any] | None = None
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    section_key = "Decisions" if category == "decisions" else "Open Points"
    for md in sorted(folder.glob("*.md")):
        text, frontmatter, sections, source_meta = read_md(md)
        bullets = [b for b in bullets_from(sections.get(section_key, "")) if is_meaningful_line(b)]
        if not bullets:
            bullets = [b for b in bullets_from(text) if is_meaningful_line(b)]
        for bullet in bullets:
            rel = f"{md.relative_to(REPO_ROOT).as_posix()}#line-{short_id(bullet)}"
            src_audio: str | None = None
            src_trans: str | None = None
            src_id_m = re.search(r"src:\s*([a-f0-9]+)", bullet, re.I)
            if src_id_m and registry is not None:
                match = find_entry_by_source_id(registry, src_id_m.group(1))
                if match:
                    entry = match[1]
                    src_audio = entry.get("sourceAudio")
                    src_trans = normalize_raw_rel(str(entry.get("rawTranscriptionPath") or "")) or None
            items.append(
                base_item(
                    category=category,
                    title=preview_of(strip_html_comment(bullet), 80),
                    filepath=rel,
                    preview=strip_html_comment(bullet),
                    source_audio=src_audio,
                    source_transcription=src_trans,
                    date_val=parse_iso_date(md.stem) or parse_iso_date(str(frontmatter.get("date", ""))),
                    item_type=category.rstrip("s"),
                    extracted_items={
                        "decisions" if category == "decisions" else "open_points": [
                            strip_html_comment(bullet)
                        ]
                    },
                )
            )
    return items


def raw_source_allowed_for_site(raw_rel: str | None, registry: dict[str, Any]) -> bool:
    if not raw_rel:
        return False
    raw_rel = normalize_raw_rel(raw_rel)
    match = find_entry_by_raw_path(registry, raw_rel)
    if not match:
        return False
    return is_visible_on_main_page(match[1])


def path_is_allowed_output(path: str) -> bool:
    return any(path.startswith(prefix) for prefix in ALLOWED_OUTPUT_PREFIXES)


def structured_feed_ok(item: dict[str, Any]) -> bool:
    """Main feed: title, summary, key points, category, and extracted structure."""
    title = str(item.get("title") or "").strip()
    if not title or len(title) < 8:
        return False
    if title.lower().startswith("so guys we can start"):
        return False
    summary = str(item.get("summary") or item.get("preview") or "").strip()
    if len(summary) < 80:
        return False
    if summary.lower().startswith("so guys we can start"):
        return False
    cat = item.get("category")
    if cat not in CATEGORIES:
        return False
    extracted = item.get("extracted_items") or {}
    points = [
        p
        for p in (extracted.get("important_points") or [])
        if is_valid_key_point(str(p))
    ]
    ext_n = (
        len([b for b in (extracted.get("tasks") or []) if is_meaningful_line(str(b))])
        + len([b for b in (extracted.get("decisions") or []) if is_meaningful_line(str(b))])
        + len([b for b in (extracted.get("open_points") or []) if is_meaningful_line(str(b))])
    )
    if len(points) < 3:
        if len(points) >= 2 and summary_explains_sparse_points(summary):
            return True
        if len(points) < 2 or ext_n < 1:
            return False
    return True


def item_allowed_on_site(item: dict[str, Any], registry: dict[str, Any]) -> bool:
    path = str(item.get("path") or "")
    if path.startswith("content/transcriptions/"):
        return False
    if path and not path_is_allowed_output(path):
        return False
    cat = item.get("category")
    if cat not in CATEGORIES:
        return False
    if not structured_feed_ok(item):
        return False
    raw = resolve_source_transcription(item, registry)
    if raw:
        item["source_transcription"] = raw
        item["sourceTranscription"] = raw
        if is_chat_import_source(raw) and item.get("item_type") != "grouped":
            return False
        if not raw_source_allowed_for_site(raw, registry):
            return False
        try:
            from voice_ai_validation import validate_paths

            check = validate_paths(raw, path)
            if not check.get("ok"):
                item["needs_review"] = True
                item["publishValidation"] = check
                return False
        except Exception:
            return False
        return True
    return False


def collect_pending_with_orphans(registry: dict[str, Any], raw_files: list[Path]) -> list[dict[str, Any]]:
    pending = list_pending_sources(registry)
    known_raw = {p.get("rawTranscriptionPath") for p in pending if p.get("rawTranscriptionPath")}
    for key, val in registry.get("processed", {}).items():
        entry = normalize_entry(key, val)
        rp = entry.get("rawTranscriptionPath")
        if rp:
            known_raw.add(rp)
    for rf in raw_files:
        rel = f"content/transcriptions/{rf.name}"
        if rel in known_raw:
            continue
        pending.append(
            {
                "id": rel,
                "rawTranscriptionPath": rel,
                "sourceAudio": None,
                "status": "raw_created",
                "readyForSite": False,
                "error": None,
            }
        )
    return sorted(pending, key=lambda e: e.get("rawCreatedAt") or e.get("rawTranscriptionPath") or "", reverse=True)


def build_raw_sources(registry: dict[str, Any]) -> dict[str, Any]:
    raw_files: list[Path] = []
    if TRANSCRIPTIONS_DIR.is_dir():
        raw_files = sorted(TRANSCRIPTIONS_DIR.glob("*.md"), key=lambda p: p.stat().st_mtime, reverse=True)
    pending = collect_pending_with_orphans(registry, raw_files)
    waiting = sum(
        1
        for rf in raw_files
        if not raw_source_allowed_for_site(f"content/transcriptions/{rf.name}", registry)
    )
    latest_raw = raw_files[0].name if raw_files else None
    latest_processed = None
    latest_proc_dt = ""
    for _key, entry in registry.get("processed", {}).items():
        if entry.get("readyForSite") and entry.get("aiProcessedAt", "") > latest_proc_dt:
            latest_proc_dt = str(entry.get("aiProcessedAt"))
            raw_p = entry.get("rawTranscriptionPath") or ""
            latest_processed = raw_p.split("/")[-1] if raw_p else None
    return {
        "total": len(raw_files),
        "latestRawFile": latest_raw,
        "latestProcessedFile": latest_processed,
        "waitingForProcessing": waiting,
        "pendingSources": pending,
    }


def build_pipeline_meta() -> dict[str, Any]:
    if not LATEST_PIPELINE_PATH.is_file():
        return {"lastRun": None, "status": None, "summary": None}
    try:
        data = json.loads(LATEST_PIPELINE_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"lastRun": None, "status": None, "summary": None}
    return {
        "lastRun": data.get("run_datetime") or data.get("generatedAt"),
        "status": data.get("status"),
        "summary": data.get("summary") or data.get("stats"),
    }


PRIMARY_CATEGORY_ORDER: tuple[str, ...] = (
    "notes",
    "meetings",
    "projects",
    "tasks",
    "calendar",
    "decisions",
    "open-points",
)


def item_source_key(item: dict[str, Any]) -> str:
    raw = item.get("source_transcription") or item.get("sourceTranscription")
    if raw:
        return normalize_raw_rel(str(raw)).lower()
    audio = item.get("source_audio") or item.get("sourceAudio")
    if audio:
        return f"audio:{str(audio).strip().lower()}"
    path = str(item.get("path") or item.get("filepath") or item.get("id") or "")
    return f"path:{path}"


def merge_string_lists(a: list[Any], b: list[Any]) -> list[Any]:
    seen: set[str] = set()
    out: list[Any] = []
    for val in (a or []) + (b or []):
        key = json.dumps(val, sort_keys=True, ensure_ascii=False) if isinstance(val, dict) else str(val).strip()
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(val)
    return out


def merge_extracted_items(a: dict[str, Any], b: dict[str, Any]) -> dict[str, Any]:
    out = dict(a or {})
    for key, val in (b or {}).items():
        if key not in out:
            out[key] = list(val) if isinstance(val, list) else val
        elif isinstance(out[key], list) and isinstance(val, list):
            out[key] = merge_string_lists(out[key], val)
    return out


def resolve_source_primary_category(group: list[dict[str, Any]]) -> str:
    """Exactly one primary tab category per voice source."""
    for it in group:
        extracted = it.get("extracted_items") or {}
        for key in ("main_category", "mainCategory"):
            raw = extracted.get("main_category") or it.get(key)
            if raw:
                return normalize_primary_category(raw, it.get("category"))
        pt = it.get("primary_type") or it.get("primaryType")
        if pt:
            return normalize_primary_category(pt, it.get("category"))
    by_cat = {str(it.get("category") or ""): it for it in group}
    for cat in PRIMARY_CATEGORY_ORDER:
        if cat in by_cat:
            return normalize_primary_category(by_cat[cat].get("category"), cat)
    if group:
        return normalize_primary_category(group[0].get("category"), "notes")
    return "notes"


def pick_primary_item(group: list[dict[str, Any]]) -> dict[str, Any]:
    primary_cat = resolve_source_primary_category(group)
    for it in group:
        if normalize_primary_category(it.get("category"), primary_cat) == primary_cat:
            return it
    by_cat = {str(it.get("category") or ""): it for it in group}
    for cat in PRIMARY_CATEGORY_ORDER:
        if cat in by_cat:
            return by_cat[cat]
    return group[0]


def extraction_snapshot(child: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": child.get("id"),
        "category": child.get("category"),
        "title": child.get("title"),
        "path": child.get("path") or child.get("filepath"),
        "preview": child.get("preview"),
        "summary": child.get("summary"),
        "project": child.get("project"),
        "date": child.get("date"),
        "dueDate": child.get("dueDate"),
        "eventDate": child.get("eventDate"),
        "status": child.get("status"),
        "extracted_items": child.get("extracted_items") or {},
    }


def merge_stats(group: list[dict[str, Any]]) -> dict[str, int]:
    keys = (
        "decisions_count",
        "tasks_count",
        "open_points_count",
        "calendar_events_count",
        "next_steps_count",
    )
    merged = {k: 0 for k in keys}
    for child in group:
        stats = child.get("stats") or {}
        for key in keys:
            merged[key] += int(stats.get(key) or 0)
    return merged


def truncate_title_words(text: str, max_words: int = 12) -> str:
    words = re.sub(r"\s+", " ", (text or "").strip()).split()
    if len(words) <= max_words:
        return " ".join(words)
    return " ".join(words[:max_words]) + "…"


def is_low_quality_item(item: dict[str, Any]) -> bool:
    if item.get("needs_review"):
        return True
    blob = f"{item.get('title', '')} {item.get('preview', '')} {item.get('summary', '')}".lower()
    return "confidence: low" in blob


def infer_secondary_extractions(
    group: list[dict[str, Any]], merged_raw_sections: dict[str, str], stats: dict[str, int]
) -> tuple[list[str], dict[str, bool]]:
    """Secondary extraction flags for badges — never includes the source primary category."""
    flags = {
        "hasTasks": False,
        "hasCalendar": False,
        "hasDecisions": False,
        "hasOpenPoints": False,
        "hasProjects": False,
    }
    if stats.get("tasks_count", 0) > 0 or bullets_from(merged_raw_sections.get("Tasks", "")):
        flags["hasTasks"] = True
    if stats.get("calendar_events_count", 0) > 0 or bullets_from(
        merged_raw_sections.get("Calendar Events", "")
    ):
        flags["hasCalendar"] = True
    if stats.get("decisions_count", 0) > 0 or bullets_from(merged_raw_sections.get("Decisions", "")):
        flags["hasDecisions"] = True
    if stats.get("open_points_count", 0) > 0 or bullets_from(
        merged_raw_sections.get("Open Points", "")
    ):
        flags["hasOpenPoints"] = True
    for it in group:
        extracted = it.get("extracted_items") or {}
        updates = extracted.get("project_updates") or []
        if isinstance(updates, list) and updates:
            flags["hasProjects"] = True
            break
    if bullets_from(merged_raw_sections.get("Project Updates", "")):
        flags["hasProjects"] = True
    secondary: list[str] = []
    if flags["hasTasks"]:
        secondary.append("tasks")
    if flags["hasCalendar"]:
        secondary.append("calendar")
    if flags["hasDecisions"]:
        secondary.append("decisions")
    if flags["hasOpenPoints"]:
        secondary.append("open-points")
    if flags["hasProjects"]:
        secondary.append("projects")
    return secondary, flags


def pick_display_title(group: list[dict[str, Any]]) -> str:
    primary = pick_primary_item(group)
    if is_low_quality_item(primary):
        return "Unclear audio / Needs review"
    for cat in PRIMARY_CATEGORY_ORDER:
        for it in group:
            if it.get("category") == cat:
                title = str(it.get("title") or "").strip()
                if title and len(title) > 8 and not title.lower().startswith("ai-ready"):
                    return truncate_title_words(title, 12)
    for it in group:
        title = str(it.get("title") or "").strip()
        if title:
            return truncate_title_words(title, 12)
    audio = group[0].get("sourceAudio") or group[0].get("source_audio")
    return str(audio or "Voice source")


def group_items_by_source(flat_items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """One dashboard card per source audio/transcription."""
    groups: dict[str, list[dict[str, Any]]] = {}
    for item in flat_items:
        groups.setdefault(item_source_key(item), []).append(item)

    source_entries: list[dict[str, Any]] = []
    for source_key, group in groups.items():
        primary = pick_primary_item(group)
        extractions: dict[str, list[dict[str, Any]]] = {}
        for child in group:
            cat = str(child.get("category") or "")
            if not cat:
                continue
            extractions.setdefault(cat, []).append(extraction_snapshot(child))

        merged_extracted: dict[str, Any] = {}
        merged_raw_sections: dict[str, str] = {}
        for child in group:
            merged_extracted = merge_extracted_items(
                merged_extracted, child.get("extracted_items") or {}
            )
            merged_raw_sections.update(child.get("raw_sections") or {})

        task_lines = bullets_from(merged_raw_sections.get("Tasks", ""))
        if task_lines and not merged_extracted.get("tasks"):
            merged_extracted["tasks"] = task_lines
        stats = {
            "decisions_count": len(merged_extracted.get("decisions") or []),
            "tasks_count": len(merged_extracted.get("tasks") or []),
            "open_points_count": len(merged_extracted.get("open_points") or []),
            "calendar_events_count": len(merged_extracted.get("calendar_events") or []),
            "next_steps_count": len(merged_extracted.get("next_steps") or []),
        }
        chart_values = list(stats.values())
        child_ids = [str(it.get("id")) for it in group if it.get("id")]
        source_entries_children = [extraction_snapshot(child) for child in group]
        primary_cat = resolve_source_primary_category(group)
        secondary_categories, secondary_flags = infer_secondary_extractions(
            group, merged_raw_sections, stats
        )
        display_title = pick_display_title(group)
        summaries = [
            str(it.get("summary") or it.get("preview") or "").strip()
            for it in group
            if it.get("summary") or it.get("preview")
        ]
        summary = ""
        for s in summaries:
            if s and s.lower() not in display_title.lower():
                summary = s
                break
        if not summary and summaries:
            summary = summaries[0]
        source_id = short_id(f"source:{source_key}")
        entry: dict[str, Any] = {
            **{k: v for k, v in primary.items() if k not in ("id", "related_files", "title")},
            "id": source_id,
            "item_type": "source_entry",
            "isSourceEntry": True,
            "source_entry": True,
            "category": primary_cat,
            "primaryCategory": primary_cat,
            "mainCategory": primary_cat,
            "categories": secondary_categories,
            "extractedCategories": secondary_categories,
            **secondary_flags,
            "extractions": extractions,
            "sourceEntries": source_entries_children,
            "groupedIds": child_ids,
            "extracted_items": merged_extracted,
            "decisions": merged_extracted.get("decisions") or [],
            "tasks": merged_extracted.get("tasks") or [],
            "openPoints": merged_extracted.get("open_points") or [],
            "open_points": merged_extracted.get("open_points") or [],
            "nextSteps": merged_extracted.get("next_steps") or [],
            "next_steps": merged_extracted.get("next_steps") or [],
            "importantPoints": merged_extracted.get("important_points") or [],
            "important_points": merged_extracted.get("important_points") or [],
            "calendarEvents": merged_extracted.get("calendar_events") or [],
            "calendar_events": merged_extracted.get("calendar_events") or [],
            "possibleActions": merged_extracted.get("possible_actions") or [],
            "possible_actions": merged_extracted.get("possible_actions") or [],
            "raw_sections": merged_raw_sections,
            "childIds": child_ids,
            "related_files": [],
            "stats": stats,
            "has_chart_data": sum(1 for c in chart_values if c > 0) >= 2,
            "sourceKey": source_key,
            "sourceGroupKey": source_key,
            "title": display_title,
            "displayTitle": display_title,
            "summary": summary if summary else primary.get("summary"),
            "preview": card_preview_of(summary)
            if summary
            else primary.get("preview") or card_preview_of(display_title),
            "cardSummary": card_preview_of(summary)
            if summary
            else primary.get("cardSummary") or primary.get("preview"),
            "reviewed": all(bool(it.get("reviewed")) for it in group),
        }
        source_entries.append(entry)

    source_entries.sort(
        key=lambda it: (
            str(it.get("processing_date") or it.get("processedDate") or it.get("date") or ""),
            str(it.get("source_transcription") or ""),
        ),
        reverse=True,
    )
    return source_entries


def compute_index_totals(source_entries: list[dict[str, Any]]) -> tuple[dict[str, int], dict[str, int]]:
    """Return (extraction_element_totals, source_primary_totals)."""
    extraction_totals = {cat: 0 for cat in CATEGORIES}
    source_totals = {cat: 0 for cat in CATEGORIES}
    for entry in source_entries:
        primary = normalize_primary_category(
            entry.get("primaryCategory") or entry.get("mainCategory") or entry.get("category"),
            "notes",
        )
        if primary in source_totals:
            source_totals[primary] += 1
        stats = entry.get("stats") or {}
        extraction_totals["tasks"] += int(stats.get("tasks_count") or 0)
        extraction_totals["calendar"] += int(stats.get("calendar_events_count") or 0)
        extraction_totals["decisions"] += int(stats.get("decisions_count") or 0)
        extraction_totals["open-points"] += int(stats.get("open_points_count") or 0)
        extracted = entry.get("extracted_items") or {}
        updates = extracted.get("project_updates") or []
        if isinstance(updates, list):
            extraction_totals["projects"] += len(updates)
    extraction_totals["total"] = (
        extraction_totals["tasks"]
        + extraction_totals["calendar"]
        + extraction_totals["decisions"]
        + extraction_totals["open-points"]
        + extraction_totals["projects"]
    )
    source_totals["total"] = len(source_entries)
    return extraction_totals, source_totals


def compute_related_files(items: list[dict[str, Any]]) -> None:
    child_ids: set[str] = set()
    for item in items:
        for cid in item.get("childIds") or []:
            child_ids.add(str(cid))
    for item in items:
        related: list[str] = []
        for other in items:
            if other["id"] == item["id"]:
                continue
            if other["id"] in child_ids and other.get("sourceKey") == item.get("sourceKey"):
                continue
            if item.get("source_audio") and other.get("source_audio") == item.get("source_audio"):
                related.append(other["id"])
            elif item.get("source_transcription") and other.get("source_transcription") == item.get(
                "source_transcription"
            ):
                related.append(other["id"])
        item["related_files"] = related[:8]


def build_index() -> dict[str, Any]:
    ensure_dirs()
    registry = load_registry()
    items: list[dict[str, Any]] = []
    needs_review: list[dict[str, Any]] = []
    errors: list[str] = []

    def add_item(entry: dict[str, Any] | None) -> None:
        if not entry:
            return
        if entry.get("needs_review"):
            needs_review.append(entry)
        items.append(entry)

    if AI_READY_DIR.is_dir():
        for md in sorted(AI_READY_DIR.glob("*.md")):
            try:
                add_item(index_grouped_file(md, registry))
            except Exception as exc:  # noqa: BLE001
                errors.append(f"{md}: {exc}")

    for md in sorted((CONTENT / "meetings").glob("*.md")):
        try:
            add_item(index_meeting_file(md, registry))
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{md}: {exc}")

    for md in sorted((CONTENT / "notes").glob("*.md")):
        try:
            add_item(index_note_file(md, registry))
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{md}: {exc}")

    try:
        items.extend(index_task_lines(CONTENT / "tasks" / "todo.md"))
    except Exception as exc:  # noqa: BLE001
        errors.append(f"tasks/todo.md: {exc}")

    try:
        items.extend(index_calendar_lines(CONTENT / "calendar" / "events.md"))
    except Exception as exc:  # noqa: BLE001
        errors.append(f"calendar/events.md: {exc}")

    for md in sorted((CONTENT / "projects").glob("*.md")):
        try:
            add_item(index_project_file(md))
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{md}: {exc}")

    try:
        items.extend(index_decision_open_files("decisions", CONTENT / "decisions", registry))
    except Exception as exc:  # noqa: BLE001
        errors.append(f"decisions: {exc}")

    try:
        items.extend(index_decision_open_files("open-points", CONTENT / "open-points", registry))
    except Exception as exc:  # noqa: BLE001
        errors.append(f"open-points: {exc}")

    operational = [
        it
        for it in items
        if not it.get("needs_review") and item_allowed_on_site(it, registry)
    ]
    visible: list[dict[str, Any]] = []
    for it in operational:
        raw = resolve_source_transcription(it, registry)
        if not raw:
            continue
        it["source_transcription"] = raw
        it["sourceTranscription"] = raw
        match = find_entry_by_raw_path(registry, raw)
        if not match:
            continue
        entry = match[1]
        it["pipelineStatus"] = entry.get("status")
        it["readyForSite"] = is_visible_on_main_page(entry)
        if not it["readyForSite"]:
            continue
        visible.append(it)
    flat_operational = visible
    grouped_raws: set[str] = set()
    for it in flat_operational:
        if it.get("item_type") == "grouped":
            raw = resolve_source_transcription(it, registry)
            if raw:
                grouped_raws.add(normalize_raw_rel(raw))
    if grouped_raws:
        flat_operational = [
            it
            for it in flat_operational
            if it.get("item_type") == "grouped"
            or normalize_raw_rel(resolve_source_transcription(it, registry) or "") not in grouped_raws
        ]
    for it in flat_operational:
        apply_speaker_format_to_item(it)
    source_entries = group_items_by_source(flat_operational)
    for entry in source_entries:
        apply_speaker_format_to_item(entry)
        for child in entry.get("sourceEntries") or []:
            if isinstance(child, dict):
                apply_speaker_format_to_item(child)
    compute_related_files(source_entries)
    assign_icon_concepts_tree(source_entries)
    assign_icon_concepts_for_items(needs_review)
    extraction_totals, source_totals = compute_index_totals(source_entries)
    extraction_totals["needsReview"] = len(needs_review)
    source_totals["needsReview"] = len(needs_review)

    raw_sources = build_raw_sources(registry)
    pipeline = build_pipeline_meta()

    return {
        "ok": True,
        "generatedAt": utc_now_iso(),
        "registryVersion": registry.get("version", 2),
        "totals": extraction_totals,
        "counts": extraction_totals,
        "sourceTotals": source_totals,
        "sourceCount": len(source_entries),
        "rawSources": raw_sources,
        "rawTranscriptionCount": raw_sources["total"],
        "pipeline": pipeline,
        "needsReview": needs_review,
        "needsReviewCount": len(needs_review),
        "items": source_entries,
        "errors": errors,
    }


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    started = time.perf_counter()
    data = build_index()
    INDEX_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    elapsed = time.perf_counter() - started
    log.info(
        "Wrote %s — %d source entries (%d extractions), %d needs-review, %d raw file(s), %.2fs",
        INDEX_PATH,
        data.get("sourceCount", len(data["items"])),
        data["totals"].get("total", 0),
        data["needsReviewCount"],
        data["rawSources"]["total"],
        elapsed,
    )
    return 0 if not data["errors"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
