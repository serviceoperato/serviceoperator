"""Shared validation for transcription key points (index + AI-ready markdown)."""
from __future__ import annotations

import re

_INVALID_EXACT = frozenset(
    {
        "",
        "-",
        "—",
        "–",
        "none",
        "(none)",
        "null",
        "undefined",
        "n/a",
        "na",
        "no clear task detected",
        "no clear decision detected",
        "no strong key points detected",
        "no strong key points detected.",
    }
)

_INVALID_SUBSTRINGS = (
    "no clear task detected",
    "no clear decision detected",
    "none extracted",
)


def _normalize(text: str) -> str:
    t = re.sub(r"\s*<!--[^>]+-->\s*", "", str(text or "")).strip()
    t = re.sub(r"^[-*•\[\]\s]+", "", t)
    t = re.sub(r"^\[\s*[xX ]?\s*\]\s*", "", t)
    return t.strip()


def is_valid_key_point(text: str) -> bool:
    """True when text is suitable as a key point bullet (not a placeholder)."""
    t = _normalize(text)
    if not t:
        return False
    low = t.lower()
    if low in _INVALID_EXACT:
        return False
    if low.startswith("- (none)") or low == "- none":
        return False
    for needle in _INVALID_SUBSTRINGS:
        if needle in low:
            return False
    if re.fullmatch(r"[\W\d_]+", t):
        return False
    return True


def filter_key_points(points: list[str], *, max_items: int = 3) -> list[str]:
    """Return up to max_items unique valid key points, preserving order."""
    out: list[str] = []
    seen: set[str] = set()
    for raw in points:
        t = _normalize(raw)
        if not is_valid_key_point(t):
            continue
        key = t.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(t)
        if len(out) >= max_items:
            break
    return out
