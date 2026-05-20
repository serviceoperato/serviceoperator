"""
Semantic icon concept resolver for transcription index items.

Assigns icon_concept, icon_keywords, and icon_shape_signature so cards on
/admin/transcriptions get distinct pictogram silhouettes (not color-only variants).
"""
from __future__ import annotations

import re
from typing import Any

# Each concept has a unique shape_signature used for dedup across visible cards.
ICON_CONCEPTS: list[dict[str, Any]] = [
    {
        "id": "empty-transcript",
        "label": "Empty transcript",
        "shape_signature": "blank-doc-warning-dot",
        "keywords": [
            "trascrizione vuota",
            "empty transcript",
            "no speech",
            "silenzio totale",
            "blank transcript",
        ],
        "priority": 100,
    },
    {
        "id": "unclear-audio",
        "label": "Unclear audio",
        "shape_signature": "broken-wave-question",
        "keywords": [
            "inaudible",
            "unintelligible",
            "garbled",
            "unclear audio",
            "non intellegibile",
            "non decodificabile",
            "audio non decodificabile",
            "registrazione non intellegibile",
        ],
        "priority": 99,
    },
    {
        "id": "political-debate",
        "label": "Political debate",
        "shape_signature": "podium-bubbles-scale",
        "keywords": [
            "politic",
            "debate",
            "dibattit",
            "congresso",
            "parlament",
            "elezioni",
            "contraddittorio",
            "destra",
            "sinistra",
            "par condicio",
            "vaccini",
            "governo",
            "senato",
        ],
    },
    {
        "id": "knee-injection",
        "label": "Knee medical injection",
        "shape_signature": "knee-joint-syringe",
        "keywords": [
            "condropatia",
            "infiltrazione",
            "acido ialuronico",
            "syringe",
            "injection",
            "ginocchio",
            "knee",
            "articol",
            "ortoped",
            "cartilag",
        ],
    },
    {
        "id": "youtube-schedule",
        "label": "YouTube planning",
        "shape_signature": "play-button-calendar",
        "keywords": [
            "youtube",
            "slot settimanale",
            "canale",
            "upload schedule",
            "content calendar",
            "video plan",
            "riprese canale",
            "tanti soldi",
        ],
    },
    {
        "id": "thaifans-community",
        "label": "ThaiFans business community",
        "shape_signature": "users-pin-chat",
        "keywords": [
            "thaifans",
            "thai fans",
            "google meet",
            "beta tester",
            "community business",
            "whatsapp",
            "chat with",
            "italiani a patta",
        ],
    },
    {
        "id": "shared-house-finance",
        "label": "Shared house & money",
        "shape_signature": "house-split-document",
        "keywords": [
            "casa condivisa",
            "shared house",
            "mutuo",
            "mortgage",
            "affitto",
            "condominio",
            "spese casa",
            "split rent",
            "coinquil",
        ],
    },
    {
        "id": "family-inheritance-money",
        "label": "Family & inheritance",
        "shape_signature": "family-tree-coins",
        "keywords": [
            "eredità",
            "eredit",
            "inheritance",
            "famiglia",
            "family",
            "figli",
            "genitori",
            "soldi senza condizioni",
        ],
    },
    {
        "id": "crypto-finance",
        "label": "Crypto & finance",
        "shape_signature": "bitcoin-chart-wallet",
        "keywords": [
            "bitcoin",
            "crypto",
            "borsa",
            "investimento",
            "finance",
            "soldi",
            "stock",
            "azioni",
        ],
    },
    {
        "id": "water-park-leisure",
        "label": "Water park outing",
        "shape_signature": "pool-slide-sun",
        "keywords": [
            "parco acquatico",
            "water park",
            "piscina",
            "pool",
            "vacation",
            "vacanza",
            "weekend",
        ],
    },
    {
        "id": "video-editing",
        "label": "Video editing",
        "shape_signature": "film-strip-scissors",
        "keywords": [
            "clip video",
            "montaggio",
            "editing",
            "registrazioni insieme",
            "timeline",
            "ffmpeg",
        ],
    },
    {
        "id": "recording-test",
        "label": "Recording test",
        "shape_signature": "mic-waveform-check",
        "keywords": [
            "prova registrazione",
            "recording test",
            "test audio",
            "testo",
            "audio/video",
        ],
    },
    {
        "id": "memory-recall",
        "label": "Memory recall",
        "shape_signature": "brain-question-lightbulb",
        "keywords": [
            "ricorda",
            "ricord",
            "memory",
            "cosa si ricorda",
            "promemoria",
            "reminder",
        ],
    },
    {
        "id": "spanish-language",
        "label": "Spanish phrase",
        "shape_signature": "globe-speech-es",
        "keywords": ["spagnolo", "spanish", "español", "limpio", "frase in"],
    },
    {
        "id": "book-writing",
        "label": "Book writing",
        "shape_signature": "open-book-quill",
        "keywords": [
            "libro",
            "scrittura",
            "writing",
            "narrativa",
            "roman",
            "autore",
            "nulla è come sembra",
        ],
    },
    {
        "id": "space-science",
        "label": "Space & science",
        "shape_signature": "rocket-planet-orbit",
        "keywords": [
            "marte",
            "mars",
            "proxima",
            "quantist",
            "einstein",
            "inception",
            "spazio",
            "space",
            "fisica",
        ],
    },
    {
        "id": "school-youth-health",
        "label": "School & youth health",
        "shape_signature": "grad-cap-heart-shield",
        "keywords": [
            "scuola",
            "school",
            "minori",
            "student",
            "compiti",
            "homework",
        ],
    },
    {
        "id": "journalism-paywall",
        "label": "Journalism paywall",
        "shape_signature": "newspaper-lock-coins",
        "keywords": [
            "paywall",
            "giornalismo",
            "journalism",
            "abbonamento",
            "huffington",
            "dagospia",
            "sunto",
            "telegiornale",
            "rai play",
            "mediaset",
        ],
    },
    {
        "id": "meeting-conversation",
        "label": "Group meeting",
        "shape_signature": "roundtable-speech-arrows",
        "keywords": [
            "meeting",
            "call",
            "conversazione",
            "dialogo",
            "we can start",
            "waiting someone",
            "participants",
        ],
    },
    {
        "id": "italy-travel",
        "label": "Italy travel",
        "shape_signature": "plane-italy-pin",
        "keywords": [
            "italia",
            "italy",
            "viaggio",
            "flight",
            "aeroporto",
            "partire",
            "luglio",
        ],
    },
    {
        "id": "real-estate-property",
        "label": "Real estate",
        "shape_signature": "building-key-contract",
        "keywords": [
            "immobile",
            "property",
            "affitto",
            "rent",
            "lease",
            "ristruttur",
        ],
    },
    {
        "id": "health-clinic",
        "label": "Health clinic",
        "shape_signature": "stethoscope-cross-pill",
        "keywords": [
            "health",
            "medical",
            "doctor",
            "medico",
            "ospedale",
            "hospital",
            "clinic",
            "terapia",
        ],
    },
    {
        "id": "task-checklist",
        "label": "Tasks checklist",
        "shape_signature": "clipboard-checks-pen",
        "keywords": ["task", "todo", "checklist", "action item", "to-do"],
        "category_boost": {"tasks": 3},
    },
    {
        "id": "calendar-event",
        "label": "Calendar event",
        "shape_signature": "calendar-clock-pin",
        "keywords": ["calendar", "event", "appointment", "appuntamento", "schedule"],
        "category_boost": {"calendar": 4},
    },
    {
        "id": "project-roadmap",
        "label": "Project roadmap",
        "shape_signature": "path-milestones-flag",
        "keywords": ["project", "roadmap", "milestone", "sprint", "deliverable"],
        "category_boost": {"projects": 4},
    },
    {
        "id": "decision-balance",
        "label": "Decision",
        "shape_signature": "scales-check-cross",
        "keywords": ["decision", "decided", "approve", "reject", "verdict"],
        "category_boost": {"decisions": 4},
    },
    {
        "id": "open-question",
        "label": "Open question",
        "shape_signature": "magnifier-dotted-line",
        "keywords": ["open point", "unresolved", "unclear", "tbd", "unknown"],
        "category_boost": {"open-points": 3},
    },
    {
        "id": "legal-contract",
        "label": "Legal contract",
        "shape_signature": "scroll-signature-stamp",
        "keywords": ["legal", "contract", "contratto", "lawyer", "avvocato", "notary"],
    },
    {
        "id": "voice-note-generic",
        "label": "Voice note",
        "shape_signature": "mic-note-lines",
        "keywords": ["voice note", "memo", "nota vocale"],
    },
]

