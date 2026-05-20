#!/usr/bin/env python3
"""Reprocess one raw transcription (grouped Composer data or phase2 heuristic)."""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

_SCRIPTS = Path(__file__).resolve().parent
REPO = _SCRIPTS.parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from voice_registry import STATUS_AI_PENDING, load_registry, save_registry, upsert_entry  # noqa: E402

PROCESSED_HDR = "<!-- PROCESSED:"


def clear_processed_header(md_path: Path) -> None:
    text = md_path.read_text(encoding="utf-8")
    lines = text.splitlines()
    if lines and lines[0].strip().startswith(PROCESSED_HDR):
        md_path.write_text("\n".join(lines[1:]).lstrip("\n") + "\n", encoding="utf-8")


def reset_registry(raw_rel: str) -> None:
    reg = load_registry()
    from voice_registry import find_entry_by_raw_path

    match = find_entry_by_raw_path(reg, raw_rel)
    if match:
        upsert_entry(
            reg,
            match[0],
            status=STATUS_AI_PENDING,
            readyForSite=False,
            error="queued for reprocess",
        )
        save_registry(reg)


def main() -> int:
    parser = argparse.ArgumentParser(description="Reprocess a raw transcription file")
    parser.add_argument("raw", help="Path like content/transcriptions/0519.md")
    parser.add_argument(
        "--data",
        type=Path,
        help="Composer grouped JSON batch (array) for apply_grouped_ai_ready.py",
    )
    parser.add_argument("--skip-index", action="store_true")
    args = parser.parse_args()

    raw_rel = args.raw.replace("\\", "/")
    if not raw_rel.startswith("content/transcriptions/"):
        raw_rel = f"content/transcriptions/{Path(raw_rel).name}"
    raw_path = REPO / raw_rel
    if not raw_path.is_file():
        print(f"Missing {raw_path}", file=sys.stderr)
        return 1

    clear_processed_header(raw_path)
    reset_registry(raw_rel)

    if args.data and args.data.is_file():
        cmd = [
            sys.executable,
            str(_SCRIPTS / "apply_grouped_ai_ready.py"),
            "--data",
            str(args.data),
        ]
    else:
        cmd = [sys.executable, str(_SCRIPTS / "process_daily_voice_phase2.py"), str(raw_path)]

    print("RUN", " ".join(cmd))
    proc = subprocess.run(cmd, cwd=REPO)
    if proc.returncode != 0:
        return proc.returncode

    demote = subprocess.run([sys.executable, str(_SCRIPTS / "demote_invalid_ai_ready.py")], cwd=REPO)
    if demote.returncode != 0:
        return demote.returncode

    if not args.skip_index:
        idx = subprocess.run([sys.executable, str(_SCRIPTS / "index_transcriptions.py")], cwd=REPO)
        if idx.returncode != 0:
            return idx.returncode

    print(json.dumps({"ok": True, "raw": raw_rel}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
