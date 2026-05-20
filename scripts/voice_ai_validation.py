"""Validate AI-ready voice outputs before publish (registry, index, phase2, pre-commit)."""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from key_point_validation import filter_key_points, is_valid_key_point, summary_explains_sparse_points

REPO_ROOT = Path(__file__).resolve().parent.parent
VALIDATION_LOG = REPO_ROOT / "content" / "processed" / "pipeline_validation_log.jsonl"

_TOKEN_RE = re.compile(r"[a-z0-9']+", re.I)
_TIMESTAMP_RE = re.compile(r"\*\*\[\d{2}:\d{2}(?:\.\d+)?\s*→\s*\d{2}:\d{2}(?:\.\d+)?\]\*\*")
_PROCESSED_HDR = re.compile(r"^<!--\s*PROCESSED:", re.I)

# Jaccard word overlap above this → treat as raw echo, not AI summary
SIMILARITY_FAIL_THRESHOLD = 0.72
MIN_SUMMARY_WORDS = 25
MIN_SUMMARY_CHARS = 80


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def normalize_compare_text(text: str) -> str:
    t = str(text or "")
    t = _PROCESSED_HDR.sub("", t)
    t = _TIMESTAMP_RE.sub(" ", t)
    t = re.sub(r"<!--[^>]+-->", " ", t)
    t = re.sub(r"[*_`#>\[\](){}|]", " ", t)
    t = re.sub(r"\s+", " ", t).strip().lower()
    return t


def token_set(text: str) -> set[str]:
    return set(_TOKEN_RE.findall(normalize_compare_text(text)))


def jaccard_similarity(a: str, b: str) -> float:
    ta, tb = token_set(a), token_set(b)
    if not ta or not tb:
        return 0.0
    inter = len(ta & tb)
    union = len(ta | tb)
    return inter / union if union else 0.0


def strip_processed_header(text: str) -> str:
    lines = text.splitlines()
    if lines and lines[0].strip().startswith("<!-- PROCESSED:"):
        return "\n".join(lines[1:]).lstrip("\n")
    return text


def extract_raw_transcript_body(raw_text: str) -> str:
    text = strip_processed_header(raw_text)
    m = re.search(r"^##\s+Transcription\s*\n([\s\S]*?)(?=^##\s+|\Z)", text, re.M | re.I)
    body = m.group(1) if m else text
    body = _TIMESTAMP_RE.sub(" ", body)
    body = re.sub(r"\*\*([^*]+)\*\*", r"\1", body)
    return normalize_compare_text(body)


def parse_markdown_sections(md: str) -> dict[str, str]:
    sections: dict[str, str] = {}
    parts = re.split(r"\n(?=##\s+)", md)
    for part in parts:
        m = re.match(r"^##\s+([^\n]+)\n([\s\S]*)", part)
        if m:
            sections[m.group(1).strip().lower()] = m.group(2).strip()
    return sections


def bullets_from_section(section_text: str) -> list[str]:
    out: list[str] = []
    for line in (section_text or "").splitlines():
        m = re.match(r"^\s*-\s+(?:\[[ xX]\]\s+)?(.+)$", line.strip())
        if m:
            out.append(m.group(1).strip())
    return out


def collect_key_points(sections: dict[str, str]) -> list[str]:
    keys = (
        "top 3 key points",
        "top 3 important points",
        "important points",
        "top 3 important point",
    )
    points: list[str] = []
    for k in keys:
        if k in sections:
            points.extend(bullets_from_section(sections[k]))
    return filter_key_points(points, max_items=5)


def collect_extracted_bullets(sections: dict[str, str]) -> list[str]:
    names = ("tasks", "decisions", "open points", "next steps", "calendar events", "project updates")
    out: list[str] = []
    for name in names:
        for b in bullets_from_section(sections.get(name, "")):
            if is_valid_key_point(b):
                out.append(b)
    return out


def extract_summary(sections: dict[str, str], frontmatter: dict[str, Any] | None = None) -> str:
    for key in ("summary", "clean summary"):
        if sections.get(key):
            return sections[key].strip()
    if frontmatter and frontmatter.get("title"):
        t = str(frontmatter["title"]).strip()
        if len(t) > 40 and not t.lower().startswith("so guys"):
            return t
    return ""


def read_yaml_frontmatter(text: str) -> dict[str, Any]:
    if not text.startswith("---"):
        return {}
    end = text.find("\n---", 3)
    if end < 0:
        return {}
    block = text[3:end]
    meta: dict[str, Any] = {}
    for line in block.splitlines():
        if ":" not in line:
            continue
        k, v = line.split(":", 1)
        meta[k.strip()] = v.strip().strip('"').strip("'")
    return meta


