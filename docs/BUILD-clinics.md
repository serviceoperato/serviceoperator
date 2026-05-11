# Service Opera — Clinics Vertical Build Spec

**Target executor:** Cursor AI (Composer / Agent mode with terminal + GitHub access)
**Project root:** existing repo `serviceopera-site` (already deployed to `https://serviceopera.to` via Netlify, `main` branch auto-deploys).
**Owner:** Jack — `jack@serviceopera.to`
**Goal of this build:** scrape ~50 medical clinics in Thailand (dental, aesthetic, IVF), run a pain-point analysis on each using only publicly observable signals, and ship a **single universal demo page** at `/clinics/demo` that any cold-outreach prospect can be sent to. The page must visibly impress: real data, charts, a quantified revenue-leakage estimate, and three concrete fixes Jack would deploy in 14 days.

---

## 0. Executor contract

Execute every step in order. Verify each step's success criterion before proceeding. If a step fails, debug in place — do not skip. Where a secret or credential is required, pause and explicitly ask the user, then resume. Do not make creative decisions; every design and copy choice is specified.

**Stack constraints for the site:** pure static HTML/CSS/vanilla JS. No frameworks, no build step, no bundler.
**Stack for the scraper:** Python 3.11+, standard library + `requests`, `pandas`, `python-dotenv`. No async, no scrapy, no playwright. Keep it boring and readable.

---

## 1. Prerequisites the user must provide

Before starting, ask the user to confirm and supply:

1. **Google Cloud project** with **Places API (New)** enabled. User will paste a `GOOGLE_PLACES_API_KEY` into a `.env` file we create in step 3.
   - Activation URL to send the user if needed: `https://console.cloud.google.com/apis/library/places.googleapis.com`
   - The $200/month free credit covers this build comfortably (~$5–15 of actual usage).
2. **OpenAI API key** (or Anthropic — script will support both via a `LLM_PROVIDER` env var, default `openai`). Used only for sentiment clustering of review snippets. Budget ceiling: $3 of usage.
3. **Confirmation that user has push access** to the `serviceopera-site` GitHub repo and that Netlify is connected to `main`.

Do not proceed until all three are confirmed.

---

## 2. Final file tree (additions only — existing site files untouched)

Add to the existing repo:

```
serviceopera-site/
├── (existing files: index.html, client.html, styles.css, app.js, etc.)
├── clinics/
│   └── demo.html              ← the universal clinic demo page
├── scraper/
│   ├── .env.example           ← template with key placeholders
│   ├── .gitignore             ← ignores .env, raw outputs, __pycache__
│   ├── requirements.txt
│   ├── 01_scrape_clinics.py   ← Google Places → clinics.json
│   ├── 02_enrich_reviews.py   ← Places review details → enriched.json
│   ├── 03_analyze_pains.py    ← scoring + sentiment → analysis.json
│   ├── 04_aggregate_demo.py   ← roll-up stats → ../clinics/_data.json
│   └── README.md              ← how to re-run, costs, troubleshooting
└── clinics/_data.json          ← committed; demo.html fetches it at runtime
```

**Important:** the scraped data feeds the page via a JSON file committed to the repo. No runtime API calls from the browser. This keeps the site fully static and free.

---

## 3. Scraper bootstrap

### 3.1 Create `scraper/` directory and dependencies

```bash
mkdir -p scraper
cd scraper
cat > requirements.txt <<'EOF'
requests>=2.31
pandas>=2.0
python-dotenv>=1.0
openai>=1.40
EOF

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3.2 `.env.example`

```
GOOGLE_PLACES_API_KEY=your_key_here
LLM_PROVIDER=openai
OPENAI_API_KEY=your_key_here
ANTHROPIC_API_KEY=optional_if_using_anthropic
```

### 3.3 `.gitignore`

```
.env
.venv/
__pycache__/
*.pyc
raw_*.json
```

Pause and ask the user to copy `.env.example` to `.env` and paste their two API keys. Verify `.env` is git-ignored before proceeding.

---

## 4. Scraping & analysis pipeline

### 4.1 `01_scrape_clinics.py` — discovery

**Inputs:** `GOOGLE_PLACES_API_KEY` from `.env`.
**Output:** `scraper/clinics.json` — array of clinic records.

Behavior:
- Use Google Places API (New) **Text Search** endpoint: `POST https://places.googleapis.com/v1/places:searchText`.
- Run 5 separate queries to cover the verticals broadly:
  1. `dental clinic Thailand`
  2. `aesthetic clinic Thailand`
  3. `cosmetic surgery Thailand`
  4. `dermatology clinic Thailand`
  5. `IVF fertility clinic Thailand`