FALLBACK_BY_CATEGORY: dict[str, str] = {
    "meetings": "meeting-conversation",
    "notes": "voice-note-generic",
    "tasks": "task-checklist",
    "calendar": "calendar-event",
    "projects": "project-roadmap",
    "decisions": "decision-balance",
    "open-points": "open-question",
}

_CONCEPT_BY_ID = {c["id"]: c for c in ICON_CONCEPTS}


def _normalize_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip().lower()


def item_visual_corpus(item: dict[str, Any]) -> str:
    parts: list[str] = []
    for key in (
        "title",
        "summary",
        "preview",
        "cardSummary",
        "description",
        "path",
        "filepath",
        "project",
        "issue",
        "taskText",
        "decisionText",
    ):
        val = item.get(key)
        if val:
            parts.append(_normalize_text(val))
    tags = item.get("tags")
    if isinstance(tags, list):
        parts.extend(_normalize_text(t) for t in tags if t)
    elif tags:
        parts.append(_normalize_text(tags))
    for key in (
        "bullets",
        "importantPoints",
        "decisions",
        "tasks",
        "openPoints",
        "nextSteps",
        "possibleActions",
    ):
        val = item.get(key)
        if isinstance(val, list):
            parts.extend(_normalize_text(v) for v in val if v)
        elif val:
            parts.append(_normalize_text(val))
    extracted = item.get("extracted_items")
    if isinstance(extracted, dict):
        for val in extracted.values():
            if isinstance(val, list):
                parts.extend(_normalize_text(v) for v in val if v)
            elif val:
                parts.append(_normalize_text(val))
    raw_sections = item.get("raw_sections")
    if isinstance(raw_sections, dict):
        for val in raw_sections.values():
            if val:
                parts.append(_normalize_text(val))
    return " ".join(p for p in parts if p)


