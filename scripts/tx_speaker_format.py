"""Speaker-first line formatting for transcriptions admin (index + display)."""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

_SPEAKER_ALREADY = re.compile(
    r"^([\wÀ-ÿ][\wÀ-ÿ\s.'-]{0,48})\s*:\s+",
    re.UNICODE,
)

_SPEECH_VERB = (
    r"(?:ha\s+detto(?:\s+che)?|ha\s+chiesto|ha\s+deciso|ha\s+promesso|ha\s+richiesto|"
    r"ha\s+confermato|ha\s+spiegato|ha\s+affermato|ha\s+sostenuto|ha\s+proposto|"
    r"hanno\s+discusso|hanno\s+deciso|chiede|dice|disse|afferma|sostiene|vuole|vogliono)"
)

_ROLE_MAP = {
    "padre": "Padre",
    "papa": "Padre",
    "papà": "Padre",
    "madre": "Madre",
    "mamma": "Mamma",
    "psicologa": "Psicologa",
    "psicologo": "Psicologo",
    "nonno": "Nonno",
    "nonna": "Nonna",
}

_NAME_TOKEN = r"[A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ'’]+(?:\s+[A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ'’]+)?"

_PATTERNS: list[tuple[re.Pattern[str], int]] = [
    (
        re.compile(
            rf"^(?:[Hh]a\s+detto|ha\s+detto)\s+({_NAME_TOKEN})\s+che\s+",
            re.UNICODE,
        ),
        1,
    ),
    (
        re.compile(
            rf"^(?:[Ll]a\s+|[Ii]l\s+|[Ll]o\s+|[Ii]\s+|[Gg]li\s+|[Ll]e\s+)?(padre|madre|mamma|papà|papa|psicologa|psicologo|nonno|nonna)\s+{_SPEECH_VERB}\s+",
            re.UNICODE | re.I,
        ),
        1,
    ),
    (
        re.compile(
            rf"^(?:[Tt]ua\s+|[Ss]ua\s+)?(madre|padre|mamma|papà)\s+{_SPEECH_VERB}\s+",
            re.UNICODE | re.I,
        ),
        1,
    ),
    (
        re.compile(
            rf"^({_NAME_TOKEN})\s+e\s+({_NAME_TOKEN})\s+{_SPEECH_VERB}\s+",
            re.UNICODE | re.I,
        ),
        2,
    ),
    (
        re.compile(
            rf"^({_NAME_TOKEN})\s+{_SPEECH_VERB}\s+",
            re.UNICODE | re.I,
        ),
        1,
    ),
]

_LEADING_SPEECH_TRIM = re.compile(
    rf"^(?:{_SPEECH_VERB})\s+(?:che\s+)?",
    re.UNICODE | re.I,
)

_OWNER_SUFFIX = re.compile(r"\s*\|\s*owner:\s*.+$", re.I)


def _strip_owner_suffix(text: str) -> str:
    return _OWNER_SUFFIX.sub("", text).strip()


def _normalize_name_token(raw: str, known: list[str]) -> str:
    token = raw.strip()
    if not token:
        return token
    low = token.lower()
    if low in _ROLE_MAP:
        return _ROLE_MAP[low]
    for person in known:
        if person.lower() == low or person.lower().startswith(low + " "):
            return person.split()[0] if " " not in person else person
    return token[0].upper() + token[1:] if token else token


def _name_allowed(name: str, known: list[str]) -> bool:
    if not name or len(name) < 2:
        return False
    if name.lower() in _ROLE_MAP or name in _ROLE_MAP.values():
        return True
    if not known:
        return bool(re.match(r"^[A-ZÀ-ÖØ-Ý]", name))
    low = name.lower()
    return any(
        low == p.lower() or low == p.split()[0].lower() or p.lower().startswith(low + " ")
        for p in known
    )


def _already_formatted(text: str) -> bool:
    return bool(_SPEAKER_ALREADY.match(text))


def _trim_speech_framing(body: str) -> str:
    out = body.strip()
    for _ in range(2):
        trimmed = _LEADING_SPEECH_TRIM.sub("", out, count=1).strip()
        if trimmed == out:
            break
        out = trimmed
    return out


