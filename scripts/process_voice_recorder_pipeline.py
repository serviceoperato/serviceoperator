#!/usr/bin/env python3
"""
Voice recorder pipeline orchestrator: transcribe, classify, write /content outputs.

Usage:
  python scripts/process_voice_recorder_pipeline.py

Does not run git commit or git push.
"""

from __future__ import annotations

import importlib.util
import json
import logging
import re
import sys
import traceback
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

REPO_ROOT = _SCRIPTS_DIR.parent
CONTENT = REPO_ROOT / "content"
TRANSCRIPTIONS_DIR = CONTENT / "transcriptions"
PROCESSED_DIR = CONTENT / "processed"
PROCESSED_JSON = PROCESSED_DIR / "processed_files.json"
PIPELINE_RUNS_JSON = PROCESSED_DIR / "pipeline_runs.json"
LATEST_PIPELINE_RUN_JSON = PROCESSED_DIR / "latest_pipeline_run.json"
NOTES_DIR = CONTENT / "notes"
MEETINGS_DIR = CONTENT / "meetings"
TASKS_DIR = CONTENT / "tasks"
CALENDAR_DIR = CONTENT / "calendar"
PROJECTS_DIR = CONTENT / "projects"
VOICE_REPORTS_DIR = CONTENT / "voice-reports"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

CATEGORIES = (
    "meeting",
    "personal note",
    "task",
    "calendar event",
    "business idea",
    "project update",
    "unclear",
)


@dataclass
class ParsedTranscription:
    md_path: Path
    source_file: str
    source_path: str
    processed_datetime: str
    detected_language: str
    language_probability: float | None
    body_text: str
    registry_key: str | None = None


@dataclass
class ClassificationResult:
    categories: list[str]
    confidence: float
    project_slug: str | None = None
    summary: str = ""
    decisions: list[str] = field(default_factory=list)
    tasks: list[str] = field(default_factory=list)
    open_points: list[str] = field(default_factory=list)
    next_steps: list[str] = field(default_factory=list)
    important_points: list[str] = field(default_factory=list)
    possible_actions: list[str] = field(default_factory=list)
    calendar_hint: str | None = None


@dataclass
class RunStats:
    run_datetime: str = ""
    files_scanned: int = 0
    files_transcribed: int = 0
    transcriptions_classified: int = 0
    notes_created: int = 0
    meetings_created: int = 0
    tasks_extracted: int = 0
    calendar_events: int = 0
    project_updates: int = 0
    ambiguous_items: int = 0
    errors: list[str] = field(default_factory=list)


def utc_now_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def record_error(stats: RunStats, context: str, exc: BaseException | None = None) -> None:
    """Append a human-readable error plus traceback for pipeline_runs.json / admin UI."""
    if exc is not None:
        msg = f"{context}: {exc}"
        stats.errors.append(msg)
        stats.errors.append(traceback.format_exc().strip())
        log.error("%s\n%s", msg, traceback.format_exc())
    else:
        stats.errors.append(context)
        log.error("%s", context)


def today_date() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def ensure_content_dirs() -> None:
    for d in (
        TRANSCRIPTIONS_DIR,
        PROCESSED_DIR,
        NOTES_DIR,
        MEETINGS_DIR,
        TASKS_DIR,
        CALENDAR_DIR,
        PROJECTS_DIR,
        VOICE_REPORTS_DIR,
    ):
        d.mkdir(parents=True, exist_ok=True)


def load_json(path: Path, default: dict) -> dict:
    if not path.exists():
        return default.copy()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return data
    except (json.JSONDecodeError, OSError) as exc:
        log.warning("Could not read %s (%s); using default.", path.name, exc)
    return default.copy()