def is_empty_transcript_item(item: dict[str, Any]) -> bool:
    corpus = item_visual_corpus(item)
    title = _normalize_text(item.get("title"))
    if "trascrizione vuota" in title or "empty transcript" in title:
        return True
    summary = _normalize_text(item.get("summary") or item.get("preview") or "")
    if not summary or len(summary) < 12:
        if "vuota" in title or "empty" in title:
            return True
    if re.search(r"\b(empty|vuota|no speech|silenzio)\b", corpus):
        return True
    return False


def is_unclear_audio_item(item: dict[str, Any]) -> bool:
    corpus = item_visual_corpus(item)
    if "| confidence: low" in corpus:
        return True
    if re.search(r"\b(inaudible|unintelligible|garbled|unclear audio|non intellegibile|non decodificabile)\b", corpus):
        return True
    title = _normalize_text(item.get("title"))
    if re.search(r"(non intellegibile|non decodificabile|unclear)", title):
        return True
    if len(corpus) < 100 and not item.get("summary") and not item.get("title"):
        return True
    return False


def _keyword_hits(text: str, keywords: list[str]) -> list[str]:
    hits: list[str] = []
    for kw in keywords:
        token = _normalize_text(kw)
        if token and token in text:
            hits.append(kw)
    return hits


def score_concept(concept: dict[str, Any], item: dict[str, Any], corpus: str) -> tuple[int, list[str]]:
    hits = _keyword_hits(corpus, concept.get("keywords") or [])
    score = len(hits) * 2
    priority = int(concept.get("priority") or 0)
    score += priority
    cat = _normalize_text(item.get("category") or "notes")
    boost = (concept.get("category_boost") or {}).get(cat)
    if boost:
        score += int(boost)
    project = _normalize_text(item.get("project") or "")
    if project and project in corpus and concept["id"] in ("thaifans-community",):
        score += 3
    return score, hits


