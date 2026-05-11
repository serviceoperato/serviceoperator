# Service Opera — operating manual

AI service operations and automation for operators across Thailand.
Owner: **Jack** · `jack@serviceopera.to`

---

## 1. What you have

A complete, deployable site under **`serviceopera.to`** with:

| File | What it is |
|---|---|
| `index.html` | Public landing page. Sells you as a premium automation freelancer for hospitality, medical and property businesses across Thailand. |
| `client.html` | **The "secret page".** Password-protected private demo workspace. You send one prospect a unique username + password; they log in and see a dashboard themed for *their* business. |
| `styles.css` | Shared black / white / indigo design system. |
| `app.js` | Landing-page modal + credential check. |

The two pages share styling but the client page is hidden behind a login gate and marked `noindex, nofollow` so it doesn't show up on Google.

---

## 2. The 3 sectors I targeted (and why)

Based on real Thailand market data:

1. **Hospitality** — boutique hotels, serviced apartments, pool villas. High ticket, recurring need, multilingual guest volume.
2. **Medical & Wellness** — dental, aesthetic, IVF, wellness retreats. Thailand is Asia's #1 medical tourism destination, growing 4–6% annually, with patients spending big and needing intake in RU/ZH/AR/EN.
3. **Property Management** — rental management, brokerage, relocation. Constant lead flow, owner reporting, tenant comms — all heavily automatable.

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
Open `client.html` and `app.js`. Add a new entry in **both** `CREDENTIALS` objects:

```js
'amari-resort': { password: 'demo2026', business: 'Amari Resort · Thailand' },
```

Convention I used: `slug-of-business` as username, an 8-char password.
(If you later move to a real backend, this becomes a database lookup. For now: static, fine.)

### Step 3 — *(Optional but recommended)* personalize the demo
Open `client.html` and swap a few details so it feels truly built for them:
- The 3 competitors in the **Pricing Radar** module → put their *actual* 3 closest competitors in their market (anywhere in Thailand).
- The chat module top bubble → change "Anna" to a realistic guest name and the room type to match their property.
- The "Revenue Opportunity" paragraph → if you can find a real event in their window, drop it in.

A 15-minute personalization makes the demo feel 10× more real. That's what converts.

### Step 4 — Send the email

Subject: `A private demo I built for {Business Name}`

Body template:

> Hi {First name},
>
> I'm Jack — I design and run AI automation systems for hospitality and medical operators across Thailand. Rather than send another cold pitch, I spent an afternoon and built you a private demo workspace showing what a dialed-in week of service operations could look like once a few workflows are automated.
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
1. Push `serviceopera/` folder to a free GitHub repo.
2. Sign in at netlify.com → "Add new site" → "Import from Git" → pick the repo.
3. Build command: *(empty)* · Publish directory: `/`
4. Add custom domain `serviceopera.to`. Netlify gives you DNS records — paste them into your domain registrar.
5. SSL is automatic.

**Option B — Cloudflare Pages (also free, faster):**
Same flow at pages.cloudflare.com. If you bought the domain via a registrar that supports Cloudflare DNS, even faster.

**Option C — pure static (cheapest, you handle):**
Any static host (Vercel, GitHub Pages, even an S3 bucket). The whole site is 4 files + fonts from Google. No build step.

**Option D — Railway (Dockerfile recommended):**
The `Dockerfile` serves the same static files with **nginx** and adds security headers (global + `/client.html` noindex/cache) similar to `netlify.toml`. Railway will detect the Dockerfile and set `PORT` automatically.

**Collegare questo repo a Railway (GitHub → deploy automatico):**

1. In [Railway](https://railway.com) apri il progetto e l’ambiente che usi in produzione.
2. Seleziona il **servizio frontend** (quello che deve servire il sito statico).
3. Vai su **Settings** (ingranaggio del servizio) → sezione **Source** / **Connect repo** (testi simili in base alla UI).
4. Collega **GitHub** e scegli il repository **`serviceoperato/serviceoperator`**, branch **`main`**. Se il monorepo non è alla root del repo, imposta **Root Directory** di conseguenza (per questo repo lascia la root del repository).
5. Se Railway chiede permessi aggiuntivi, in GitHub apri [Installazioni app GitHub](https://github.com/settings/installations) → **Railway** → **Configure** e concedi l’accesso al repository (o a tutta l’org `serviceoperato`).
6. Nel servizio, abilita **Deploy / Auto deploy on push** (o equivalente) per il branch `main`, così ogni `git push` su `main` avvia un nuovo deploy. Se non parte subito, usa **Redeploy** dal menu del servizio o la Command Palette (**Deploy latest commit**).
7. Riferimento ufficiale: [GitHub autodeploys su Railway](https://docs.railway.com/guides/github-autodeploys).

**Option E — Railway without Docker:** A minimal `package.json` + `npm start` runs [`serve`](https://github.com/vercel/serve) on `$PORT` for Nixpacks-only deploys. If Railpack looks for `src/index.js`, prefer the Dockerfile path or set **Start Command** to `npm start` with root at this folder.

---

## 6. Hardening the "secret page" later

Right now the password check is **client-side JavaScript** — which is fine for a demo because the page contains no real data. Anyone determined enough could open DevTools and read the `CREDENTIALS` object.

When you start handling real client data (e.g. a live competitor scrape for an actual paying client), switch to:

- **Netlify Identity** or **Cloudflare Access** → real auth, free for small teams.
- Or a tiny backend (Cloudflare Worker + KV) that validates credentials server-side and returns a short-lived JWT.
- Each client gets their *own* URL like `/clients/amari-resort` so credentials can't be guessed by URL.

For pure cold-outreach demos with fake data, the current setup is honestly enough.

---

## 7. Quick local preview

From inside the `serviceopera/` folder:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

Try the demo with username `demo` and password `demo` — it'll show the workspace themed as "Demo Property · Thailand".

---

## 8. Brand notes

- **Name:** Service Opera — reads as *Service Operator*. Jack is an AI service operator: systems, pipelines, and runbooks for real service businesses — not a creative studio pitch.
- **Mark:** `logo-icon.svg` / `favicon.svg` — SO monogram inside a six-segment aperture (black + indigo on light surfaces; white + light indigo on the dark site).
- **Tone:** confident, dry, restrained. Never "supercharge", "revolutionize", "synergize". The pitch is: *engineered automation, observable results, honest pricing.*
- **Colors:** black (`#000000`), white (`#ffffff`), indigo accent (`#6366f1` and lighter `#a5b4fc`). Accents stay sparse — mostly monochrome surfaces with indigo for focus states, links, and CTAs.
- **Typography:** Fraunces (display) + Inter Tight (body) + JetBrains Mono (technical labels).

Don't dilute the brand. The whole point is to *not* look like every other AI-agency template.

---

Good hunting, Jack.
