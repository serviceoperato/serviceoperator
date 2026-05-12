# Pattaya lead collector (Google Places API New)

Compliant lead generation for **Pattaya, Thailand**, using **Google Places API (New) — Text Search** (`places:searchText`).  
No Maps HTML scraping. **API keys stay on the server** (`GOOGLE_MAPS_API_KEY`).

## Prerequisites

- Node.js **20+**
- Google Cloud project with **Places API (New)** enabled
- API key stored only in server environment variables

## Setup

```bash
npm install
```

Create a `.env` file (see `.env.example`):

```bash
cp .env.example .env
```

Edit `.env` and set:

```env
GOOGLE_MAPS_API_KEY=your_server_side_key_here
```

Optional tuning:

```env
PLACES_API_MIN_GAP_MS=400
```

## Run

```bash
npm start
```

Default server: `http://localhost:8080` (or `PORT` from env).

## Frontend (Chrome)

Open the static page **from the same origin** as the API (not `file://`):

```
http://localhost:8080/places-leads.html
```

- Paste or keep the default queries (one per line).
- Choose a **default category** (clinics, hotels, or real estate) — applied to every line.
- Per-line override: `clinic|dental clinic in Pattaya Thailand`, `hotel|…`, `real_estate|…`.
- Click **Collect leads** — the browser calls `POST /api/places/search` only; **no key in JavaScript**.
- **Download CSV** (UTF-8 with BOM for Excel).

## API

`POST /api/places/search`

```json
{
  "query": "dental clinic in Pattaya Thailand",
  "category": "clinic"
}
```

`category` is stored on each CSV row for your CRM segmentation (e.g. `clinic`, `hotel`, `real_estate`).

Response (trimmed):

```json
{
  "ok": true,
  "query": "…",
  "category": "clinic",
  "count": 12,
  "collected_at": "2026-05-12T12:00:00.000Z",
  "rows": [ { … } ]
}
```

## Compliance & limits

- Respect [Google Maps Platform Terms](https://cloud.google.com/maps-platform/terms) and Places product policies.
- Server-side **IP rate limit** and **minimum gap** between outbound Google requests reduce accidental bursts.
- Raw Google JSON is **not** persisted on disk by this route.

## Troubleshooting

| Symptom | Check |
|--------|--------|
| `503` GOOGLE_MAPS_API_KEY | Key missing in `.env` or process env |
| `REQUEST_DENIED` / `API key not valid` | Enable Places API (New); check key restrictions |
| Empty results | Narrow or rephrase `query`; verify billing |
| CORS / failed fetch | Open the page via `http://localhost:8080/...`, not `file://` |
