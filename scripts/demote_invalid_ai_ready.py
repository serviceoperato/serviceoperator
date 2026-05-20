#!/usr/bin/env python3
"""Demote registry rows whose AI output fails publish validation (raw echo / missing structure)."""
from __future__ import annotations

import sys
from pathlib import Path

_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from voice_ai_validation import append_validation_log, validate_registry_entry  # noqa: E402
from voice_registry import (  # noqa: E402
    STATUS_NEEDS_REVIEW,
    load_registry,
    normalize_entry,
    primary_output_rel,
    save_registry,
)


def main() -> int:
    reg = load_registry()
    demoted = 0
    for key, val in list(reg.get("processed", {}).items()):
        entry = normalize_entry(key, val if isinstance(val, dict) else {})
        if not entry.get("readyForSite") or entry.get("status") != "ready_for_site":
            continue
        check = validate_registry_entry(entry)
        raw_name = Path(str(entry.get("rawTranscriptionPath") or "")).name or key
        append_validation_log(
            source="demote_invalid_ai_ready",
            filename=raw_name,
            status="needs_review" if not check.get("ok") else "ready_for_site",
            result=check,
            ai_model="audit",
        )
        if check.get("ok"):
            continue
        val = reg["processed"][key]
        if not isinstance(val, dict):
            continue
        val["readyForSite"] = False
        val["status"] = STATUS_NEEDS_REVIEW
        val["error"] = "; ".join(check.get("reasons") or ["validation failed"])
        demoted += 1
        out = primary_output_rel(entry)
        print(f"DEMOTE {raw_name} → needs_review ({out}): {val['error']}")
    if demoted:
        save_registry(reg)
    print(f"Done: {demoted} demoted")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
