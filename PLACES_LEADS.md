# Pattaya lead collector (Google Places API New)

Compliant lead generation for **Pattaya, Thailand**, using **Google Places API (New) — Text Search** (`places:searchText`).  
No Maps HTML scraping. **API keys stay on the server only** — set **`GOOGLE_MAPS_API_KEY`** in the Node process environment (never in client bundles or public env).

## Access model (admin-only)

- **UI:** `/operator/places-leads.html` is **not** linked from the public site. Open it from the **operator console** after signing in: admin nav → **Places leads** (mints a short-lived `?t=` page token via `POST /api/admin/places-page-token`).
- **Search API:** `POST /api/places/search` requires an **admin JWT** (`Authorization: Bearer …`, same token as other `/api/admin/*` routes). Anonymous or portal-user requests get **401**.
- **Retired URL:** `/places-leads.html` returns **404** (use the flow above).

## Environment variables (server-side only)

| Variable | Required | Purpose |
|----------|------------|---------|
| **`GOOGLE_MAPS_API_KEY`** | Yes for searches | Google Cloud API key with **Places API (New)** enabled. Read only in Node (`server.mjs` / `lib/google-places-search.mjs`). Never exposed to unauthenticated clients. |
| **`PLACES_API_MIN_GAP_MS`** | No | Minimum milliseconds between outbound calls to `places.googleapis.com` from this process (default `400`). |
| **`PORTAL_JWT_SECRET`** or **`ADMIN_JWT_SECRET`** | Yes in production | HMAC key for JWTs including admin sessions and the short-lived **places page** document token. |
| **`ADMIN_PASSWORD_HASH`** | Yes for operator login | Operator signs in at `/admin/users`; minted admin JWT is used for Places API calls. |

See **`.env.example`** for copy-paste placeholders.

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

## Operator UI (Chrome)

1. Sign in at **`/admin/users`** (operator email + password when **`ADMIN_PASSWORD_HASH`** is set on the server).
2. In the admin nav, click **Places leads** — opens **`/operator/places-leads.html?t=…`** in a new tab (time-limited token; refresh before expiry or open again from admin).
3. **Collect leads** sends `POST /api/places/search` with your **admin JWT** from browser storage (`so_admin_jwt`). The Google API key is **not** in the page or request body.
4. **Download CSV** (UTF-8 with BOM for Excel).

Per-line category override: `clinic|dental clinic in Pattaya Thailand`, `hotel|…`, `real_estate|…`.

## API

`POST /api/places/search` — **Authorization: Bearer &lt;admin JWT&gt;** required.

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
| `401` on `/api/places/search` | Admin JWT missing or expired — sign in again at `/admin/users` |
| `404` on `/operator/places-leads.html` | Missing or expired `?t=` token — use **Places leads** in admin nav again |
| `REQUEST_DENIED` / `API key not valid` | Enable Places API (New); check key restrictions |
| Empty results | Narrow or rephrase `query`; verify billing |
| CORS / failed fetch | Use the app origin (e.g. `http://localhost:8080/…`), not `file://` |
