"""
Google Places API (New) Text Search → clinics.json
See docs/BUILD-clinics.md for filters and schema.
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
SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
FIELD_MASK = (
    "places.id,places.displayName,places.formattedAddress,places.location,"
    "places.rating,places.userRatingCount,places.websiteUri,places.internationalPhoneNumber,"
    "places.googleMapsUri,places.primaryType,places.types,places.priceLevel,"
    "places.regularOpeningHours.weekdayDescriptions"
)

QUERIES = [
    "dental clinic Thailand",
    "aesthetic clinic Thailand",
    "cosmetic surgery Thailand",
    "dermatology clinic Thailand",
    "IVF fertility clinic Thailand",
]

QUERY_VERTICAL = {
    "dental clinic Thailand": "dental",
    "aesthetic clinic Thailand": "aesthetic",
    "cosmetic surgery Thailand": "aesthetic",
    "dermatology clinic Thailand": "mixed",
    "IVF fertility clinic Thailand": "ivf",
}

BBOX = {"lat_min": 12.85, "lat_max": 13.05, "lng_min": 100.85, "lng_max": 100.99}


def in_bbox(lat: float, lng: float) -> bool:
    return (
        BBOX["lat_min"] <= lat <= BBOX["lat_max"]
        and BBOX["lng_min"] <= lng <= BBOX["lng_max"]
    )


def pick_vertical(existing: str | None, v: str) -> str:
    if not existing:
        return v
    if existing == v:
        return v
    return "mixed"


def place_to_record(place: dict, query: str) -> dict | None:
    pid = place.get("id") or ""
    if pid.startswith("places/"):
        pid = pid.split("/", 1)[1]

    loc = place.get("location") or {}
    lat = loc.get("latitude")
    lng = loc.get("longitude")
    if lat is None or lng is None:
        return None
    if not in_bbox(float(lat), float(lng)):
        return None

    primary = (place.get("primaryType") or "").lower()
    if "hospital" in primary:
        return None

    website = place.get("websiteUri") or ""
    reviews = int(place.get("userRatingCount") or 0)
    if not website and reviews < 10:
        return None

    name_obj = place.get("displayName") or {}
    hours = place.get("regularOpeningHours") or {}
    weekday = hours.get("weekdayDescriptions") or []

    v = QUERY_VERTICAL.get(query, "mixed")

    return {
        "place_id": pid,
        "name": name_obj.get("text") or name_obj.get("languageCode") or "Unknown",
        "address": place.get("formattedAddress") or "",
        "lat": float(lat),
        "lng": float(lng),
        "rating": float(place["rating"]) if place.get("rating") is not None else None,
        "review_count": reviews,
        "website": website,
        "phone": place.get("internationalPhoneNumber") or "",
        "maps_url": place.get("googleMapsUri") or "",
        "primary_type": place.get("primaryType") or "",
        "types": list(place.get("types") or []),
        "price_level": place.get("priceLevel") or "",
        "hours": weekday,
        "discovered_via": [query],
        "vertical": v,
    }


def search_text(session: requests.Session, query: str) -> list[dict]:
    out: list[dict] = []
    page_token: str | None = None
    for _ in range(3):
        body: dict = {"textQuery": query, "languageCode": "en"}
        if page_token:
            body["pageToken"] = page_token
        r = session.post(
            SEARCH_URL,
            headers={
                "Content-Type": "application/json",
                "X-Goog-Api-Key": API_KEY or "",
                "X-Goog-FieldMask": FIELD_MASK,
            },
            json=body,
            timeout=30,
        )
        if not r.ok:
            print(f"ERROR {query}: {r.status_code} {r.text[:500]}", file=sys.stderr)
            break
        data = r.json()
        places = data.get("places") or []
        out.extend(places)
        page_token = data.get("nextPageToken")
        if not page_token:
            break
        time.sleep(2)
    return out


def main() -> None:
    if not API_KEY:
        print("Missing GOOGLE_PLACES_API_KEY. Copy .env.example to .env and add your key.", file=sys.stderr)
        sys.exit(1)

    session = requests.Session()
    by_id: dict[str, dict] = {}

    for q in QUERIES:
        places = search_text(session, q)
        print(f"{q}: {len(places)} raw results")
        for p in places:
            rec = place_to_record(p, q)
            if not rec:
                continue
            pid = rec["place_id"]
            if pid not in by_id:
                by_id[pid] = rec
            else:
                old = by_id[pid]
                old["discovered_via"] = sorted(set(old["discovered_via"] + rec["discovered_via"]))
                old["vertical"] = pick_vertical(old["vertical"], rec["vertical"])

    clinics = list(by_id.values())
    clinics.sort(key=lambda x: x["name"].lower())
    out_path = ROOT / "clinics.json"
    out_path.write_text(json.dumps(clinics, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(clinics)} clinics → {out_path}")
    if len(clinics) < 40:
        print("WARNING: under 40 clinics after filters — check API quota or bbox.", file=sys.stderr)

    pages = sum(1 for q in QUERIES for _ in [1]) * 3
    est = pages * 0.032
    print(f"Rough Text Search cost estimate: ${est:.2f} (upper bound if all pages used)")


if __name__ == "__main__":
    main()
