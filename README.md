# Service Opera — operating manual

AI service operations for **hotels, clinics, and property businesses worldwide** — owner **Jack** · `jack@serviceopera.to` · **www.serviceopera.to**

---

## 1. What you have

A complete, deployable site under **`serviceopera.to`**. All static assets live in **`public/`** (HTML, CSS, JS, logos, `clinics/`). **`server.mjs`** is a small Node (Express) server: it serves `public/` and, when configured, sends **portal** email (sign-up confirmation, forgot password, optional login OTP) via Resend.

| Path | What it is |
|---|---|
| `public/index.html` | Public landing page. **Jack — Service Operator** (`www.serviceopera.to`): AI operations for international hotels, clinics, and property businesses. |
| `public/client.html` | **The "secret page".** Demo workspace behind a **browser-only** username/password (see `public/app.js`). For real data, replace with server-side auth. |
| `public/styles.css` | Shared black / white / indigo design system. |
| `public/app.js` | Landing-page modal + demo credential check. |
| `public/admin.html` | **Jack admin console** — email + password (server-verified hash) or local `admin-config.js` preview; loads `admin.js`. |
| `public/admin.js` | Admin gate + users table, inbox, report catalog, site appearance. With **`ADMIN_PASSWORD_HASH`** on the Node host, sign-in uses **POST /api/admin/login** and a server-signed JWT; without the API, optional `admin-config.js` unlocks the UI only. |
| `public/admin-config.js` | Optional: `window.__ADMIN_PASSWORD__` when the browser **cannot** reach the Node API — unlocks the admin **shell** only (no `/api/admin/*` calls). **Do not rely on this in production.** |
| `server.mjs` | Static file host + `/api/admin/*` + **clinic users** (`/api/clinic-users`, `/api/auth/clinic-login`, `/api/clinics/report-data`). User rows live in **`DATA_DIR`/clinic_users.json** (default `./data`, Docker `/app/data`). |
| `public/login.html` | Clinic log-in; stores `so_clinic_jwt` and redirects to `/clinics/report.html?slug=…`. |
| `public/clinics/report.html` | Private report view (same layout as the public demo); needs a valid clinic session and slug-specific or fallback `_data.json`. |

