"""
Rule-based signals + optional LLM pain clustering → analysis.json.
Simplified first pass: signals from reviews + placeholders for website_signal;
revenue formula per BUILD; top_3_fixes from catalog.
"""
from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")

MONTHS_FALLBACK = 24
PATIENT_TO_REVIEW = 20
TICKETS = {"dental": 1800, "aesthetic": 2400, "ivf": 6500, "mixed": 2000}
LEAKAGE_FACTORS = {
    "no_booking_form_on_site": 0.08,
    "no_whatsapp": 0.06,
    "no_language_switcher": 0.05,
    "rating_gap_high": 0.07,
    "recent_negative_flag": 0.04,
}
CAP_MONTHLY = 30_000

FIX_CATALOG = [
    ("wa_concierge", "24/7 multilingual WhatsApp concierge"),
    ("lang_intake", "Multilingual patient intake form"),
    ("review_drafts", "AI-drafted review replies in each patient's language"),
    ("booking_form", "Online booking + deposit capture"),
    ("quote_engine", "Treatment quote calculator with auto follow-up"),
    ("followup_seq", "Automated post-treatment follow-up sequence"),
    ("lead_radar", "Lead-leakage radar across Meta, Google, IG DMs"),
]


def months_since_first_review(_c: dict) -> int:
    # Without full review history dates, use conservative fallback.
    return MONTHS_FALLBACK


def scan_website(url: str) -> dict:
    if not url or not url.startswith("http"):
        return {
            "has_booking_form": False,
            "has_whatsapp": False,
            "lang_switcher": False,
            "https_ok": False,
            "html_kb": 0,
        }
    try:
        r = requests.get(url, timeout=5, headers={"User-Agent": "ServiceOperaClinicAudit/1.0"})
        html = r.text if r.ok else ""
        kb = max(0, len(html.encode("utf-8")) // 1024)
        low = html.lower()
        has_form = bool(re.search(r"<form[\s>]", low, re.I))
        has_wa = "wa.me/" in low or "whatsapp" in low
        lang_sw = bool(
            re.search(r'lang=["\']?(ru|zh|de|ar|th)["\']?', low, re.I)
        ) or "language" in low and "switch" in low
        parsed = urlparse(url)
        https_ok = parsed.scheme == "https" and r.ok
        return {
            "has_booking_form": has_form,
            "has_whatsapp": has_wa,
            "lang_switcher": lang_sw,
            "https_ok": https_ok,
            "html_kb": kb,
        }
    except OSError:
        return {
            "has_booking_form": False,
            "has_whatsapp": False,
            "lang_switcher": False,
            "https_ok": False,
            "html_kb": 0,
        }


def neg_recent(reviews: list[dict]) -> bool:
    now = datetime.now(timezone.utc)
    for rev in reviews:
        if (rev.get("rating") or 5) > 3:
            continue
        pt = rev.get("publishTime")
        if not pt:
            continue
        try:
            # ISO8601 from API
            t = datetime.fromisoformat(pt.replace("Z", "+00:00"))
            if (now - t).days <= 90:
                return True
        except ValueError:
            continue
    return False


def analyze_clinic(c: dict) -> dict:
    rating = float(c["rating"]) if c.get("rating") is not None else 4.5
    review_count = int(c.get("review_count") or 0)
    rating_gap = max(0.0, 5.0 - rating)

    if review_count < 50:
        tier = "low"
    elif review_count < 200:
        tier = "medium"
    elif review_count < 800:
        tier = "high"
    else:
        tier = "flagship"

    reviews = c.get("reviews_sample") or []
    neg_count = sum(1 for r in reviews if (r.get("rating") or 5) <= 3)
    langs = c.get("review_languages") or []
    n_lang = len(langs)

    ws = scan_website(c.get("website") or "")

    months = months_since_first_review(c)
    monthly_patients = max(1, int((review_count / max(months, 12)) * PATIENT_TO_REVIEW)))
    vertical = c.get("vertical") or "mixed"
    ticket = TICKETS.get(vertical, TICKETS["mixed"])

    factors: list[str] = []
    leak_sum = 0.0
    if not ws["has_booking_form"]:
        factors.append("no_booking_form_on_site")
        leak_sum += LEAKAGE_FACTORS["no_booking_form_on_site"]
    if not ws["has_whatsapp"]:
        factors.append("no_whatsapp")
        leak_sum += LEAKAGE_FACTORS["no_whatsapp"]
    if not ws["lang_switcher"]:
        factors.append("no_language_switcher")
        leak_sum += LEAKAGE_FACTORS["no_language_switcher"]
    if rating_gap >= 0.6:
        factors.append("rating_gap_high")
        leak_sum += LEAKAGE_FACTORS["rating_gap_high"]
    recent_neg = neg_recent(reviews)
    if recent_neg:
        factors.append("recent_negative_flag")
        leak_sum += LEAKAGE_FACTORS["recent_negative_flag"]

    monthly_leak = min(CAP_MONTHLY, monthly_patients * ticket * leak_sum)

    # top_3_fixes triggers (simplified vs BUILD table)
    triggers: dict[str, bool] = {}
    triggers["wa_concierge"] = not ws["has_whatsapp"] or n_lang >= 3
    triggers["lang_intake"] = (not ws["lang_switcher"]) and n_lang >= 2
    triggers["review_drafts"] = review_count >= 50
    triggers["booking_form"] = not ws["has_booking_form"]
    triggers["quote_engine"] = vertical in ("aesthetic", "dental", "ivf")
    triggers["followup_seq"] = recent_neg
    triggers["lead_radar"] = review_count >= 100

    picked: list[str] = []
    for fid, _ in FIX_CATALOG:
        if triggers.get(fid) and fid not in picked:
            picked.append(fid)
        if len(picked) >= 3:
            break

    signals = {
        "rating_gap": round(rating_gap, 2),
        "volume_tier": tier,
        "review_response_rate_estimate": None,
        "languages_seen": n_lang,
        "negative_review_count": neg_count,
        "recent_negative_flag": recent_neg,
        "website_signal": ws,
        "pain_themes": [],
    }
    estimates = {
        "monthly_patients": monthly_patients,
        "avg_ticket_eur": ticket,
        "monthly_leakage_eur": int(round(monthly_leak)),
        "leakage_factors_present": factors,
    }
    out = {**c, "signals": signals, "estimates": estimates, "top_3_fixes": picked}
    return out


def main() -> None:
    src = ROOT / "enriched.json"
    if not src.is_file():
        print(f"Missing {src}. Run 02_enrich_reviews.py first.", file=sys.stderr)
        sys.exit(1)

    clinics = json.loads(src.read_text(encoding="utf-8"))
    analysis = [analyze_clinic(c) for c in clinics]

    # TODO: optional global LLM batch for pain_themes_global — omitted to avoid accidental spend.

    out = ROOT / "analysis.json"
    out.write_text(json.dumps(analysis, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {out} ({len(analysis)} clinics)")


if __name__ == "__main__":
    main()
