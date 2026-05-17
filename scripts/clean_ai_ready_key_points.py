#!/usr/bin/env python3
"""Remove invalid bullets from Top 3 Key Points in grouped AI-ready markdown."""
from __future__ import annotations

import re
import sys
from pathlib import Path

_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from key_point_validation import filter_key_points, is_valid_key_point  # noqa: E402

REPO = _SCRIPTS.parent
AI_READY = REPO / "content" / "ai-ready-transcriptions"
SECTION_RE = re.compile(
    r"(## Top 3 Key Points\s*\n)(.*?)(?=\n## |\Z)",
    re.IGNORECASE | re.DOTALL,
)
BULLET_RE = re.compile(r"^\s*[-*]\s+(.*)$", re.MULTILINE)


def bullets_from_section(body: str) -> list[str]:
    return [m.group(1).strip() for m in BULLET_RE.finditer(body) if m.group(1).strip()]


def section_body_from_points(points: list[str]) -> str:
    if not points:
        return ""
    return "\n".join(f"- {p}" for p in points) + "\n"


def clean_file(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    match = SECTION_RE.search(text)
    if not match:
        return False
    header, body = match.group(1), match.group(2)
    raw_bullets = bullets_from_section(body)
    if not any(not is_valid_key_point(b) for b in raw_bullets):
        return False
    cleaned = filter_key_points(raw_bullets, max_items=3)
    new_body = section_body_from_points(cleaned)
    replacement = header + (new_body if new_body else "\n")
    new_text = text[: match.start()] + replacement + text[match.end() :]
    if new_text != text:
        path.write_text(new_text, encoding="utf-8")
        return True
    return False


def main() -> None:
    changed = 0
    for path in sorted(AI_READY.glob("*.md")):
        if clean_file(path):
            changed += 1
            print(f"OK {path.name}")
    print(f"Done: {changed} file(s) updated")


if __name__ == "__main__":
    main()