- For each query, request these `X-Goog-FieldMask` fields:
  `places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.websiteUri,places.internationalPhoneNumber,places.googleMapsUri,places.primaryType,places.types,places.priceLevel,places.regularOpeningHours.weekdayDescriptions`
- Paginate up to 60 results per query (Places New caps at 20 per page, 3 pages via `nextPageToken`).
- **Deduplicate** across queries by `place.id`.
- **Filter:**
  - Drop any place without `websiteUri` AND fewer than 10 reviews (no signal, not useful as prospect).
  - Drop places located outside the bounded target area in Thailand (rough: lat 12.85–13.05, lng 100.85–100.99).
  - Drop places where `primaryType` contains `hospital` (we want clinics, not hospitals — they're too big).
- **Target output size:** 40–60 clinics. If under 40, log a warning but continue.

Each record in `clinics.json`:

```json
{
  "place_id": "ChIJ...",
  "name": "Serenity Dental",
  "address": "...",
  "lat": 12.93,
  "lng": 100.88,
  "rating": 4.6,
  "review_count": 312,
  "website": "https://...",
  "phone": "+66...",
  "maps_url": "https://maps.google.com/?cid=...",
  "primary_type": "dentist",
  "types": ["dentist", "health", ...],
  "price_level": "PRICE_LEVEL_MODERATE",
  "hours": ["Monday: 9–18", ...],
  "discovered_via": ["dental clinic Thailand"],
  "vertical": "dental"   // inferred from queries/types: dental | aesthetic | ivf | mixed
}
```

Log a one-line summary per query and a final count. Print total API cost estimate (each Text Search = $0.032, each subsequent page = $0.032). Expected total: ~$1.50.

### 4.2 `02_enrich_reviews.py` — review snippets

**Input:** `clinics.json`.
**Output:** `scraper/enriched.json`.

For each clinic, call **Place Details (New)**: `GET https://places.googleapis.com/v1/places/{place_id}` with `X-Goog-FieldMask: id,reviews,editorialSummary`. This returns up to 5 review snippets (Places New limitation — that's all Google exposes).

For each review extract: `rating`, `text.text`, `originalText.text`, `originalText.languageCode`, `publishTime`, `authorAttribution.displayName`.

**Add to each clinic record:**
- `reviews_sample`: array of up to 5 reviews as above.
- `review_languages`: distinct `languageCode` values seen.
- `editorial_summary`: Google's own short description if present.

Place Details costs $0.017 each. Expected total: ~$1.

### 4.3 `03_analyze_pains.py` — the scoring engine

**Input:** `enriched.json`.
**Output:** `scraper/analysis.json`.

For each clinic compute the following metrics. These are the **pain signals** the demo page will surface — they must be measurable from public data only.

#### Signals (all rule-based, no LLM needed except where noted)

1. **`rating_gap`** — `5.0 - rating`. Higher = worse. Anything ≥ 0.6 is flagged.
2. **`volume_tier`** — bucket by `review_count`: `<50` low, `50–200` medium, `200–800` high, `800+` flagship.
3. **`review_response_rate_estimate`** — Places API doesn't expose owner replies directly in the New API; **set to `null` for now and add a TODO** to scrape Google Maps frontend for this in a future pass. The demo page will handle `null` gracefully.
4. **`languages_seen`** — count of distinct languages in `review_languages`. ≥ 3 = clinic serves multinational patients.
5. **`negative_review_count`** — number of reviews in `reviews_sample` with `rating <= 3`.
6. **`recent_negative_flag`** — true if any negative review is from the last 90 days (parse `publishTime`).
7. **`website_signal`** — fetch the homepage HTML (5s timeout, ignore failures) and detect:
   - Has `<form>`? → `has_booking_form: bool`
   - Contains `wa.me/` or `whatsapp` link? → `has_whatsapp: bool`
   - Contains `lang="ru"|"zh"|"de"|"ar"|"th"` or visible language switcher links? → `lang_switcher: bool`
   - `https` and valid SSL? → `https_ok: bool`
   - HTML weight in KB.
8. **`pain_sentiment_clusters`** — **LLM call**: send all negative review texts (across all clinics, batched) to OpenAI `gpt-4o-mini` with this system prompt:

   ```
   You are an operations analyst. You will receive a JSON array of negative patient review snippets from medical clinics in Thailand. Group them into 3–6 short pain themes (e.g., "long wait times", "communication issues", "follow-up gaps"). Return JSON: [{theme: string, count: int, sample_quote: string}]. Be precise. No marketing language.
   ```

   Run **once globally** (not per clinic) to keep cost minimal. Tag each clinic with the themes that appear in its own negative reviews.

9. **`revenue_leakage_estimate`** — the killer number. Formula (transparent, documented in the page):

   ```
   monthly_patients_estimate = review_count / months_since_first_review * patient_to_review_ratio
       where patient_to_review_ratio = 20   (industry rule of thumb: ~1 in 20 patients leaves a Google review)
       and months_since_first_review = max(12, derived from data) — fallback to 24 if missing

   avg_ticket_eur:
       dental:    1800
       aesthetic: 2400
       ivf:       6500
       mixed:     2000

   leakage_factors:
       no_booking_form_on_site:    +0.08    (8% of patients drop off)
       no_whatsapp:                +0.06
       no_language_switcher:       +0.05
       rating_gap >= 0.6:          +0.07
       recent_negative_flag:       +0.04

   monthly_leakage_eur = monthly_patients_estimate * avg_ticket_eur * sum(leakage_factors_present)
   ```

   Cap at €30,000/month so it stays believable. Record both the number and the factor breakdown.

10. **`top_3_fixes`** — a rule-based list. For each clinic, output the 3 highest-impact fixes in priority order, chosen from a fixed catalog:

    | id | label | trigger condition |
    |---|---|---|
    | `wa_concierge` | "24/7 multilingual WhatsApp concierge" | no_whatsapp OR languages_seen ≥ 3 |
    | `lang_intake` | "Multilingual patient intake form" | no_language_switcher AND languages_seen ≥ 2 |
    | `review_drafts` | "AI-drafted review replies in each patient's language" | review_count ≥ 50 |
    | `booking_form` | "Online booking + deposit capture" | no_booking_form |
    | `quote_engine` | "Treatment quote calculator with auto follow-up" | vertical in [aesthetic, dental, ivf] |
    | `followup_seq` | "Automated post-treatment follow-up sequence" | recent_negative_flag |
    | `lead_radar` | "Lead-leakage radar across Meta, Google, IG DMs" | review_count ≥ 100 |

    Pick the 3 with the most triggered conditions; ties broken by catalog order.

Each clinic record in `analysis.json` extends the previous fields with:

```json
{
  ...previous fields,
  "signals": {
    "rating_gap": 0.4,
    "volume_tier": "high",
    "review_response_rate_estimate": null,
    "languages_seen": 4,
    "negative_review_count": 2,
    "recent_negative_flag": true,
    "website_signal": { "has_booking_form": false, "has_whatsapp": true, "lang_switcher": false, "https_ok": true, "html_kb": 220 },
    "pain_themes": ["communication issues", "long wait times"]
  },
  "estimates": {
    "monthly_patients": 47,
    "avg_ticket_eur": 1800,
    "monthly_leakage_eur": 9320,
    "leakage_factors_present": ["no_booking_form_on_site", "no_language_switcher", "recent_negative_flag"]
  },
  "top_3_fixes": ["wa_concierge", "booking_form", "lang_intake"]
}
```

### 4.4 `04_aggregate_demo.py` — roll-up for the universal page

**Input:** `analysis.json`.
**Output:** `clinics/_data.json` — anonymized, aggregated data the demo page consumes. **No clinic names**, only the aggregate picture.

Structure:

```json
{
  "generated_at": "2026-05-11T...",
  "sample_size": 47,
  "verticals": { "dental": 22, "aesthetic": 18, "ivf": 4, "mixed": 3 },
  "headline_stats": {
    "clinics_without_booking_form_pct": 64,
    "clinics_without_whatsapp_pct": 31,
    "clinics_without_lang_switcher_pct": 78,
    "clinics_with_recent_negative_pct": 42,
    "avg_languages_seen": 3.4,
    "median_review_response_rate_pct": null,
    "avg_monthly_leakage_eur": 11400,
    "total_monthly_leakage_eur_sample": 537000
  },
  "pain_themes_global": [
    { "theme": "communication issues",  "count": 38, "sample_quote": "..." },
    { "theme": "long wait times",       "count": 29, "sample_quote": "..." },
    { "theme": "follow-up gaps",        "count": 24, "sample_quote": "..." },
    { "theme": "language barriers",     "count": 19, "sample_quote": "..." },
    { "theme": "pricing transparency",  "count": 12, "sample_quote": "..." }
  ],
  "leakage_distribution": {
    "buckets_eur": [0, 2500, 5000, 10000, 20000, 30000],
    "counts":      [3, 9, 14, 13, 6, 2]
  },
  "fix_demand_ranking": [
    { "fix_id": "wa_concierge",   "label": "24/7 multilingual WhatsApp concierge",  "clinics_who_need_this": 33 },
    { "fix_id": "lang_intake",    "label": "Multilingual patient intake form",      "clinics_who_need_this": 29 },
    { "fix_id": "booking_form",   "label": "Online booking + deposit capture",      "clinics_who_need_this": 27 },
    { "fix_id": "review_drafts",  "label": "AI-drafted review replies",             "clinics_who_need_this": 24 },
    { "fix_id": "followup_seq",   "label": "Automated follow-up sequence",          "clinics_who_need_this": 18 }
  ]
}
```

After writing, also write `scraper/clinic_index.csv` containing **only:** `name, vertical, monthly_leakage_eur, top_3_fixes_labels, website, maps_url, phone, email_guess`. This is Jack's private prospect list (gitignored — add `clinic_index.csv` to `scraper/.gitignore`). It is what he'll use for cold outreach.

**`email_guess` heuristic:** if the website has a `mailto:` link, use it. Otherwise build a guess: `info@<domain>`. Flag with `email_verified: false`.

---

## 5. The universal demo page — `clinics/demo.html`

This is the page every cold-outreach email links to. It must feel like Jack already studied **their** market and knows what's broken. The tone is observational and quietly authoritative, not salesy.

### 5.1 Boilerplate

Same head as the rest of the site. Load `../styles.css`. Add `<meta name="robots" content="noindex, nofollow">`. Title: `What's broken in Thailand's clinics — Service Opera`.

Body class: `page-clinics-demo`. Same grain overlay, same nav (link back to `/`).

### 5.2 Data loading

At the top of an inline script, fetch `_data.json` with `fetch('./_data.json').then(r=>r.json())` and hydrate the page on `DOMContentLoaded`. Show a minimal skeleton (3 grey blocks) while loading. If fetch fails, show a graceful fallback message and a `mailto:jack@serviceopera.to`.

### 5.3 Section order

1. **Hero**
2. **The five pains** (sentiment clusters)
3. **The leakage chart** (distribution of estimated monthly revenue lost across the sample)
4. **What clinics need most** (fix demand ranking)
5. **The 14-day fix** (concrete pilot offer)
6. **CTA + footer**

### 5.4 Hero

Eyebrow (mono, amber): `— THAILAND · MEDICAL VERTICAL · UPDATED <date from generated_at>`

Title (Fraunces, line-by-line rise animation):
```
I looked at
<span class="line--accent"><span id="sampleSize">47</span> clinics</span>
in Thailand.
<span class="line--italic">Here's what they're losing.</span>
```

Lede:
> Dental, aesthetic, IVF. I pulled every public signal — Google reviews, websites, opening hours, patient feedback in 5 languages — and ran the same five-point operations audit on each. The picture is consistent. So is the fix.

Stat strip (4 cells, same component as the client page):
- `SAMPLE SIZE` → `<sampleSize>47</sampleSize>` clinics → `dental · aesthetic · IVF`
- `AVG MONTHLY LEAKAGE` → `€<avgLeakage>11.4k</avgLeakage>` per clinic → `▲ conservative estimate`
- `WITHOUT ONLINE BOOKING` → `<noBookingPct>64</noBookingPct>%` → patients drop in the first click
- `WITHOUT LANGUAGE SWITCHER` → `<noLangPct>78</noLangPct>%` → 1 in 3 patients reads Russian or Chinese

All numbers from `headline_stats`. Use the `client-stat` component styles from existing CSS.

### 5.5 The five pains

Eyebrow: `— 01 · WHAT YOUR PATIENTS ACTUALLY COMPLAIN ABOUT`
Title: `Five pains. Same every clinic.`
Sub: `Drawn from <negCount>312</negCount> negative reviews across the sample. Translated where needed. Clustered by theme, not by clinic.`

Render `pain_themes_global` as 5 cards in a responsive grid. Each card:

```
[ 01 ]                          ← mono, amber
COMMUNICATION ISSUES            ← mono caps
38 mentions · 12 clinics        ← mono, muted
"They never replied to my       ← Fraunces italic, --bone
 WhatsApp after the consult."
```

Card hover: subtle lift + amber border. Use `--ink-2` background, 1px `--line-strong` border, 6px radius.

### 5.6 The leakage chart

Eyebrow: `— 02 · THE NUMBER NOBODY LOOKS AT`
Title: `<totalLeakage>€537k</totalLeakage> walking out the door every month.`
Sub: `Across the <sampleSize>47</sampleSize> clinics I audited. Distributed like this:`

Render a horizontal bar chart of `leakage_distribution`. Use pure inline SVG, no chart library.

Spec:
- Container: `width: 100%; max-width: 760px; height: 280px`.
- Y-axis: 6 buckets, labels `€0–2.5k`, `€2.5k–5k`, `€5k–10k`, `€10k–20k`, `€20k–30k`, `€30k+`.
- Bars: filled with `--amber`, 20px tall, with a thin `--amber-deep` outline.
- X-axis: count of clinics in each bucket, labeled at end of bar.
- No grid, no chart-title, no legend. Mono labels, 0.72rem, `--mute-2`.
- Animate width on scroll-into-view: `transform: scaleX(0)` → `scaleX(1)`, transform-origin left, 600ms staggered 80ms per bar.

Caption below chart (mono, small):
> Formula: monthly patients (review-derived) × avg ticket per vertical × sum of present leakage factors. Capped at €30k/clinic to stay conservative. Full method available on request.

### 5.7 What clinics need most

Eyebrow: `— 03 · WHAT WOULD MOVE THE NEEDLE`
Title: `Five things. Ranked by demand.`

Render `fix_demand_ranking` as a vertical numbered list. Each row:

```
01    24/7 multilingual WhatsApp concierge        ████████████░░░  33 clinics
02    Multilingual patient intake form            ███████████░░░░  29 clinics
...
```

The bar is an inline `<div>` whose width is proportional to `clinics_who_need_this / sample_size * 100%`. Color: `--amber`. Height 6px, rounded 3px.

Hover row: amber row tint + slight translateX(4px) on the label.

### 5.8 The 14-day fix

Eyebrow: `— 04 · WHAT I'D DO IN YOUR CLINIC`
Title (Fraunces): `A small system, shipped in <em>14 days.</em>`

Three-step block (reuse `.method` component from existing CSS):

1. **Day 1–3 · Audit** — I sit with your numbers and your three closest competitors. You get a private brief — like this one, but with your name on it.
2. **Day 4–11 · Build** — I wire the one fix that hurts most. WhatsApp concierge, intake form, review autopilot — whichever moves your number. Fixed scope. Fixed price. Live before day 14.
3. **Day 12–14 · Run** — We watch it for 72 hours, tune it, hand it to your team. If it doesn't earn its keep in 60 days, you stop paying. Written.

### 5.9 CTA + footer

CTA box (reuse `.cta` component):
- h2: `Want to see this for your clinic?`
- p: `Send me your clinic's name. In 48 hours I'll send you a private page like this one — with your numbers, your three closest competitors, your three highest-ROI fixes. No call required. No deck. Just the work.`
- Primary button: `jack@serviceopera.to` — opens `mailto:jack@serviceopera.to?subject=Private%20clinic%20audit&body=Hi%20Jack%2C%0A%0AClinic%20name%3A%0AWebsite%3A%0AOne%20thing%20I%27d%20like%20to%20fix%20first%3A%0A%0AThanks.`
- Ghost button: `WhatsApp Jack` → `https://wa.me/?text=Hi%20Jack%20-%20clinic%20audit%20request`

Footer: minimal. `© 2026 SERVICE OPERA · CLINICS VERTICAL · DATA REFRESHED <date>`.

---

## 6. Vertical-toggle integration (in `index.html`)

The existing landing page already has (or will have, per prior spec) three vertical toggle pills: `🏥 Clinics`, `🏨 Hotels`, `🏡 Properties`.

Update the Clinics pill so its CTA button now links to `./clinics/demo.html` instead of mailto. Hotels and Properties remain mailto until their demos are built. Keep the swap-hero JS untouched.

Add a small `mono` line below the CTA on the Clinics tab:
> `Live audit · 47 Thailand clinics · updated weekly`

Hyperlink that line to `/clinics/demo.html` too.

---

## 7. Deployment

1. From repo root:
   ```bash
   git add clinics/ scraper/
   git commit -m "feat(clinics): scraping pipeline + universal demo page"
   git push origin main
   ```
2. Netlify auto-deploys on push. Wait for the green check.
3. Verify:
   - `curl -sI https://serviceopera.to/clinics/demo.html` → 200, `X-Robots-Tag: noindex, nofollow` (already configured in `netlify.toml` — extend the rule to also cover `/clinics/*`).
   - Browser test: open `https://serviceopera.to/clinics/demo.html`, confirm data loads, all charts render, all numbers are present (no `null`/`undefined` in DOM).
   - Browser test: `/` Clinics tab CTA now points to the demo page.

**Update `netlify.toml`** to add:

```toml
[[headers]]
  for = "/clinics/*"
  [headers.values]
    X-Robots-Tag = "noindex, nofollow"
    Cache-Control = "no-store"
```

---

## 8. Acceptance criteria

- [ ] `scraper/clinics.json` exists with 40+ clinics.
- [ ] `scraper/analysis.json` exists with all signals populated per clinic (except `review_response_rate_estimate` which is `null` by design).
- [ ] `clinics/_data.json` exists, committed to repo, contains `headline_stats`, `pain_themes_global` (5 themes), `leakage_distribution`, `fix_demand_ranking` (5 fixes).
- [ ] `scraper/clinic_index.csv` exists locally (not committed) — Jack's prospect list.
- [ ] `https://serviceopera.to/clinics/demo.html` loads in under 2 seconds, renders all 6 sections, all data hydrated, no console errors.
- [ ] `/clinics/demo.html` is excluded from search engines (header + meta).
- [ ] Index page's Clinics tab CTA links to the demo page.
- [ ] Lighthouse mobile: Performance ≥ 90, Accessibility ≥ 95, SEO ≥ 95.

---

## 9. Out of scope (do not build in this pass)

- The 5 super-personalized clinic pages. Those come next, after Jack reviews the universal demo and the prospect list. Leave the file tree ready for `/clinics/<slug>.html` to be added later.
- The "response time test" (sending fake inquiries to clinics). That happens manually for the top 5 prospects only, outside this script.
- Email-sending automation. Cold outreach stays manual — Jack sends from his inbox.
- Hotels and Properties verticals.
- Server-side authentication for the demo page. It's public-but-unindexed by design — anyone with the link sees it, search engines don't.

---

## 10. Final report

When all acceptance criteria pass, output a single message containing:

1. Live URL of the demo page.
2. Count of clinics scraped, broken down by vertical.
3. Top 5 most-needed fixes from `fix_demand_ranking`.
4. Total estimated monthly leakage across the sample (in €).
5. Path to the local `clinic_index.csv` and a one-line reminder that it's Jack's prospect list, not committed to git.
6. Estimated total API spend (Google + LLM) in USD.

No marketing language. No emoji.