**Site appearance & deploys:** When **`DATABASE_URL`** is set, “Site appearance” JSON is stored in PostgreSQL (`site_appearance_config`), and admin image uploads are stored as bytes in **`site_uploads`** and served at **`GET /api/site-uploads/<uuid>`** — they survive Railway redeploys without a volume. Without Postgres, settings use **`DATA_DIR/site-appearance.json`** and uploads go to **`public/assets/site-uploads/`** (`su-*` files), which are lost on ephemeral disks unless you mount a [volume](https://docs.railway.com/guides/volumes) or use external **`https://…`** image URLs.

The client page is marked `noindex, nofollow` and disallowed in `robots.txt` where applicable.

---

## 2. The 3 sectors I targeted (and why)

Service operators in strong travel, medical-tourism, and mixed-channel markets (not a single-city play):

1. **Hotels & serviced apartments** — independent and boutique operators with multilingual guest volume and distributed channel management.
2. **Clinics, dental, beauty & wellness** — mixed local and international demand; intake, reviews and competitor signals often sit in too many places.
3. **Property managers, agencies & serviced rental operators** — lead velocity, pipeline hygiene and owner reporting without linear headcount growth.

I deliberately **skipped bar/nightlife**: lower per-client value, harder to sell automation, more transient ownership.

---

## 3. The 4 automation modules shown in the demo

All four are inside `client.html`, already styled and populated with realistic demo data:

1. **WhatsApp & Booking Concierge** — interactive chat the prospect can actually *try*.
2. **Review Intelligence** — drafted replies in EN, FR-style, ZH. Maintenance flagging.
3. **Lead Engine & CRM** — scored pipeline table.
4. **Competitor & Pricing Radar** — live competitor rates + a revenue-opportunity recommendation in ฿.

The "Revenue Opportunity ฿284k next 14 days" callout is the killer line — that's what makes them email you.

---

## 4. The outreach playbook

This is the workflow you described, mapped to the assets:

### Step 1 — Pick a prospect
Find a real business in one of the 3 sectors. Owner's name + email + Instagram or website. Aim for 8–80 keys (hotels), independent clinics, 20–200 doors (property).

### Step 2 — Create their credentials
Open `public/client.html` and `public/app.js`. Add a new entry in **both** `CREDENTIALS` objects:

```js
'amari-resort': { password: 'demo2026', business: 'Amari Resort · Thailand' },
```

Convention I used: `slug-of-business` as username, an 8-char password.
(If you later move to a real backend, this becomes a database lookup. For now: static, fine.)

### Step 3 — *(Optional but recommended)* personalize the demo
Open `public/client.html` and swap a few details so it feels truly built for them:
- The 3 competitors in the **Pricing Radar** module → put their *actual* 3 closest competitors in their market (wherever they compete).
- The chat module top bubble → change "Anna" to a realistic guest name and the room type to match their property.
- The "Revenue Opportunity" paragraph → if you can find a real event in their window, drop it in.

A 15-minute personalization makes the demo feel 10× more real. That's what converts.

### Step 4 — Send the email

Subject: `A private demo I built for {Business Name}`

Body template:

> Hi {First name},
>
> I'm Jack — I design and run AI automation systems for hospitality and medical operators worldwide. Rather than send another cold pitch, I spent an afternoon and built you a private demo workspace showing what a dialed-in week of service operations could look like once a few workflows are automated.
>
> It's a real working page, not a PDF. Have a look when you have 5 minutes:
>
> → **https://serviceopera.to/client.html**
> Username: `amari-resort`
> Password: `demo2026`
>
> If it's useful, reply and we'll talk. If it isn't, no follow-ups — you have my word.
>
> Jack
> jack@serviceopera.to
> serviceopera.to

### Step 5 — They click. They explore. They reply.
If the demo is real and personalized, **roughly 1 in 8 to 1 in 12** owners reply for B2B services like this. The CTA at the bottom of `client.html` is already wired with a pre-filled mailto so when they click "Email Jack →" their client opens a clean message addressed to you.

---

## 5. Deploying serviceopera.to

You bought the domain. To put the site online (free):

**Option A — Netlify (5 minutes):**
1. Push this repo to GitHub.
2. Sign in at netlify.com → "Add new site" → "Import from Git" → pick the repo.
3. Build command: *(empty)* · Publish directory: **`public`** (see `netlify.toml`).
4. Add custom domain `serviceopera.to`. Netlify gives you DNS records — paste them into your domain registrar.
5. SSL is automatic. **Note:** Netlify static deploys do **not** run `server.mjs`; operator console APIs and portal email features require Railway (or another Node host), not Netlify static alone.

**Option B — Cloudflare Pages (also free, faster):**
Same flow at pages.cloudflare.com. If you bought the domain via a registrar that supports Cloudflare DNS, even faster.

**Option C — pure static (cheapest, you handle):**
Any static host (Vercel, GitHub Pages, S3). Publish the **`public/`** folder. No build step. **Operator console APIs** (`/api/admin/*`) will **not** be available unless requests route to a Node host running `server.mjs`.

**Option D — Railway (Dockerfile recommended):**
The `Dockerfile` runs **Node**: `server.mjs` serves **`public/`** and sets the same style of security headers as `netlify.toml` (including `Cache-Control` / `X-Robots-Tag` on `client.html`). Railway sets `PORT` automatically.

**Railway — variables for operator console + email**

| Variable | Required | Purpose |
|---|---|---|
| `ADMIN_PASSWORD_HASH` | **Yes** for server-backed admin | scrypt password hash (`salt:hex`, same format as portal users). Generate locally: `node scripts/hash-admin-password.mjs "your-strong-password"` — set the printed `ADMIN_PASSWORD_HASH=…` on the Node service (never commit the hash). |
| `ADMIN_EMAIL` | Optional | Defaults to `jack@serviceopera.to`. Only this address can obtain an admin JWT via password login or portal bootstrap. |
| `PORTAL_JWT_SECRET` or `ADMIN_JWT_SECRET` | **Required on Railway** | One long random string (either variable name works; same key for admin and **portal** `/login.html` users). If omitted locally, a random secret is generated at each process start — on **Railway** the server **exits** until you set one of these, so sessions survive deploys and all replicas agree. |
| `RESEND_API_KEY` | Recommended for portal email | [Resend](https://resend.com) API key. When set on **`server.mjs`**: **Create account** confirmation, **Forgot password?**, and optional **login OTP** on `/login.html`. Not used for operator console sign-in. |
| `RESEND_FROM` | Recommended | Verified sender, e.g. `ServiceOpera <noreply@yourdomain.com>`. Resend’s test domain only delivers to your own mailbox. |
| `CLINIC_SELF_REGISTER` | Optional | **On by default** for **`server.mjs`**: **Create account** on `/login.html` stages a pending sign-up and sends a **confirmation email** (needs **`RESEND_API_KEY`**); the account is created only after the user opens the link. Set to `false`, `0`, `no`, or `off` for invite-only accounts (admin creates users). |
| `PUBLIC_ORIGIN` | Optional | Full public URL of the site (e.g. `https://serviceopera.to`), no trailing slash. Used in reset links if the reverse proxy does not pass a reliable host/proto. |
| `DATA_DIR` | Optional | Directory for JSON state when not on Postgres (`site-appearance.json`, portal users, etc.). Defaults to `./data` locally and `/app/data` in the Docker image. **Railway’s root filesystem is ephemeral**; with **`DATABASE_URL`**, site appearance + uploads live in Postgres and do not need a volume for those. Without Postgres, add a [volume](https://docs.railway.com/guides/volumes) if you rely on `DATA_DIR` or `public/assets/site-uploads/` staying across redeploys. |
| `DATABASE_URL` | Recommended on Railway | When set **and** the server connects at startup, portal users, site appearance JSON, and admin image bytes use PostgreSQL (`site_uploads` + `GET /api/site-uploads/<uuid>`). Must be on the **same Railway service** that runs `server.mjs` (the process that handles `POST /api/admin/site-appearance/upload`). If the variable is present but deploy logs show `PostgreSQL init failed`, the pool stays off: site appearance falls back to JSON/disk, **`GET /api/site-uploads/:id` returns 404**, and **new uploads are rejected with HTTP 503** until you fix connectivity and redeploy (then re-upload images).

### Dental Design Center audit — emailed magic link (passwordless open)

The public audit page stays anonymous for everyone without `?access=` / `?magic=`. With those query params, the page loads the same HTML, **immediately removes the token from the address bar** (`history.replaceState`), **`POST /api/auth/audit-ddc-magic`**, and stores **`so_user_jwt`** / **`so_user_session_id`** like **`login.html`** after a normal sign-in. The magic token is an **HMAC-signed JWT** using the same **`PORTAL_JWT_SECRET`** / **`ADMIN_JWT_SECRET`** as the rest of the portal (`aud: audit-ddc`, **`sub` = portal user email**, **`exp`**). It is **not single-use** (anyone with the URL can exchange it until **`exp`**). **Rotating `PORTAL_JWT_SECRET`** revokes all outstanding links.

While first-time credentials are shown on **`/clinics/004/`**, **`GET /api/public/audit-ddc-first-access`** also returns **`activationUrl`** (same signed token) when the portal user already exists — the **Portal access** callout displays it with **Copy activation link**. Set **`PUBLIC_ORIGIN`** to the frontend host (e.g. your Railway static URL) so the link opens the report on the correct origin.

**Mint a link** on a machine that has the production API secret:

```bash
export PORTAL_JWT_SECRET='…same as Railway…'
export PUBLIC_ORIGIN='https://www.serviceopera.to'   # optional
node scripts/mint-audit-ddc-magic-link.mjs recipient@example.com
```

The portal user must already exist and **`reportSlug`** must match **`AUDIT_DDC_REPORT_SLUG`** (default `004`). Optional **`AUDIT_DDC_MAGIC_TTL_MS`** sets link lifetime when minting (default seven days, capped at thirty days in the script).

**Railway checklist — persistent “Site appearance” images**

1. Add a **PostgreSQL** plugin (or external DB) and copy its connection string into **`DATABASE_URL`** on the **Node / Docker service** that runs `server.mjs` — not on a separate static-only service.
2. Redeploy that service and confirm deploy logs **do not** contain `PostgreSQL init failed`. In admin → **Deploy log**, `Postgres pool active` should be **true**.
3. Open **Site appearance** and **re-upload** any asset whose URL still starts with `/assets/site-uploads/` (legacy disk). After Postgres is active, new uploads get `/api/site-uploads/<uuid>` and survive redeploys.
4. If the marketing domain is on another host but the API is on Railway, keep **`so-api.js`** pointed at the Railway **public URL** for `/api/*` so admin previews and `theme.js` resolve uploads against the Node origin.

**Legacy `/assets/site-uploads/su-*` URLs:** After a redeploy, those files are gone; the admin preview shows “Could not load”. There is no automatic byte migration from disk to Postgres. Re-upload each field (or switch to a stable `https://…` URL).

**Migration — admin email OTP removed (deploy checklist)**

1. On your laptop (or any Node 20+ environment with this repo): run `node scripts/hash-admin-password.mjs "YourNewStrongPassword"` and copy the printed `ADMIN_PASSWORD_HASH=…` line.
2. In Railway (or your host), add variable **`ADMIN_PASSWORD_HASH`** with that value. Keep **`ADMIN_EMAIL`** and **`PORTAL_JWT_SECRET`** / **`ADMIN_JWT_SECRET`** as they are.
3. Redeploy the Node service. **`RESEND_API_KEY`** is still used for portal sign-up / forgot-password / login OTP — it is **not** required for operator console sign-in anymore.
4. Remove any obsolete automation that called **`POST /api/admin/send-code`** or **`POST /api/admin/verify-code`** (those routes are gone).
5. Open `/admin.html`, sign in with **email + password**. The UI stores the same **`so_admin_jwt`** (Bearer + local/session storage) as before.

**Troubleshooting — “Forgot password?” / Resend**

- `RESEND_API_KEY` must be on **the same Railway service that runs `node server.mjs`** (the Docker deploy from this repo). A separate static-only service or a CDN in front of the site will not see those variables unless `/api/*` is routed to Node.
- In **Deploy logs** after startup, look for `[serviceopera] v…` and either `Resend: RESEND_API_KEY is set` or `missing`. If the dashboard shows the variable but logs say `missing`, confirm you edited **this** service, then **Redeploy** so a new container starts with the env.
- **Cloudflare Worker in front:** if `GET /api/auth/clinic-capabilities` succeeds but **`POST`** (login, Create account) returns Cloudflare HTML **502**, forward method + body to origin (`workers/cloudflare-reverse-proxy.example.js`); **`clinic-register` waits on Resend** — slow routes combined with timeouts or Railway cold-start often show as edge 502 rather than Express JSON errors.

**Collegare questo repo a Railway (GitHub → deploy automatico):**

1. In [Railway](https://railway.com) apri il progetto e l’ambiente che usi in produzione.
2. Seleziona il **servizio che esegue Node** (Dockerfile / `npm start` → `server.mjs`), non un host solo-statico senza `/api/*`.
3. Vai su **Settings** (ingranaggio del servizio) → sezione **Source** / **Connect repo** (testi simili in base alla UI).
4. Collega **GitHub** e scegli il repository **`serviceoperato/serviceoperator`**, branch **`main`**. Se il monorepo non è alla root del repo, imposta **Root Directory** di conseguenza (per questo repo lascia la root del repository).
5. Se Railway chiede permessi aggiuntivi, in GitHub apri [Installazioni app GitHub](https://github.com/settings/installations) → **Railway** → **Configure** e concedi l’accesso al repository (o a tutta l’org `serviceoperato`).
6. Nel servizio, abilita **Deploy / Auto deploy on push** (o equivalente) per il branch `main`, così ogni `git push` su `main` avvia un nuovo deploy. Se non parte subito, usa **Redeploy** dal menu del servizio o la Command Palette (**Deploy latest commit**).
7. Riferimento ufficiale: [GitHub autodeploys su Railway](https://docs.railway.com/guides/github-autodeploys).

**Option E — Railway without Docker (Nixpacks):** `npm start` runs **`node server.mjs`**, same as the Docker image. The repo must include **`public/`** with all static files.

---

## 6. Hardening the "secret page" later

The **client** demo (`public/client.html`) still uses **client-side** `CREDENTIALS` in `public/app.js` — fine for fake data; anyone can read it in DevTools.

**Admin** on a Railway (or other) Node deploy with **`ADMIN_PASSWORD_HASH`** uses **email + password** and a **server-signed JWT** (same TTL and cookie-free Bearer pattern as before). `RESEND_API_KEY` is unrelated to operator sign-in.

When you start handling real client data (e.g. a live competitor scrape for an actual paying client), switch to:

- **Netlify Identity** or **Cloudflare Access** → real auth, free for small teams.
- Or a tiny backend (Cloudflare Worker + KV) that validates credentials server-side and returns a short-lived JWT.
- Each client gets their *own* URL like `/clients/amari-resort` so credentials can't be guessed by URL.

For pure cold-outreach demos with fake data, the current setup is honestly enough.

---

## 7. Quick local preview

From the repository root:

```bash
npm install
npm start
```

Then open `http://localhost:8080` (or whatever `PORT` is). This runs **`server.mjs`** so `/api/admin/capabilities` exists; set **`ADMIN_PASSWORD_HASH`** in `.env` (see `.env.example`) for password sign-in, or use **`public/admin-config.js`** for a **UI-only** gate when testing static export.

For a zero-dependency static check only (no admin API):

```bash
npx --yes serve@14 public -l 8000
```

Try the client demo with username `demo` and password `demo` — it'll show the workspace themed as "Demo Property · Thailand".

---

## 8. Brand notes

- **Name:** Service Opera — reads as *Service Operator*. Jack is an AI service operator: systems, pipelines, and runbooks for real service businesses — not a creative studio pitch.
- **Mark:** `public/assets/logo.png` — official www.serviceopera.to lockup (emblem + wordmark). Tab icons: **`public/favicon.png`** (vector) and **`public/favicon.png`** (raster fallback / Apple touch).
- **Tone:** confident, dry, restrained. Never "supercharge", "revolutionize", "synergize". The pitch is: *engineered automation, observable results, honest pricing.*
- **Colors:** black (`#000000`), white (`#ffffff`), indigo accent (`#6366f1` and lighter `#a5b4fc`). Accents stay sparse — mostly monochrome surfaces with indigo for focus states, links, and CTAs.
- **Typography:** Fraunces (display) + Inter Tight (body) + JetBrains Mono (technical labels).

Don't dilute the brand. The whole point is to *not* look like every other AI-agency template.

---

Good hunting, Jack.