def rank_concepts_for_item(item: dict[str, Any]) -> list[tuple[dict[str, Any], int, list[str]]]:
    if is_empty_transcript_item(item):
        c = _CONCEPT_BY_ID["empty-transcript"]
        return [(c, 1000, ["empty transcript"])]
    if is_unclear_audio_item(item):
        c = _CONCEPT_BY_ID["unclear-audio"]
        return [(c, 999, ["unclear audio"])]

    corpus = item_visual_corpus(item)
    ranked: list[tuple[dict[str, Any], int, list[str]]] = []
    for concept in ICON_CONCEPTS:
        if concept["id"] in ("empty-transcript", "unclear-audio"):
            continue
        score, hits = score_concept(concept, item, corpus)
        if score > 0:
            ranked.append((concept, score, hits))
    ranked.sort(key=lambda x: (-x[1], x[0]["id"]))
    if ranked:
        return ranked

    cat = _normalize_text(item.get("category") or "notes")
    fallback_id = FALLBACK_BY_CATEGORY.get(cat, "voice-note-generic")
    fb = _CONCEPT_BY_ID[fallback_id]
    return [(fb, 1, [cat or "fallback"])]


def signatures_too_similar(a: str, b: str) -> bool:
    if not a or not b:
        return False
    if a == b:
        return True
    ta = set(a.split("-"))
    tb = set(b.split("-"))
    if not ta or not tb:
        return False
    overlap = len(ta & tb)
    union = len(ta | tb)
    return overlap / union >= 0.55


def resolve_icon_concept(item: dict[str, Any], used_signatures: set[str] | None = None) -> dict[str, Any]:
    used = used_signatures or set()
    ranked = rank_concepts_for_item(item)
    chosen = ranked[0]
    for concept, score, hits in ranked:
        sig = concept["shape_signature"]
        conflict = any(signatures_too_similar(sig, u) for u in used)
        if not conflict:
            chosen = (concept, score, hits)
            break
    concept, _score, hits = chosen
    sig = concept["shape_signature"]
    used.add(sig)
    return {
        "icon_concept": concept["id"],
        "icon_keywords": hits[:8],
        "icon_shape_signature": sig,
        "icon_concept_label": concept.get("label") or concept["id"],
    }


def apply_icon_concept_to_item(item: dict[str, Any], used_signatures: set[str] | None = None) -> None:
    if not isinstance(item, dict):
        return
    fields = resolve_icon_concept(item, used_signatures)
    item.update(fields)


def assign_icon_concepts_for_items(items: list[dict[str, Any]]) -> None:
    used: set[str] = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        apply_icon_concept_to_item(item, used)


def assign_icon_concepts_tree(source_entries: list[dict[str, Any]]) -> None:
    """Assign icons across all cards; parent source cards dedupe against siblings."""
    used: set[str] = set()
    for entry in source_entries:
        apply_icon_concept_to_item(entry, used)
        for child in entry.get("sourceEntries") or []:
            if isinstance(child, dict):
                apply_icon_concept_to_item(child, used)
    for entry in source_entries:
        for child in entry.get("sourceEntries") or []:
            if isinstance(child, dict) and child.get("icon_concept"):
                entry.setdefault("icon_concept", child["icon_concept"])
                entry.setdefault("icon_keywords", child.get("icon_keywords"))
                entry.setdefault("icon_shape_signature", child.get("icon_shape_signature"))
