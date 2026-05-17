"""Summary length helpers for transcriptions index and AI-ready outputs."""
from __future__ import annotations

import re

DETAIL_SUMMARY_MIN_WORDS = 150
DETAIL_SUMMARY_TARGET_MAX = 220
DETAIL_SUMMARY_LONG_MAX = 250  # long meetings / WhatsApp exports
CARD_PREVIEW_MIN_WORDS = 40
CARD_PREVIEW_MAX_WORDS = 70
REGENERATE_THRESHOLD_WORDS = 140
LIMITED_CONTENT_MARKER = "Limited content available."

_WORD_RE = re.compile(r"\b\w+\b", re.UNICODE)


def word_count(text: str) -> int:
    return len(_WORD_RE.findall(text or ""))


def is_limited_content_summary(text: str) -> bool:
    return LIMITED_CONTENT_MARKER.lower() in (text or "").lower()


def is_limited_source(raw_word_count: int, summary: str | None = None) -> bool:
    """True when source is too short/noisy for a full detail summary."""
    if is_limited_content_summary(summary or ""):
        return True
    return raw_word_count < 120


def needs_summary_regeneration(
    summary: str,
    *,
    raw_word_count: int | None = None,
) -> bool:
    if not (summary or "").strip():
        return True
    if is_limited_content_summary(summary):
        return False
    wc = word_count(summary)
    if wc < REGENERATE_THRESHOLD_WORDS:
        if raw_word_count is not None and raw_word_count < 120:
            return False
        return True
    return False


def truncate_words(text: str, max_words: int, *, ellipsis: bool = True) -> str:
    words = _WORD_RE.findall((text or "").strip())
    if not words:
        return ""
    if len(words) <= max_words:
        return " ".join(words)
    out = " ".join(words[:max_words])
    return out + "…" if ellipsis else out


def card_preview_of(text: str, max_words: int = CARD_PREVIEW_MAX_WORDS) -> str:
    """40–70 word card/list preview from full summary text."""
    t = re.sub(r"\s+", " ", (text or "").strip())
    if not t:
        return ""
    wc = word_count(t)
    if wc <= max_words:
        if wc >= CARD_PREVIEW_MIN_WORDS or wc < 20:
            return t
        return t
    return truncate_words(t, max_words)


def detail_summary_cap(*, is_long_source: bool = False) -> int:
    return DETAIL_SUMMARY_LONG_MAX if is_long_source else DETAIL_SUMMARY_TARGET_MAX


def is_long_export_source(source_name: str | None, main_category: str | None = None) -> bool:
    s = (source_name or "").lower()
    cat = (main_category or "").lower()
    if "whatsapp" in s or "chat history" in s:
        return True
    if cat in ("meeting", "meetings") and word_count(s) > 0:
        return False
    if cat == "conversation":
        return "chat" in s or "whatsapp" in s
    return False
