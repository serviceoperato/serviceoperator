"""
Roll analysis.json into anonymized ../clinics/_data.json + local clinic_index.csv
"""
from __future__ import annotations

import csv
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent

FIX_LABELS = dict(
    [
        ("wa_concierge", "24/7 multilingual WhatsApp concierge"),
        ("lang_intake", "Multilingual patient intake form"),
        ("review_drafts", "AI-drafted review replies"),
        ("booking_form", "Online booking + deposit capture"),
        ("quote_engine", "Treatment quote calculator with auto follow-up"),
        ("followup_seq", "Automated follow-up sequence"),
        ("lead_radar", "Lead-leakage radar across Meta, Google, IG DMs"),
    ]
)


def pct(n: int, d: int) -> int:
    if d <= 0:
        return 0
    return int(round(100 * n / d))


def bucketize(values: list[int], edges: list[int]) -> list[int]:
    """Histogram: len(edges) buckets, last is >= edges[-1]."""
    counts = [0] * len(edges)
    for v in values:
        placed = False
        for i in range(len(edges) - 1):
            lo, hi = edges[i], edges[i + 1]
            if lo <= v < hi:
                counts[i] += 1
                placed = True
                break
        if not placed:
            counts[-1] += 1
    return counts


def email_guess(website: str) -> str:
    if not website:
        return ""
    dom = website.replace("https://", "").replace("http://", "").split("/")[0]
    if dom.startswith("www."):
        dom = dom[4:]
    return f"info@{dom}" if dom else ""


def main() -> None:
    src = ROOT / "analysis.json"
    if not src.is_file():
        print(f"Missing {src}. Run 03_analyze_pains.py first.", file=sys.stderr)
        sys.exit(1)

    rows = json.loads(src.read_text(encoding="utf-8"))
    n = len(rows)
    if n == 0:
        print("Empty analysis.json", file=sys.stderr)
        sys.exit(1)

    verticals: Counter[str] = Counter()
    no_book = no_wa = no_lang = recent_neg = 0
    lang_sum = 0
    leaks: list[int] = []
    fix_need: Counter[str] = Counter()
    neg_snippets = 0

    for r in rows:
        verticals[r.get("vertical") or "mixed"] += 1
        sig = r.get("signals") or {}
        ws = sig.get("website_signal") or {}
        if not ws.get("has_booking_form"):
            no_book += 1
        if not ws.get("has_whatsapp"):
            no_wa += 1
        if not ws.get("lang_switcher"):
            no_lang += 1
        if sig.get("recent_negative_flag"):
            recent_neg += 1
        lang_sum += int(sig.get("languages_seen") or 0)
        est = r.get("estimates") or {}
        leaks.append(int(est.get("monthly_leakage_eur") or 0))
        neg_snippets += int(sig.get("negative_review_count") or 0)
        for fid in r.get("top_3_fixes") or []:
            fix_need[fid] += 1

    edges = [0, 2500, 5000, 10000, 20000, 30000]
    counts = bucketize(leaks, edges)

    ranking = []
    for fid, label in FIX_LABELS.items():
        c = fix_need.get(fid, 0)
        if c:
            ranking.append({"fix_id": fid, "label": label, "clinics_who_need_this": c})
    ranking.sort(key=lambda x: -x["clinics_who_need_this"])
    ranking = ranking[:5]

    avg_leak = int(round(sum(leaks) / n)) if n else 0
    total_leak = sum(leaks)

    prev_themes: list = []
    prev_path = REPO / "clinics" / "_data.json"
    if prev_path.is_file():
        try:
            prev_themes = (json.loads(prev_path.read_text(encoding="utf-8"))).get("pain_themes_global") or []
        except json.JSONDecodeError:
            pass

    data = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sample_size": n,
        "negative_review_snippets_total": neg_snippets,
        "verticals": dict(verticals),
        "headline_stats": {
            "clinics_without_booking_form_pct": pct(no_book, n),
            "clinics_without_whatsapp_pct": pct(no_wa, n),
            "clinics_without_lang_switcher_pct": pct(no_lang, n),
            "clinics_with_recent_negative_pct": pct(recent_neg, n),
            "avg_languages_seen": round(lang_sum / n, 1) if n else 0,
            "median_review_response_rate_pct": None,
            "avg_monthly_leakage_eur": avg_leak,
            "total_monthly_leakage_eur_sample": total_leak,
        },
        "pain_themes_global": prev_themes,
        "leakage_distribution": {"buckets_eur": edges, "counts": counts},
        "fix_demand_ranking": ranking,
    }
    if not data["pain_themes_global"]:
        print(
            "WARN: pain_themes_global is empty — run LLM clustering (see BUILD) or keep prior themes in _data.json.",
            file=sys.stderr,
        )

    out_json = REPO / "clinics" / "_data.json"
    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {out_json}")

    csv_path = ROOT / "clinic_index.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(
            [
                "name",
                "vertical",
                "monthly_leakage_eur",
                "top_3_fixes_labels",
                "website",
                "maps_url",
                "phone",
                "email_guess",
            ]
        )
        for r in rows:
            est = r.get("estimates") or {}
            fixes = r.get("top_3_fixes") or []
            labels = "; ".join(FIX_LABELS.get(x, x) for x in fixes)
            w.writerow(
                [
                    r.get("name"),
                    r.get("vertical"),
                    est.get("monthly_leakage_eur"),
                    labels,
                    r.get("website"),
                    r.get("maps_url"),
                    r.get("phone"),
                    email_guess(r.get("website") or ""),
                ]
            )
    print(f"Wrote {csv_path} (gitignored prospect export)")


if __name__ == "__main__":
    main()