def validate_ai_ready_content(
    *,
    raw_text: str,
    output_text: str,
    raw_rel: str = "",
    output_rel: str = "",
) -> dict[str, Any]:
    """Return {ok, reasons, similarity, summaryWords, keyPointCount, modelHint}."""
    reasons: list[str] = []
    raw_body = extract_raw_transcript_body(raw_text)
    out_stripped = output_text
    if out_stripped.startswith("---"):
        fm = read_yaml_frontmatter(out_stripped)
    else:
        fm = {}
    sections = parse_markdown_sections(out_stripped)
    summary = extract_summary(sections, fm)
    summary_norm = normalize_compare_text(summary)
    key_points = collect_key_points(sections)
    extracted = collect_extracted_bullets(sections)

    similarity = jaccard_similarity(summary, raw_body) if summary and raw_body else 0.0
    summary_words = len(summary_norm.split()) if summary_norm else 0

    if not summary_norm or len(summary_norm) < MIN_SUMMARY_CHARS:
        reasons.append("missing or too short summary")
    elif summary_words < MIN_SUMMARY_WORDS:
        reasons.append(f"summary too brief ({summary_words} words)")
    if summary_norm and raw_body:
        prefix = summary_norm[:80]
        if len(prefix) >= 40 and prefix in raw_body:
            reasons.append("summary matches raw transcript opening (paste)")
        if similarity >= SIMILARITY_FAIL_THRESHOLD:
            reasons.append(f"summary too similar to raw transcript (jaccard={similarity:.2f})")
    title_norm = normalize_compare_text(str(fm.get("title", "") or sections.get("title", "")))
    if title_norm.startswith("so guys we can start"):
        reasons.append("title echoes raw transcript opening")
    if len(key_points) < 3:
        if len(key_points) >= 2 and summary_explains_sparse_points(summary):
            pass
        elif len(key_points) < 1 and len(extracted) < 1:
            reasons.append("need at least 3 key points or extracted tasks/decisions/open points")
        elif len(key_points) < 3 and len(extracted) < 2:
            reasons.append(
                f"need 3 key points (have {len(key_points)}) or more extracted items"
            )

    ok = len(reasons) == 0
    return {
        "ok": ok,
        "reasons": reasons,
        "similarity": round(similarity, 4),
        "summaryWords": summary_words,
        "keyPointCount": len(key_points),
        "extractedCount": len(extracted),
        "rawRel": raw_rel,
        "outputRel": output_rel,
        "modelHint": "heuristic" if similarity >= 0.65 else "structured",
    }


def validate_paths(
    raw_rel: str,
    output_rel: str,
    *,
    repo_root: Path | None = None,
) -> dict[str, Any]:
    root = repo_root or REPO_ROOT
    raw_path = root / normalize_raw_rel(raw_rel)
    out_path = root / output_rel.replace("\\", "/")
    if not raw_path.is_file():
        return {"ok": False, "reasons": [f"raw missing: {raw_rel}"], "rawRel": raw_rel, "outputRel": output_rel}
    if not out_path.is_file():
        return {"ok": False, "reasons": [f"output missing: {output_rel}"], "rawRel": raw_rel, "outputRel": output_rel}
    return validate_ai_ready_content(
        raw_text=raw_path.read_text(encoding="utf-8", errors="replace"),
        output_text=out_path.read_text(encoding="utf-8", errors="replace"),
        raw_rel=raw_rel,
        output_rel=output_rel,
    )


def normalize_raw_rel(raw_rel: str) -> str:
    s = (raw_rel or "").strip().replace("\\", "/")
    if not s:
        return ""
    if s.startswith("content/"):
        return s
    return f"content/transcriptions/{Path(s).name}"


def primary_output_rel(entry: dict[str, Any]) -> str | None:
    grouped = entry.get("groupedOutputPath")
    if grouped and str(grouped).startswith("content/"):
        return str(grouped)
    ai = entry.get("aiOutputs") or {}
    return ai.get("meeting") or ai.get("note")


def validate_registry_entry(entry: dict[str, Any], *, repo_root: Path | None = None) -> dict[str, Any]:
    raw_rel = normalize_raw_rel(str(entry.get("rawTranscriptionPath") or ""))
    out_rel = primary_output_rel(entry)
    if not raw_rel or not out_rel:
        return {"ok": False, "reasons": ["missing raw or primary output path"], "rawRel": raw_rel, "outputRel": out_rel}
    return validate_paths(raw_rel, out_rel, repo_root=repo_root)


def append_validation_log(
    *,
    source: str,
    filename: str,
    status: str,
    result: dict[str, Any],
    ai_model: str | None = None,
) -> None:
    VALIDATION_LOG.parent.mkdir(parents=True, exist_ok=True)
    row = {
        "ts": utc_now_iso(),
        "source": source,
        "filename": filename,
        "status": status,
        "aiModel": ai_model or result.get("modelHint") or "unknown",
        "reasons": result.get("reasons") or [],
        "similarity": result.get("similarity"),
        "outputRel": result.get("outputRel"),
        "rawRel": result.get("rawRel"),
    }
    with VALIDATION_LOG.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(row, ensure_ascii=False) + "\n")


def tail_validation_log(limit: int = 40) -> list[dict[str, Any]]:
    if not VALIDATION_LOG.is_file():
        return []
    lines = VALIDATION_LOG.read_text(encoding="utf-8", errors="replace").splitlines()
    out: list[dict[str, Any]] = []
    for line in lines[-limit:]:
        line = line.strip()
        if not line:
            continue
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return out