def extract_known_people(item: dict[str, Any] | None) -> list[str]:
    if not item:
        return []
    seen: set[str] = set()
    out: list[str] = []

    def add(val: Any) -> None:
        if val is None:
            return
        if isinstance(val, list):
            for v in val:
                add(v)
            return
        if isinstance(val, dict):
            for key in ("name", "speaker", "label"):
                if val.get(key):
                    add(val[key])
            return
        text = str(val).strip()
        if not text or len(text) < 2:
            return
        if re.search(r"^(owner\s+)?to\s+confirm$|^unknown$", text, re.I):
            return
        key = text.lower()
        if key in seen:
            return
        seen.add(key)
        out.append(text)

    for field in (
        "owner",
        "assignedTo",
        "assignee",
        "madeBy",
        "decidedBy",
        "affectedBy",
        "speaker",
        "organizer",
    ):
        if item.get(field) is not None:
            add(item[field])
    for field in ("speakers", "participants", "people", "attendees", "names"):
        if item.get(field) is not None:
            add(item[field])
    ex = item.get("extracted_items") or item.get("extractedItems") or {}
    if isinstance(ex, dict):
        for field in ("owner", "speakers", "people", "participants"):
            if ex.get(field) is not None:
                add(ex[field])
    audio = item.get("source_audio") or item.get("sourceAudio") or ""
    if audio:
        stem = Path(str(audio)).stem
        if stem and not re.search(r"^voice[_\s]?\d", stem, re.I):
            add(stem.split()[0])
    return out


def format_speaker_line(text: str, known_people: list[str] | None = None) -> str:
    """Return plain text ``Name: content`` when a speaker is detected."""
    if not text:
        return text or ""
    known = list(known_people or [])
    raw = _strip_owner_suffix(str(text).strip())
    if not raw:
        return raw
    lead = _SPEAKER_ALREADY.match(raw)
    if lead:
        names = lead.group(1).strip()
        body = _trim_speech_framing(raw[lead.end() :])
        return f"{names}: {body}" if body else raw

    for pattern, group_count in _PATTERNS:
        m = pattern.match(raw)
        if not m:
            continue
        if group_count == 2:
            n1 = _normalize_name_token(m.group(1), known)
            n2 = _normalize_name_token(m.group(2), known)
            if not (_name_allowed(n1, known) and _name_allowed(n2, known)):
                continue
            names = f"{n1} / {n2}"
            body = raw[m.end() :]
        else:
            g1 = m.group(1)
            names = _normalize_name_token(g1, known)
            if not _name_allowed(names, known):
                continue
            body = raw[m.end() :]
        body = _trim_speech_framing(body)
        if not body:
            return raw
        return f"{names}: {body}"

    return raw


def format_string_list(lines: list[str] | None, known: list[str]) -> list[str]:
    if not lines:
        return []
    return [format_speaker_line(line, known) for line in lines]


_LIST_KEYS = (
    "decisions",
    "tasks",
    "open_points",
    "openPoints",
    "next_steps",
    "nextSteps",
    "important_points",
    "importantPoints",
    "possible_actions",
    "possibleActions",
    "calendar_events",
    "calendarEvents",
    "blockers",
    "bullets",
)

_SCALAR_KEYS = ("summary", "preview", "description", "notes", "decisionText", "issue")


def apply_speaker_format_to_item(item: dict[str, Any]) -> dict[str, Any]:
    if not item:
        return item
    known = extract_known_people(item)
    for key in _SCALAR_KEYS:
        if isinstance(item.get(key), str):
            item[key] = format_speaker_line(item[key], known)
    for key in _LIST_KEYS:
        if isinstance(item.get(key), list):
            item[key] = format_string_list(item[key], known)
    ex = item.get("extracted_items")
    if isinstance(ex, dict):
        for key, val in list(ex.items()):
            if isinstance(val, list) and all(isinstance(x, str) for x in val):
                ex[key] = format_string_list(val, known)
    return item
