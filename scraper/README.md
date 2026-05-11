# Clinics scraper (Pattaya)

Python 3.11+. Produces `clinics.json` → `enriched.json` → `analysis.json` → `../clinics/_data.json` plus a local-only prospect export `clinic_index.csv` (gitignored).

## Setup

```bash
cd scraper
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
copy .env.example .env   # then paste GOOGLE_PLACES_API_KEY and OPENAI_API_KEY
```

## Run order

1. `python 01_scrape_clinics.py` — Places Text Search (5 queries), dedupe, bbox filter → `clinics.json`
2. `python 02_enrich_reviews.py` — Place Details per clinic → `enriched.json`
3. `python 03_analyze_pains.py` — signals, optional LLM clustering, leakage → `analysis.json`
4. `python 04_aggregate_demo.py` — anonymized rollup → `../clinics/_data.json` and `clinic_index.csv`

Full field definitions and formulas live in `docs/BUILD-clinics.md`.

## Costs (order of magnitude)

Text Search ~\$0.032/page; Place Details ~\$0.017 each. Expect a few dollars total for ~50 clinics plus one batched LLM call for pain themes.
