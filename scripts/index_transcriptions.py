#!/usr/bin/env python3
"""
Scan content/ AI-ready markdown folders and write content/processed/transcriptions_index.json.
Runnable manually or via POST /api/admin/transcriptions/reindex.
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

log = logging.getLogger("index_transcriptions")

REPO_ROOT = Path(__file__).resolve().parent.parent
CONTENT = REPO_ROOT / "content"
PROCESSED = CONTENT / "processed"
INDEX_PATH = PROCESSED / "transcriptions_index.json"
SYNC_SETTINGS_PATH = PROCESSED / "sync_settings.json"
TRANSCRIPTIONS_DIR = CONTENT / "transcriptions"

SCAN_FOLDERS: dict[str, str] = {
    "meetings": "meetings",
    "notes": "notes",
    "tasks": "tasks",
    "calendar": "calendar",
    "projects": "projects",
    "decisions": "decisions",
    "open-points": "open-points",
}

SECTION_ALIASES = {
    "source": "Source",
    "summary": "Summary",
    "clean summary": "Summary",
    "decisions": "Decisions",
    "tasks": "Tasks",
    "open points": "Open Points",
    "next steps": "Next Steps",
    "important points": "Important Points",
    "possible actions": "Possible Actions",
    "full transcription reference": "Full Transcription Reference",
}

CHART_KEYS = ("decisions", "tasks", "open_points", "calendar", "next_steps")


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def ensure_dirs() -> None:
    for name in SCAN_FOLDERS:
        (CONTENT / name).mkdir(parents=True, exist_ok=True)
    PROCESSED.mkdir(parents=True, exist_ok=True)
    TRANSCRIPTIONS_DIR.mkdir(parents=True, exist_ok=True)


def short_id(rel_path: str) -> str:
    digest = hashlib.sha256(rel_path.encode("utf-8")).hexdigest()
    return digest[:12]


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
            dt = datetime.strptime(normalized[:19] if "T" in fmt else normalized[:10], fmt).replace(
                tzinfo=timezone.utc
            )
            return dt.replace(microsecond=0).isoformat().replace("+00:00", "Z")
        except ValueError:
            continue
    iso = parse_iso_date(v)
    return f"{iso}T00:00:00Z" if iso else None


def extract_tasks(section: str, source_meta: dict[str, str]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for text in bullets_from(section):
        due = source_meta.get("due date")
        due_iso = parse_iso_date(due) if due else None
        priority = source_meta.get("priority") or None
        status = "done" if re.match(r"^\[[xX]\]", text) else "pending"
        clean = re.sub(r"^\[[ xX]\]\s*", "", text)
        clean = re.sub(r"\s*\(from [^)]+\)\s*$", "", clean, flags=re.I).strip()
        items.append(
            {
                "text": clean,
                "due_date": due_iso,
                "priority": priority,
                "status": status,
                "confidence": "low" if due and not due_iso else "high",
            }
        )
    return items


def extract_calendar(section: str, source_meta: dict[str, str]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    if not section.strip():
        return items
    if re.match(r"^#\s+\S", section.strip()) and "**When:**" not in section:
        return items
    when_m = re.search(r"\*\*When:\*\*\s*(.+)", section, re.I)
    details_m = re.search(r"\*\*Details:\*\*\s*(.+)", section, re.I)
    when = when_m.group(1).strip() if when_m else ""
    details = details_m.group(1).strip() if details_m else preview_of(section, 120)
    date_val = parse_iso_date(when) or parse_iso_date(source_meta.get("date"))
    time_val = source_meta.get("time")
    if time_val and re.search(r"confirm", time_val, re.I):
        time_val = None
    if not time_val and when and re.search(r"\d{1,2}:\d{2}", when):
        time_val = when
    confidence = "high" if date_val else "low"
    items.append(
        {
            "title": details or "Calendar event",
            "date": date_val,
            "time": time_val if time_val and not re.search(r"confirm", time_val, re.I) else None,
            "confidence": confidence,
        }
    )
    return items


def extract_decisions(section: str) -> list[dict[str, Any]]:
    return [{"text": t, "reason": None, "status": "logged"} for t in bullets_from(section)]


def extract_open_points(section: str, source_meta: dict[str, str]) -> list[dict[str, Any]]:
    owner = source_meta.get("owner")
    if owner and re.search(r"confirm", owner, re.I):
        owner = None
    return [
        {
            "question": t,
            "owner": owner,
            "due_date": parse_iso_date(source_meta.get("due date")),
        }
        for t in bullets_from(section)
    ]


def title_from_file(rel_path: str, frontmatter: dict[str, Any], sections: dict[str, str]) -> str:
    if frontmatter.get("title"):
        return str(frontmatter["title"])
    for line in sections.get("_preamble", "").splitlines():
        m = re.match(r"^#\s+(.+)$", line.strip())
        if m:
            return m.group(1).strip()
    return Path(rel_path).stem.replace("-", " ").replace("_", " ")


def index_file(category: str, abs_path: Path) -> dict[str, Any] | None:
    try:
        text = abs_path.read_text(encoding="utf-8")
    except OSError as exc:
        log.warning("Could not read %s: %s", abs_path, exc)
        return None

    rel = abs_path.relative_to(REPO_ROOT).as_posix()
    frontmatter, body = parse_frontmatter(text)
    sections = parse_sections(body)
    source_text = sections.get("Source", "")
    source_meta = parse_source_meta(source_text)

    summary = (
        sections.get("Summary", "")
        or sections.get("Clean Summary", "")
        or sections.get("_preamble", "")
    )

    tasks = extract_tasks(sections.get("Tasks", ""), source_meta)
    if category == "tasks" and not tasks:
        tasks = extract_tasks(body, source_meta)

    calendar_events = extract_calendar(sections.get("Calendar", ""), source_meta)
    if category == "calendar" and not calendar_events:
        calendar_events = extract_calendar(body, source_meta)

    decisions = extract_decisions(sections.get("Decisions", ""))
    open_points = extract_open_points(sections.get("Open Points", ""), source_meta)
    next_steps = bullets_from(sections.get("Next Steps", ""))

    stats = {
        "decisions_count": len(decisions),
        "tasks_count": len(tasks),
        "open_points_count": len(open_points),
        "calendar_events_count": len(calendar_events),
        "next_steps_count": len(next_steps),
    }

    counts_for_chart = [
        stats["decisions_count"],
        stats["tasks_count"],
        stats["open_points_count"],
        stats["calendar_events_count"],
        stats["next_steps_count"],
    ]
    has_chart_data = sum(1 for c in counts_for_chart if c > 0) >= 2

    source_audio = (
        frontmatter.get("source_audio")
        or source_meta.get("source audio")
        or source_meta.get("source file")
    )
    source_transcription = source_meta.get("source transcription")
    if source_transcription:
        source_transcription = source_transcription.strip("`")

    project = frontmatter.get("project") or source_meta.get("project") or source_meta.get("related project")
    project = str(project).strip() if project else None

    date_val = parse_iso_date(
        str(frontmatter.get("date", "")) if frontmatter.get("date") else None
    ) or parse_iso_date(source_meta.get("date"))
    processing_date = parse_processing_date(
        str(frontmatter.get("processing_date", "")) if frontmatter.get("processing_date") else None
    ) or parse_processing_date(source_meta.get("processing datetime"))

    raw_sections = {
        k: v
        for k, v in sections.items()
        if k not in ("_preamble",) and v
    }

    return {
        "id": short_id(rel),
        "category": category,
        "title": title_from_file(rel, frontmatter, sections),
        "filepath": rel,
        "source_audio": source_audio or None,
        "source_transcription": source_transcription or None,
        "project": project,
        "date": date_val,
        "processing_date": processing_date,
        "preview": preview_of(summary),
        "stats": stats,
        "has_chart_data": has_chart_data,
        "raw_sections": raw_sections,
        "extracted_items": {
            "tasks": tasks,
            "calendar_events": calendar_events,
            "decisions": decisions,
            "open_points": open_points,
        },
        "related_files": [],
    }


def list_md_files(folder: Path) -> list[Path]:
    if not folder.is_dir():
        return []
    files: list[Path] = []
    for path in sorted(folder.rglob("*.md")):
        if path.is_file():
            files.append(path)
    return files


def compute_related_files(items: list[dict[str, Any]]) -> None:
    by_id = {it["id"]: it for it in items}
    for item in items:
        related: list[str] = []
        for other in items:
            if other["id"] == item["id"]:
                continue
            if item.get("project") and other.get("project") == item.get("project"):
                related.append(other["id"])
                continue
            if item.get("source_audio") and other.get("source_audio") == item.get("source_audio"):
                related.append(other["id"])
                continue
            if item.get("date") and other.get("date") == item.get("date"):
                related.append(other["id"])
        item["related_files"] = related[:5]
    del by_id


def load_sync_settings() -> dict[str, Any]:
    if not SYNC_SETTINGS_PATH.is_file():
        return {"auto_sync_enabled": False}
    try:
        return json.loads(SYNC_SETTINGS_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"auto_sync_enabled": False}


def google_oauth_configured() -> bool:
    import os

    client_id = (os.environ.get("GOOGLE_OAUTH_CLIENT_ID") or os.environ.get("GOOGLE_CLIENT_ID") or "").strip()
    client_secret = (
        os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET") or os.environ.get("GOOGLE_CLIENT_SECRET") or ""
    ).strip()
    refresh = (os.environ.get("GOOGLE_OAUTH_REFRESH_TOKEN") or os.environ.get("GOOGLE_REFRESH_TOKEN") or "").strip()
    return bool(client_id and client_secret and refresh)


def try_auto_sync(items: list[dict[str, Any]], settings: dict[str, Any]) -> None:
    if not settings.get("auto_sync_enabled"):
        log.info("Google auto-sync disabled (auto_sync_enabled=false).")
        return
    if not google_oauth_configured():
        log.warning(
            "auto_sync_enabled but Google OAuth is not configured — skipping level-1 sync."
        )
        return
    log.warning(
        "Google OAuth env present but Calendar/Tasks client is not wired in Python yet — skipping auto-sync."
    )


def build_index() -> dict[str, Any]:
    ensure_dirs()
    items: list[dict[str, Any]] = []
    errors: list[str] = []
    files_processed = 0

    for category, folder_name in SCAN_FOLDERS.items():
        folder = CONTENT / folder_name
        for md in list_md_files(folder):
            files_processed += 1
            try:
                entry = index_file(category, md)
                if entry:
                    items.append(entry)
            except Exception as exc:  # noqa: BLE001
                msg = f"{md}: {exc}"
                errors.append(msg)
                log.exception("Parse error for %s", md)

    compute_related_files(items)
    totals = {cat: 0 for cat in SCAN_FOLDERS}
    for it in items:
        totals[it["category"]] = totals.get(it["category"], 0) + 1

    raw_count = len(list_md_files(TRANSCRIPTIONS_DIR))
    settings = load_sync_settings()
    try_auto_sync(items, settings)

    return {
        "ok": True,
        "generatedAt": utc_now_iso(),
        "totals": {**totals, "total": len(items)},
        "rawTranscriptionCount": raw_count,
        "filesProcessed": files_processed,
        "errors": errors,
        "items": items,
    }


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    started = time.perf_counter()
    data = build_index()
    INDEX_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    elapsed = time.perf_counter() - started
    log.info(
        "Wrote %s — %d item(s), %d file(s) scanned, %d error(s), %.2fs",
        INDEX_PATH,
        len(data["items"]),
        data["filesProcessed"],
        len(data["errors"]),
        elapsed,
    )
    return 0 if not data["errors"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