def save_json(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def load_processed_registry() -> dict:
    return load_json(PROCESSED_JSON, {"processed": {}})


def save_processed_registry(data: dict) -> None:
    save_json(PROCESSED_JSON, data)


def load_pipeline_runs() -> dict:
    data = load_json(PIPELINE_RUNS_JSON, {"runs": []})
    if not isinstance(data.get("runs"), list):
        data["runs"] = []
    return data


def append_pipeline_run(stats: RunStats, processed_files: list[str]) -> None:
    data = load_pipeline_runs()
    err_count = len(stats.errors)
    run_stats = {
        "files_scanned": stats.files_scanned,
        "files_transcribed": stats.files_transcribed,
        "transcriptions_classified": stats.transcriptions_classified,
        "notes_created": stats.notes_created,
        "meetings_created": stats.meetings_created,
        "tasks_extracted": stats.tasks_extracted,
        "calendar_events": stats.calendar_events,
        "project_updates": stats.project_updates,
        "ambiguous_items": stats.ambiguous_items,
        "filesScanned": stats.files_scanned,
        "newProcessed": stats.files_transcribed,
        "transcriptions": stats.transcriptions_classified,
        "notes": stats.notes_created,
        "meetings": stats.meetings_created,
        "tasks": stats.tasks_extracted,
        "calendar": stats.calendar_events,
        "errors": err_count,
        "error_messages": list(stats.errors),
    }
    daily_report = f"content/voice-reports/{today_date()}-voice-report.md"
    run_files: dict = {
        "transcriptions": processed_files,
        "transcriptions_processed": processed_files,
    }
    if processed_files:
        run_files["dailyReport"] = daily_report
    if stats.tasks_extracted:
        run_files["tasks"] = "content/tasks/todo.md"
    if stats.calendar_events:
        run_files["calendar"] = "content/calendar/events.md"
    data["runs"].append(
        {
            "run_datetime": stats.run_datetime,
            "stats": run_stats,
            "files": run_files,
            "files_scanned": stats.files_scanned,
            "files_transcribed": stats.files_transcribed,
            "transcriptions_created": stats.files_transcribed,
            "transcriptions_classified": stats.transcriptions_classified,
            "notes_created": stats.notes_created,
            "meetings_created": stats.meetings_created,
            "tasks_extracted": stats.tasks_extracted,
            "calendar_events": stats.calendar_events,
            "project_updates": stats.project_updates,
            "ambiguous_items": stats.ambiguous_items,
            "errors": stats.errors,
            "error_details": [
                {"index": i + 1, "message": line}
                for i, line in enumerate(stats.errors)
            ],
        }
    )
    save_json(PIPELINE_RUNS_JSON, data)
    write_latest_pipeline_run(stats, processed_files)


def write_latest_pipeline_run(stats: RunStats, processed_files: list[str]) -> None:
    """Mirror last run for local admin API (content/processed/latest_pipeline_run.json)."""
    err_count = len(stats.errors)
    success = err_count == 0 and (stats.files_transcribed > 0 or stats.transcriptions_classified > 0)
    if err_count and stats.files_scanned > 0 and stats.files_transcribed == 0:
        status = "error"
    elif success:
        status = "success"
    else:
        status = "idle"
    daily_report = f"content/voice-reports/{today_date()}-voice-report.md"
    run_files: dict = {
        "transcriptions": [f"content/transcriptions/{n}" for n in processed_files]
        if processed_files
        and not str(processed_files[0]).startswith("content/")
        else processed_files,
    }
    if processed_files:
        if not run_files.get("transcriptions"):
            run_files["transcriptions"] = processed_files
        run_files["dailyReport"] = daily_report
    if stats.tasks_extracted:
        run_files["tasks"] = "content/tasks/todo.md"
    if stats.calendar_events:
        run_files["calendar"] = "content/calendar/events.md"
    run_stats = {
        "filesScanned": stats.files_scanned,
        "newProcessed": stats.files_transcribed,
        "transcriptions": stats.transcriptions_classified,
        "notes": stats.notes_created,
        "meetings": stats.meetings_created,
        "tasks": stats.tasks_extracted,
        "calendar": stats.calendar_events,
        "errors": err_count,
        "error_messages": list(stats.errors),
    }
    rel_trans = []
    for name in processed_files:
        rel_trans.append(
            name if str(name).startswith("content/") else f"content/transcriptions/{name}"
        )
    if rel_trans:
        run_files["transcriptions"] = rel_trans
    payload = {
        "status": status,
        "success": success if status == "success" else False if status == "error" else None,
        "startedAt": stats.run_datetime,
        "finishedAt": stats.run_datetime if status != "idle" else None,
        "exitCode": 0 if success else 1 if status == "error" else None,
        "stdout": "",
        "stderr": "\n".join(stats.errors) if stats.errors else "",
        "stats": run_stats,
        "files": run_files if run_files else None,
    }
    save_json(LATEST_PIPELINE_RUN_JSON, payload)


def import_transcribe_module():
    script = REPO_ROOT / "scripts" / "transcribe_voice_recorder.py"
    spec = importlib.util.spec_from_file_location("transcribe_voice_recorder", script)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load {script}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run_transcription_step(stats: RunStats) -> None:
    log.info("Step 1: Running transcription...")
    try:
        transcribe = import_transcribe_module()
        scanned, new_count, errors = transcribe.run_transcription()
        stats.files_scanned = scanned
        stats.files_transcribed = new_count
        stats.errors.extend(errors)
    except Exception as exc:
        record_error(stats, "Transcription step failed", exc)


def parse_metadata_line(line: str, label: str) -> str | None:
    prefix = f"- **{label}:**"
    if line.strip().startswith(prefix):
        value = line.strip()[len(prefix) :].strip()
        if value.startswith("`") and value.endswith("`"):
            return value[1:-1]
        return value
    return None


def parse_transcription_md(md_path: Path) -> ParsedTranscription | None:
    try:
        text = md_path.read_text(encoding="utf-8")
    except OSError as exc:
        log.error("Cannot read %s: %s", md_path, exc)
        return None

    lines = text.splitlines()
    source_file = md_path.stem
    source_path = ""
    processed_datetime = utc_now_str()
    detected_language = "unknown"
    language_probability: float | None = None

    for line in lines[:20]:
        if v := parse_metadata_line(line, "Source file"):
            source_file = v
        elif v := parse_metadata_line(line, "Source path"):
            source_path = v
        elif v := parse_metadata_line(line, "Processed"):
            processed_datetime = v
        elif v := parse_metadata_line(line, "Detected language"):
            detected_language = v
        elif line.strip().startswith("- **Language probability:**"):
            try:
                language_probability = float(line.split(":")[-1].strip())
            except ValueError:
                pass

    body_start = 0
    for i, line in enumerate(lines):
        if line.strip() == "## Transcription":
            body_start = i + 1
            break
    body_text = "\n".join(lines[body_start:]).strip()
    plain = re.sub(r"\*\*\[[^\]]+\]\*\*\s*", "", body_text)
    plain = re.sub(r"\s+", " ", plain).strip()

    return ParsedTranscription(
        md_path=md_path,
        source_file=source_file,
        source_path=source_path,
        processed_datetime=processed_datetime,
        detected_language=detected_language,
        language_probability=language_probability,
        body_text=plain or body_text,
    )


def find_registry_key(registry: dict, md_path: Path) -> str | None:
    resolved = str(md_path.resolve())
    for key, entry in registry.get("processed", {}).items():
        if entry.get("output_markdown") == resolved:
            return key
    return None


def pending_transcriptions(registry: dict) -> list[tuple[str, dict, Path]]:
    pending: list[tuple[str, dict, Path]] = []
    for key, entry in registry.get("processed", {}).items():
        if entry.get("pipeline_classified"):
            continue
        md = entry.get("output_markdown")
        if not md:
            continue
        path = Path(md)
        if path.is_file():
            pending.append((key, entry, path))
    return pending


def keyword_score(text: str, keywords: tuple[str, ...]) -> int:
    lower = text.lower()
    return sum(1 for kw in keywords if kw in lower)


def extract_bullet_candidates(text: str) -> list[str]:
    sentences = re.split(r"(?<=[.!?])\s+|\n+", text)
    out: list[str] = []
    for s in sentences:
        s = s.strip()
        if len(s) < 12:
            continue
        if len(s) > 280:
            s = s[:277] + "..."
        out.append(s)
        if len(out) >= 8:
            break
    return out


def detect_project_slug(text: str) -> str | None:
    lower = text.lower()
    mapping = (
        (("serviceopera", "service opera"), "serviceopera"),
        (("thaifans", "thai fans"), "thaifans"),
        (("work-it", "work it", "workit"), "work-it"),
        (("personal", "personale"), "personal"),
    )
    for keys, slug in mapping:
        if any(k in lower for k in keys):
            return slug
    return None


def classify_transcription(parsed: ParsedTranscription) -> ClassificationResult:
    text = parsed.body_text
    lower = text.lower()

    scores = {
        "meeting": keyword_score(
            lower,
            (
                "meeting",
                "riunione",
                "call",
                "zoom",
                "teams",
                "agenda",
                "participants",
                "partecipanti",
                "discussed",
                "discusso",
                "decision",
                "decisione",
            ),
        ),
        "personal note": keyword_score(
            lower,
            (
                "note",
                "nota",
                "remember",
                "ricorda",
                "reminder",
                "pensiero",
                "thought",
                "journal",
                "diario",
            ),
        ),
        "task": keyword_score(
            lower,
            (
                "task",
                "todo",
                "to do",
                "devo",
                "must",
                "need to",
                "fare",
                "completare",
                "finish",
                "action item",
                "assegna",
                "assign",
            ),
        ),
        "calendar event": keyword_score(
            lower,
            (
                "appointment",
                "appuntamento",
                "calendar",
                "calendario",
                "schedule",
                "event",
                "evento",
                "domani",
                "tomorrow",
                "next week",
                "prossima settimana",
                "alle ",
                " at ",
            ),
        ),
        "business idea": keyword_score(
            lower,
            (
                "idea",
                "business",
                "startup",
                "venture",
                "opportunity",
                "opportunità",
                "revenue",
                "market",
            ),
        ),
        "project update": keyword_score(
            lower,
            (
                "project",
                "progetto",
                "update",
                "aggiornamento",
                "progress",
                "milestone",
                "release",
                "deploy",
                "sprint",
            ),
        ),
    }

    project_slug = detect_project_slug(text)
    if project_slug:
        scores["project update"] += 2

    ranked = sorted(scores.items(), key=lambda x: (-x[1], x[0]))
    best_cat, best_score = ranked[0]
    second_score = ranked[1][1] if len(ranked) > 1 else 0

    categories: list[str] = []
    if best_score == 0:
        categories = ["unclear"]
        confidence = 0.35
    else:
        categories.append(best_cat)
        if second_score > 0 and second_score >= best_score - 1:
            categories.append(ranked[1][0])
        confidence = min(0.95, 0.45 + best_score * 0.12)

    bullets = extract_bullet_candidates(text)
    summary = bullets[0] if bullets else (text[:240] + ("..." if len(text) > 240 else ""))

    task_verbs = ("devo", "must", "need to", "todo", "task", "fare", "completare")
    tasks = [b for b in bullets if any(v in b.lower() for v in task_verbs)]
    if not tasks and "task" in categories:
        tasks = bullets[:3]

    calendar_hint = None
    if "calendar event" in categories:
        time_match = re.search(
            r"\b(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2}:\d{2}|tomorrow|domani|next week|prossima settimana)\b",
            lower,
        )
        calendar_hint = time_match.group(0) if time_match else "date/time to confirm"

    return ClassificationResult(
        categories=categories,
        confidence=confidence,
        project_slug=project_slug,
        summary=summary,
        decisions=bullets[:3] if "meeting" in categories else [],
        tasks=tasks,
        open_points=bullets[3:5] if "meeting" in categories else [],
        next_steps=tasks[:3] if tasks else bullets[-2:],
        important_points=bullets[:5],
        possible_actions=tasks if tasks else bullets[1:4],
        calendar_hint=calendar_hint,
    )


def source_block(parsed: ParsedTranscription, result: ClassificationResult) -> str:
    cats = ", ".join(result.categories)
    lines = [
        f"- **Source audio:** {parsed.source_file}",
        f"- **Source transcription:** `{parsed.md_path.name}`",
        f"- **Processing datetime:** {utc_now_str()}",
        f"- **Detected language:** {parsed.detected_language}",
        f"- **Category:** {cats}",
        f"- **Confidence:** {result.confidence:.2f}",
    ]
    if parsed.language_probability is not None:
        lines.append(
            f"- **Language probability:** {parsed.language_probability:.4f}"
        )
    return "\n".join(lines)


def append_to_file(path: Path, block: str) -> None:
    if path.exists():
        existing = path.read_text(encoding="utf-8")
        if existing and not existing.endswith("\n"):
            existing += "\n"
        path.write_text(existing + "\n" + block + "\n", encoding="utf-8")
    else:
        path.write_text(block + "\n", encoding="utf-8")


def write_meeting_file(
    parsed: ParsedTranscription, result: ClassificationResult, date_str: str
) -> Path:
    path = MEETINGS_DIR / f"{date_str}-meeting-voice-note.md"
    ref = f"`content/transcriptions/{parsed.md_path.name}`"
    block = f"""---

# Meeting Summary

## Source
{source_block(parsed, result)}

## Summary
{result.summary}

## Decisions
{chr(10).join(f"- {d}" for d in result.decisions) or "- (none extracted from transcription)"}

## Tasks
{chr(10).join(f"- {t}" for t in result.tasks) or "- (none extracted from transcription)"}

## Open Points
{chr(10).join(f"- {o}" for o in result.open_points) or "- (none extracted from transcription)"}

## Next Steps
{chr(10).join(f"- {n}" for n in result.next_steps) or "- (none extracted from transcription)"}

## Full Transcription Reference
See {ref}.
"""
    append_to_file(path, block)
    return path


def write_note_file(
    parsed: ParsedTranscription, result: ClassificationResult, date_str: str
) -> Path:
    path = NOTES_DIR / f"{date_str}-voice-note.md"
    ref = f"`content/transcriptions/{parsed.md_path.name}`"
    block = f"""---

# Voice Note

## Source
{source_block(parsed, result)}

## Clean Summary
{result.summary}

## Important Points
{chr(10).join(f"- {p}" for p in result.important_points) or "- (none extracted from transcription)"}

## Possible Actions
{chr(10).join(f"- {a}" for a in result.possible_actions) or "- (none extracted from transcription)"}

## Full Transcription Reference
See {ref}.
"""
    append_to_file(path, block)
    return path


def append_tasks(parsed: ParsedTranscription, result: ClassificationResult) -> int:
    if "task" not in result.categories and not result.tasks:
        return 0
    path = TASKS_DIR / "todo.md"
    date_str = today_date()
    items = result.tasks or extract_bullet_candidates(parsed.body_text)[:3]
    if not items:
        items = [result.summary]
    block = f"""## {date_str}

{source_block(parsed, result)}

"""
    for item in items:
        block += f"- [ ] {item} (from {parsed.source_file})\n"
    append_to_file(path, block)
    return len(items)


def append_calendar(parsed: ParsedTranscription, result: ClassificationResult) -> int:
    if "calendar event" not in result.categories:
        return 0
    path = CALENDAR_DIR / "events.md"
    when = result.calendar_hint or "date/time to confirm"
    block = f"""## {today_date()}

{source_block(parsed, result)}

- **When:** {when}
- **Details:** {result.summary}

"""
    append_to_file(path, block)
    return 1


def append_project_update(
    parsed: ParsedTranscription, result: ClassificationResult
) -> int:
    if "project update" not in result.categories and "business idea" not in result.categories:
        return 0
    slug = result.project_slug or "uncategorized"
    path = PROJECTS_DIR / f"{slug}.md"
    label = "Project update" if "project update" in result.categories else "Business idea"
    block = f"""## {today_date()} — {label}

{source_block(parsed, result)}

{result.summary}

"""
    append_to_file(path, block)
    return 1


def update_daily_voice_report(
    parsed: ParsedTranscription,
    result: ClassificationResult,
    stats: RunStats,
) -> None:
    path = VOICE_REPORTS_DIR / f"{today_date()}-voice-report.md"
    cats = ", ".join(result.categories)
    section = f"- **{parsed.source_file}** → {cats} (`{parsed.md_path.name}`)\n"

    if not path.exists():
        path.write_text(
            f"# Daily Voice Report — {today_date()}\n\n"
            f"Generated by `scripts/process_voice_recorder_pipeline.py`\n\n"
            f"## Audio Processed\n\n"
            f"## Notes\n\n"
            f"## Meetings\n\n"
            f"## Tasks\n\n"
            f"## Calendar Events\n\n"
            f"## Project Updates\n\n"
            f"## Ambiguous Items\n\n"
            f"## Errors\n\n",
            encoding="utf-8",
        )

    text = path.read_text(encoding="utf-8")

    def inject(header: str, line: str) -> str:
        marker = f"## {header}\n\n"
        if marker not in text:
            return text
        idx = text.index(marker) + len(marker)
        return text[:idx] + line + text[idx:]

    text = inject("Audio Processed", section)
    if "personal note" in result.categories or "unclear" in result.categories:
        text = inject("Notes", section)
    if "meeting" in result.categories:
        text = inject("Meetings", section)
    if "task" in result.categories:
        text = inject("Tasks", section)
    if "calendar event" in result.categories:
        text = inject("Calendar Events", section)
    if "project update" in result.categories or "business idea" in result.categories:
        text = inject("Project Updates", section)
    if "unclear" in result.categories:
        text = inject("Ambiguous Items", section)

    path.write_text(text, encoding="utf-8")


def process_transcription(
    registry: dict,
    key: str,
    entry: dict,
    md_path: Path,
    stats: RunStats,
) -> None:
    parsed = parse_transcription_md(md_path)
    if not parsed:
        stats.errors.append(f"Parse failed: {md_path.name}")
        return
    parsed.registry_key = key

    result = classify_transcription(parsed)
    log.info(
        "Classify %s → %s (%.0f%%)",
        parsed.source_file,
        ", ".join(result.categories),
        result.confidence * 100,
    )

    date_str = today_date()
    wrote_note = False
    wrote_meeting = False

    if "meeting" in result.categories:
        write_meeting_file(parsed, result, date_str)
        stats.meetings_created += 1
        wrote_meeting = True

    if (
        "personal note" in result.categories
        or "business idea" in result.categories
        or "unclear" in result.categories
        or (not wrote_meeting and "meeting" not in result.categories)
    ):
        if "personal note" in result.categories or "unclear" in result.categories or not wrote_meeting:
            write_note_file(parsed, result, date_str)
            stats.notes_created += 1
            wrote_note = True

    if not wrote_note and not wrote_meeting:
        write_note_file(parsed, result, date_str)
        stats.notes_created += 1

    stats.tasks_extracted += append_tasks(parsed, result)
    stats.calendar_events += append_calendar(parsed, result)
    stats.project_updates += append_project_update(parsed, result)

    if "unclear" in result.categories:
        stats.ambiguous_items += 1

    update_daily_voice_report(parsed, result, stats)

    entry["pipeline_classified"] = True
    entry["pipeline_classified_datetime"] = utc_now_str()
    entry["pipeline_categories"] = result.categories
    entry["pipeline_confidence"] = round(result.confidence, 4)
    registry["processed"][key] = entry
    stats.transcriptions_classified += 1


def run_pipeline() -> RunStats:
    from voice_pipeline_progress import write_progress

    stats = RunStats(run_datetime=utc_now_str())
    processed_names: list[str] = []
    ensure_content_dirs()

    if not PIPELINE_RUNS_JSON.exists():
        save_json(PIPELINE_RUNS_JSON, {"runs": []})

    write_progress(status="running", phase="pipeline", message="Voice pipeline starting…")
    run_transcription_step(stats)

    registry = load_processed_registry()
    pending = pending_transcriptions(registry)
    log.info("Transcriptions to classify: %d", len(pending))
    write_progress(
        phase="classify",
        message=f"Classifying {len(pending)} transcription(s)…",
    )

    for key, entry, md_path in pending:
        try:
            process_transcription(registry, key, entry, md_path, stats)
            processed_names.append(md_path.name)
            save_processed_registry(registry)
        except Exception as exc:
            record_error(stats, f"Classification failed for {md_path.name}", exc)

    save_processed_registry(registry)
    append_pipeline_run(stats, processed_names)

    if stats.errors:
        report_path = VOICE_REPORTS_DIR / f"{today_date()}-voice-report.md"
        if report_path.exists():
            text = report_path.read_text(encoding="utf-8")
            err_lines = "".join(f"- {e}\n" for e in stats.errors)
            marker = "## Errors\n\n"
            if marker in text:
                idx = text.index(marker) + len(marker)
                text = text[:idx] + err_lines + text[idx:]
                report_path.write_text(text, encoding="utf-8")

    write_progress(
        status="success" if not stats.errors else "error",
        phase="done",
        message="Pipeline finished.",
        files_completed=stats.files_transcribed,
    )
    return stats


def print_summary(stats: RunStats) -> None:
    log.info("--- Pipeline summary ---")
    log.info("Run datetime: %s", stats.run_datetime)
    log.info("Audio files scanned: %d", stats.files_scanned)
    log.info("New transcriptions: %d", stats.files_transcribed)
    log.info("Transcriptions classified: %d", stats.transcriptions_classified)
    log.info("Notes written/updated: %d", stats.notes_created)
    log.info("Meetings written/updated: %d", stats.meetings_created)
    log.info("Tasks extracted: %d", stats.tasks_extracted)
    log.info("Calendar events: %d", stats.calendar_events)
    log.info("Project updates: %d", stats.project_updates)
    log.info("Ambiguous items: %d", stats.ambiguous_items)
    log.info("Errors: %d", len(stats.errors))
    if stats.errors:
        for err in stats.errors:
            log.info("  - %s", err)


def main() -> int:
    log.info("Voice Recorder pipeline starting")
    stats = RunStats(run_datetime=utc_now_str())
    try:
        stats = run_pipeline()
    except Exception as exc:
        record_error(stats, "Pipeline crashed", exc)
        append_pipeline_run(stats, [])
        print_summary(stats)
        return 1
    print_summary(stats)
    blocking = [e for e in stats.errors if "faster-whisper" in e.lower()]
    if blocking and stats.files_transcribed == 0 and stats.files_scanned > 0:
        return 1
    if stats.errors and stats.transcriptions_classified == 0 and stats.files_transcribed > 0:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
