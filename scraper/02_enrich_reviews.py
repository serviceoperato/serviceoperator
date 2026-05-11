"""
Place Details (New) per clinic → enriched.json (adds review snippets, editorial summary).
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")

API_KEY = os.environ.get("GOOGLE_PLACES_API_KEY")
DETAILS_MASK = "id,reviews,editorialSummary"


def main() -> None:
    if not API_KEY:
        print("Missing GOOGLE_PLACES_API_KEY", file=sys.stderr)
        sys.exit(1)

    src = ROOT / "clinics.json"
    if not src.is_file():
        print(f"Missing {src}. Run 01_scrape_clinics.py first.", file=sys.stderr)
        sys.exit(1)

    clinics = json.loads(src.read_text(encoding="utf-8"))
    session = requests.Session()

    for i, c in enumerate(clinics):
        pid = c["place_id"]
        url = f"https://places.googleapis.com/v1/places/{pid}"
        r = session.get(
            url,
            headers={
                "X-Goog-Api-Key": API_KEY,
                "X-Goog-FieldMask": DETAILS_MASK,
            },
            timeout=30,
        )
        if not r.ok:
            print(f"WARN {c.get('name')}: {r.status_code} {r.text[:200]}", file=sys.stderr)
            c["reviews_sample"] = []
            c["review_languages"] = []
            c["editorial_summary"] = None
            continue

        data = r.json()
        reviews = data.get("reviews") or []
        sample = []
        langs: set[str] = set()
        for rev in reviews[:5]:
            text = (rev.get("text") or {}).get("text") or ""
            orig = rev.get("originalText") or {}
            otext = orig.get("text") or text
            ocode = orig.get("languageCode") or ""
            if ocode:
                langs.add(ocode)
            sample.append(
                {
                    "rating": rev.get("rating"),
                    "text": text,
                    "originalText": {"text": otext, "languageCode": ocode},
                    "publishTime": rev.get("publishTime"),
                    "author": (rev.get("authorAttribution") or {}).get("displayName") or "",
                }
            )
        c["reviews_sample"] = sample
        c["review_languages"] = sorted(langs)
        es = data.get("editorialSummary") or {}
        c["editorial_summary"] = es.get("text") if es else None

        if i and i % 10 == 0:
            time.sleep(0.2)

    out = ROOT / "enriched.json"
    out.write_text(json.dumps(clinics, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
