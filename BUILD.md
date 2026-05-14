# Service Opera — Build & Deploy Spec

**Target executor:** Cursor AI (Composer / Agent mode with GitHub + terminal access)
**Owner:** Jack — `jack@serviceopera.to`
**Domain:** `serviceopera.to` (already purchased)
**Goal:** ship a production static site to `https://serviceopera.to` end-to-end, from empty repo to live HTTPS, without further human input beyond OAuth/DNS confirmations.

---

## 0. Executor contract

You are operating as an autonomous agent. Execute the steps below in order. After every step, verify the success condition before proceeding. If a step fails, debug in place — do NOT skip ahead. If a step requires a secret the user must supply (GitHub auth, DNS access, registrar login), pause and ask for it explicitly, then resume.

Do not ask the user to make creative or design decisions. Every design choice is specified below. Do not deviate from the design system, copy, or file structure. Do not "improve" the copy.

Stack constraints: **pure static HTML/CSS/vanilla JS only.** No frameworks, no build step, no bundler, no package.json, no Node dependencies. No analytics scripts. No tracking pixels. No cookie banners (no cookies are set).

---

## 1. Project context

Service Opera is a one-person freelance brand selling bespoke AI automation systems to three B2B verticals across Thailand:

1. Hospitality (boutique hotels, serviced apartments, pool villas, 8–80 keys)
2. Medical & Wellness (dental, aesthetic, IVF, wellness retreats serving medical tourists)
3. Property Management (rental management, brokerage, relocation)

The site has two surfaces:

- **Public landing** (`/index.html`) — credibility + capability pitch, single CTA to email Jack, plus a "Client portal" entry point.
- **Private client workspace** (`/client.html`) — password-gated demo dashboard, personalized per prospect, containing four working-looking automation modules. Each prospect receives a unique username + password via cold email; they log in, explore, and (target outcome) reply asking to engage Jack as their freelancer.

Auth for the demo is intentionally client-side JS against a hardcoded credentials map. The page contains no real customer data — only seeded demo content. This is acceptable for cold-outreach demos. A real-auth migration path is noted in §10 but is out of scope for this build.

---

## 2. Repository setup

1. Create a new **public** GitHub repository named `serviceopera-site` under the user's GitHub account (ask for the org/username if unclear).
2. Initialize with a `main` branch, no template, no license file yet.
3. Clone locally to a working directory `serviceopera-site/`.
4. Create the file tree below.

### Required file tree

```
serviceopera-site/
├── index.html
├── client.html
├── styles.css
├── app.js
├── robots.txt
├── 404.html
├── netlify.toml
├── .gitignore
└── README.md
```

No other files. No `package.json`, no `node_modules`, no build output directory.

### `.gitignore`

```
.DS_Store
*.log
.vscode/
.idea/
node_modules/
.env
.env.*
```

### `robots.txt`

```
User-agent: *
Allow: /
Disallow: /client.html

Sitemap: https://serviceopera.to/sitemap.xml
```

### `netlify.toml`

```toml
[build]
  publish = "."

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Permissions-Policy = "geolocation=(), microphone=(), camera=()"

[[headers]]
  for = "/client.html"
  [headers.values]
    X-Robots-Tag = "noindex, nofollow"
    Cache-Control = "no-store"
```

---

## 3. Design system (non-negotiable)

**Aesthetic direction:** black, white, and indigo — reads like an operator, not a SaaS template. No extra accent hues beyond the indigo family. No glassmorphism abuse. No emoji except where copy explicitly contains them. No stock icons.

### Color tokens (CSS variables, defined in `styles.css :root`)

```
--ink:        #000000   /* page background */
--ink-2:      #0a0a0f   /* card/section background */
--ink-3:      #12121a   /* nested card */
--paper:      #ffffff   /* primary text on dark */
--paper-2:    #f4f4f5
--bone:       rgba(255,255,255,0.78)   /* secondary text */
--mute:       rgba(255,255,255,0.42)
--mute-2:     rgba(255,255,255,0.58)
--amber:      #6366f1   /* indigo accent (legacy token name) */
--amber-2:    #a5b4fc   /* lighter indigo */
--amber-deep: #312e81
--rust:       #818cf8   /* secondary accent / states */
--line:       rgba(255,255,255,0.12)
--line-strong:rgba(255,255,255,0.22)
```

### Typography

Load from Google Fonts in `<head>` of both HTML files (one stylesheet link):

```
Fraunces (opsz 9-144, weights 300/400/500/600/700/900, italic 400)
Inter Tight (300/400/500/600/700)
JetBrains Mono (300/400/500/700)
```

CSS variables:

```
--font-display: 'Fraunces', 'Times New Roman', serif;
--font-body:    'Inter Tight', system-ui, sans-serif;
--font-mono:    'JetBrains Mono', 'Courier New', monospace;
```

Usage rules:
- Display font → all `h1`, `h2`, `h3`, blockquote, large metric numbers, mark `◐`.
- Body font → paragraph text, buttons, form inputs.
- Mono font → eyebrows, labels, technical metadata, table headers, codes.
- All-caps labels: mono, letter-spacing 0.08em, font-size 0.72rem, color `--mute-2` (or `--amber-2` for accent eyebrows).
- Body base: 17px, line-height 1.55.

### Layout primitives

```
--max:    1280px       /* max content width */
--gutter: clamp(1.25rem, 4vw, 3rem)  /* horizontal padding */
```

Sections: `padding: 7rem var(--gutter); max-width: var(--max); margin: 0 auto;`

### Motion

- Fixed grain overlay on every page: `position: fixed; inset: 0; z-index: 100; pointer-events: none; opacity: 0.06; mix-blend-mode: overlay;` — SVG fractalNoise filter inlined as data URI (provided in §5).
- Hero title: line-by-line rise animation, staggered 130ms apart, `cubic-bezier(.2,.7,.2,1)`, 0.9s duration.
- Live dot: pulsing amber box-shadow, 2s loop.
- `◐` mark in nav: continuous 14s linear rotation.
- Marquee strip: 40s linear infinite horizontal scroll.
- Card hover: 1px translateY lift, color shift to amber.
- All animations respect `prefers-reduced-motion` (wrap in media query or set animations to `none`).

### Component conventions

Buttons:
- `.btn--primary` → bg `--paper`, color `--ink`. Hover: bg `--amber`.
- `.btn--ghost` → transparent, border `--line-strong`, color `--bone`. Hover: border + color `--amber-2`.
- `.btn--lg` → larger padding (1.15rem 2rem).
- `.btn--block` → full width.
- Border-radius 2-3px (square-ish, not pill).

Cards / sectors: 4-6px border-radius, 1px border `--line-strong`, padding 2-2.5rem.

Modal: full-viewport backdrop `rgba(10,10,11,0.85)` with `backdrop-filter: blur(8px)`. Card max-width 460px, centered.

---

## 4. Page: `index.html` (public landing)

Single-file HTML. Structure below; **live copy is defined in `index.html` in the repo** (keep spec in sync when changing marketing).

### Head

```html
<title>Service Opera — AI Service Operations · Thailand</title>
<meta name="description" content="Jack — AI service operator. I design and run automation systems for hospitality, medical and property businesses across Thailand.">
```

Preconnect to Google Fonts. Link `styles.css`. Link `/favicon.png` then `/favicon.png` (and optional `apple-touch-icon` to the PNG).

### Section order

1. **Grain overlay** (`<div class="grain" aria-hidden="true">`)
2. **Nav** (fixed, blurred)
3. **Hero** (2-column grid: title block + decorative card stack)
4. **Systems grid** (`#build`) — 4 capability cards in a 2×2 grid (1px lines between, no gutters)
5. **Method** (`#method`) — 3-step ordered list on `--ink-2` background, full-bleed
6. **Sectors** (`#proof`) — 3 cards, middle one (medical) is `--featured` with amber-tinted background
7. **Quote** — centered italic blockquote
8. **CTA** — boxed callout
9. **Footer** — 4-column grid
10. **Portal modal** (hidden by default)

### Nav

- Left: `◐ Service Opera` (rotating mark).
- Right links: `Systems`, `Method`, `Proof`, then a pill-shaped CTA `jack@serviceopera.to` (mailto, mono font, amber color, amber bg on hover).
- Below 720px viewport: hide nav links except the CTA pill.

### Hero copy (exact)

Eyebrow: `CURRENTLY OPERATING · SERVING THAILAND · ICT UTC+7` (mono, preceded by a pulsing accent live dot).

Title — 2 lines, animated in:
```
AI service operations,
engineered.         ← accent line (--amber, italic, indented padding-left 3em)
```

Lede:
> Automation that runs your business while you run your business. I'm Jack — I design and run automation systems for hospitality, medical and property businesses across Thailand: workflows and pipelines for bookings, reviews, leads and pricing, engineered and deployed so your team stays on the floor.

Actions:
- Primary: `See the work` → `#build`
- Ghost: `Start a conversation →` → `mailto:jack@serviceopera.to?subject=Thailand%20automation%20enquiry`

Marquee strip (below actions, full-width between top and bottom `--line` borders, italic Fraunces 1.3rem):
```
Hospitality · Medical & Wellness · Property Management · WhatsApp Concierge · Review Intelligence · Lead Engine · Competitor Radar ·
```
(Repeat twice in markup so the loop is seamless.)

### Hero aside (decorative, hidden under 980px)

Three tilted mini-cards stacked, absolute-positioned within a 320×360 container, rotating 3deg / -2deg / 4deg. Each shows a label, a big Fraunces metric, and a sub-line:

```
01: CHECK-IN BOT   →  98.4%   guest replies under 30s
02: REVIEWS        →  +1.2★   90-day avg lift                ← amber-tinted border
03: LEADS          →  3.7×    qualified pipeline
```

On `:hover` of the parent aside, each card translateY(-6px) with slight X shift.

### Systems (4 cards)

Eyebrow: `— 01 · WHAT I BUILD`
Title: `Four systems. *One operator.*` (em in italic amber)
Sub: `Every engagement is built around one of these four cores, configured to your property and stitched into the tools you already use.`

Each card:
- Mono `01`/`02`/`03`/`04` top-left
- h3 (Fraunces 1.5rem)
- Paragraph
- Mono bullets at bottom

| # | Title | Body | Bullets |
|---|---|---|---|
| 01 | WhatsApp & Booking Concierge | An AI agent that answers guests and patients 24/7 on WhatsApp, LINE and web chat — quotes rooms, confirms appointments, takes deposits, hands off to a human when it matters. | · EN · TH · RU · ZH · DE / · Cloudbeds / Opera / Mews / SimplyBook / · Stripe & Omise payment links |
| 02 | Review Intelligence | Monitors Google, Booking, Agoda, TripAdvisor in real time. Drafts contextual replies in your voice, flags operational issues to the right manager, and surfaces what your guests actually feel. | · Sentiment + topic clustering / · Reply drafts, you approve / · Weekly executive digest |
| 03 | Lead Engine & CRM | Captures every enquiry from Meta ads, web, walk-ins and referrals into one pipeline. Auto-qualifies, scores, follows up, books the call — so nothing rots in an inbox. | · HubSpot / Pipedrive / GoHighLevel / · Automated follow-up sequences / · Attribution & cost-per-booking |
| 04 | Competitor & Pricing Radar | Tracks competitor rates, packages and availability across Thailand nightly. Surfaces revenue opportunities and tells you exactly when to flex price — without staring at OTAs all day. | · Nightly rate scrapes / · Demand & event signals / · Slack / email briefings |

Grid: `repeat(auto-fit, minmax(280px, 1fr))`, 1px `--line` separators (achieved with `gap: 1px; background: var(--line);` and each card has solid `--ink` bg).

### Method (full-bleed dark)

Eyebrow: `— 02 · HOW I WORK`
Title: `A short, honest process.`

Three steps, each a row with `i.` / `ii.` / `iii.` in italic amber Fraunces 2.5rem on the left, body on the right. Horizontal lines between.

1. **Reconnaissance** — I study your property and your three closest competitors. You receive a private brief — a real, working demo built for your business, not a generic deck.
2. **Pilot** — We pick one system and put it live in 14 days. Fixed scope, fixed price, observable results. If it doesn't earn its keep, we stop.
3. **Rollout** — We expand to the rest of the suite, wire it into your team workflows, and I stay on as your retained operator at a monthly rate.

### Sectors

Eyebrow: `— 03 · WHO I WORK WITH`
Title: `Three sectors. *One country.*`

| Icon | Title | Mono caption | Body |
|---|---|---|---|
| ⌂ | Hospitality | BOUTIQUE HOTELS · SERVICED APARTMENTS · POOL VILLAS | Booking concierge, review intelligence, competitor pricing radar. Built for the operator who runs 8 to 80 keys without a revenue manager on staff. |
| ✦ | Medical & Wellness | DENTAL · AESTHETIC · IVF · WELLNESS RETREATS | Multilingual patient intake, treatment-plan quoting, follow-up sequences and review handling. Designed for clinics serving Russian, Chinese, Arabic and European patients. |
| ⬚ | Property Management | RENTAL MANAGEMENT · BROKERAGE · RELOCATION | Lead capture from portals and ads, owner reporting, tenant communication, maintenance ticketing. So you can grow the door count without growing the back office. |

Medical card gets `.sector--featured` (amber-tinted gradient bg).

### Quote section

Centered, Fraunces italic 1.6–2.6rem clamp, max-width 28em:

> "Good automation is invisible. Your team stops drowning, your guests stop waiting, your numbers start moving — and nobody can point to the thing that did it."

Cite line: `— Jack · Service Operator` (mono, amber, 0.8rem, letter-spacing 0.1em).

### CTA

Boxed, dark gradient, faint amber border glow.

- h2: `Have a problem worth automating?`
- p: `Tell me what's eating your week. If I think automation can fix it, I'll build you a private demo — on the house — so you can judge the work, not the pitch.`
- Primary button: `jack@serviceopera.to` → mailto with prefilled subject `Thailand automation enquiry` and body template (URL-encoded):
  ```
  Hi Jack,

  Our business is:
  The problem I'd like to fix is:

  Thanks.
  ```
- Ghost button: `Client portal →` (id `clientPortalBtn`, opens modal)

### Footer

Four columns:
1. `◐ Service Opera` + tagline `AI service operations & automation · Thailand`
2. `CONTACT` / mailto link to `jack@serviceopera.to`
3. `HOURS` / `Mon — Fri · 09:00 — 19:00 ICT`
4. `PRIVATE ACCESS` / link `Open client portal` (id `footerPortal`, opens modal)

Legal strip: `© 2026 SERVICE OPERA · ALL RIGHTS, NONE RESERVED · BUILT IN THAILAND`

### Portal modal

Id `portalModal`, hidden by default (`display: none`, toggled with `.is-open` class).

- Eyebrow: `— PRIVATE ACCESS`
- h3: `Client Portal`
- Sub: `Enter the credentials I sent you to open your private workspace.`
- Form `#portalForm`:
  - text input `username`, placeholder `e.g. amari-resort`
  - password input `password`, placeholder `••••••••`
  - submit button `Enter →` (`.btn--primary.btn--block`)
  - hint `<p id="portalHint">` for error/success messages
- Footnote: `No credentials yet? Write to jack@serviceopera.to and I'll prepare a private demo for your business.`
- Close: `×` button top-right + backdrop click + Escape key.

---

## 5. Shared CSS (`styles.css`)

Build a single stylesheet covering both pages. Required sections, in order:

1. `:root` variables (color, font, layout — listed above).
2. Reset: `* { box-sizing: border-box; margin: 0; padding: 0; }`. `html { scroll-behavior: smooth; }`. Body base styles.
3. Grain overlay rule.
4. `::selection { background: var(--amber); color: var(--ink); }`
5. Link base + `.mono` utility.
6. Nav (fixed, blurred).
7. Hero (grid, title animation `@keyframes rise`, lede, actions, marquee `@keyframes scroll`, decorative card stack).
8. Pulse keyframe (`@keyframes pulse`) for live dot.
9. Spin keyframe (`@keyframes spin`) for `◐` mark.
10. Section primitives, eyebrow, section title.
11. Systems grid (1px-line trick).
12. Method (full-bleed background on `--ink-2`).
13. Sectors grid + `.sector--featured`.
14. Quote, CTA box, footer.
15. Modal (backdrop, card, form inputs).
16. **Client-page-specific styles** (next section).
17. `prefers-reduced-motion` overrides at the end.

### Grain SVG (inline as data URI)

```css
.grain {
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
```

### Client-page styles (in same `styles.css`, namespaced under `.page-client`)

- `.client-nav` — sticky top, blurred, brand left + client name (separated by 1px left border in amber mono caps) + sign-out button right.
- `.client-hero` — large headline `A private demo, *built for [Business].*` + lede + 4-stat strip (REPLY TIME / REVIEW SCORE / QUALIFIED LEADS / REVENUE OPPORTUNITY).
- `.client-stat` — bordered cells, big Fraunces value, mono label, delta line in green (`#6cc788`) when positive.
- `.modules` — grid `1fr` mobile, `1fr 1fr` desktop; `.module--wide` spans both columns.
- `.module` — card with header row (mono number + title + green LIVE badge).
- `.module__badge` — pill, green (`rgba(108,199,136,*)` palette) with small green dot.
- `.chat` — scrollable column max-height 360px, `.bubble--guest` left-aligned `--ink-3` bg, `.bubble--bot` right-aligned amber bg with dark text. `.chat__input` row below.
- `.reviews` — stacked review cards, each with header (author / stars / source mono), text, `.review__reply` indented block with left amber border, action buttons (`.btn-mini` mono pills).
- `.leads-table` — full-width, mono table headers, hover row tinted amber 4%, `.score--hot|--warm|--cold` colored chips.
- `.competitor` — 4-col grid row (name+sub / price / delta / occupancy). `.delta--up|--down|--flat` colored.
- `.pricing-suggestion` — amber-tinted callout with mono label and copy.
- `.client-cta` — final boxed CTA with radial amber glow blob.
- `.gate` — full-screen centered login card identical in style to `.modal__card`.
- `.is-hidden { display: none !important; }`

Use the same color/typography tokens. No new variables.

---

## 6. Page: `client.html` (private workspace)

Same head boilerplate as `index.html`, plus:

```html
<title>Private Workspace · Service Opera</title>
<meta name="robots" content="noindex, nofollow">
```

Body class: `page-client`.

### Structure

1. Grain overlay.
2. `#gate` (login card, visible by default).
3. `#workspace` (everything else, `.is-hidden` by default).

### Gate (login card)

- Brand `◐ Service Opera`
- Eyebrow `— PRIVATE WORKSPACE`
- h1 `Welcome back.`
- p `This page was built for one business. Enter the credentials from Jack's email to open your workspace.`
- Form `#gateForm` (same fields as portal modal: username + password + `Enter →` button + hint).
- Footnote: `Lost your credentials? Reply to Jack's email or write to jack@serviceopera.to.`

### Workspace

**Top nav** — sticky, brand left, client business name shown after brand (mono amber, separated by `1px solid --line-strong` left border + padding-left), `Sign out ↗` button right (id `logoutBtn`).

**Client hero** — eyebrow with live dot + `CONFIDENTIAL · PREPARED FOR YOU · UPDATED TODAY`. h1 contains `<span id="clientName">` token. Lede paragraph (verbatim):

> Below are four automation systems, already wired against simulated data from your business and benchmark competitors across Thailand. Click around — this is what a dialed-in week of service operations could look like.

Stats strip (4 cells, mono labels + Fraunces values + green delta):
- `REPLY TIME` → `28s` → `▲ vs 4h 12m manual`
- `REVIEW SCORE` → `4.7/5` → `▲ +0.4 last 30d`
- `QUALIFIED LEADS` → `142` → `▲ 3.7× pipeline`
- `REVENUE OPPORTUNITY` → `฿284k` → `▲ next 14 days`

**Modules** (in this order):

#### Module 01 — WhatsApp & Booking Concierge

Header: `01 · WhatsApp & Booking Concierge` + green LIVE badge + meta `EN · TH · RU · ZH · DE — try it below`.

Chat container `#chatBox` seeded with 4 bubbles:

```
[guest 14:02] Anna · WhatsApp · 14:02
Hi! Do you have a deluxe room available from March 14 to 17 for 2 adults?

[bot 14:02] Concierge · 14:02
Hi Anna 👋 Yes — we have 2 Deluxe Sea-View rooms left for those dates. 3 nights, 2 adults: ฿8,940 total (breakfast included). Want me to hold one for 15 minutes while you decide?

[guest 14:03] Anna · 14:03
Yes please. Can I pay a 30% deposit now?

[bot 14:03] Concierge · 14:03
Of course. Here's your secure payment link for ฿2,682 (30%): pay.serviceopera.to/abc-xyz — once it clears I'll send your confirmation and a check-in guide. ✨
```

Input row: `#chatInput` placeholder `Try asking — e.g. 'Do you offer airport pickup?'`. `#chatSend` button.

#### Module 02 — Review Intelligence

Header: `02 · Review Intelligence` + green `3 PENDING` badge + meta `Drafts in your voice — you approve, it posts.`

Three review cards:

1. **Marc Dubois** · ★★★★★ · GOOGLE · 2H AGO
   Text: `"Staff went above and beyond. Khun Ploy at reception remembered our anniversary and arranged something special. Will absolutely return."`
   Drafted reply: `Marc, what a lovely thing to read — we'll make sure Khun Ploy sees this. Anniversaries should be remembered, and we're honoured you spent yours with us. À très bientôt.`
   Actions: `Approve & Post` (primary) / `Edit` / `Regenerate`

2. **Elena Volkova** · ★★★☆☆ · BOOKING · 6H AGO
   Text: `"Room was great but AC in room 412 was very noisy at night. Otherwise lovely stay, breakfast excellent."`
   Reply label: `DRAFTED REPLY · MAINTENANCE FLAGGED ▲`
   Reply: `Elena, thank you for the honest feedback — and we're sorry the AC kept you up. Maintenance has been notified about room 412 today. We hope to welcome you back when everything is at its best.`

3. **Liu Wei · 刘伟** · ★★★★★ · AGODA · 11H AGO
   Text: `"位置很好，员工友好，泳池很干净。强烈推荐！"`
   Reply label: `DRAFTED REPLY · ZH`
   Reply: `刘先生您好，非常感谢您的好评！我们很高兴您喜欢泳池和团队的服务，期待很快再次见到您。🌴`

#### Module 03 — Lead Engine & CRM (`.module--wide`)

Header: `03 · Lead Engine & CRM` + green `SYNCED` badge + meta `Every enquiry, scored and routed. Last 24 hours shown.`

Table columns: `NAME | SOURCE | INTENT | SCORE | STAGE | NEXT ACTION`

Rows:

| Name (+ mono sub) | Source | Intent | Score | Stage | Next action |
|---|---|---|---|---|---|
| **Hans Müller** / DE · 2 GUESTS · 7 NIGHTS | Meta · IG ad | Suite · ฿14k/night | `94` hot | Quote sent | CALL SCHEDULED 18:00 (amber) |
| **Sofia Romano** / IT · MEDICAL TOURISM | Google · ads | Aesthetic package | `88` hot | Consult booked | FOLLOW-UP TOMORROW (amber) |
| **Yuki Tanaka** / JP · LONG STAY | Website form | Monthly rental | `71` warm | Info shared | AUTO NUDGE D+3 |
| **Aleksei Petrov** / RU · FAMILY · 4 | WhatsApp inbound | Pool villa | `66` warm | Negotiating | DISCOUNT OFFERED |
| **Charles Edwards** / UK · REFERRAL | Referral | Wedding venue | `42` cold | Cold inbound | SEQUENCE 1/5 SENT |

Score chips: `.score--hot` rust-tinted, `.score--warm` amber-tinted, `.score--cold` muted.

#### Module 04 — Competitor & Pricing Radar (`.module--wide`)

Header: `04 · Competitor & Pricing Radar` + green `NIGHTLY` badge + meta `Thailand · same room category · next 14 days · scraped 03:00 ICT`.

Four competitor rows (first row id `#myBusinessRow`, will be replaced with client business name by JS):

| Name (+ sub) | Price | Delta | Occ |
|---|---|---|---|
| Your property / DELUXE SEA VIEW · BREAKFAST INCL. | ฿2,980 | — stable (flat) | OCC 78% |
| Hilton Bangkok / DELUXE OCEAN · BREAKFAST INCL. | ฿3,750 | ▲ ฿200 vs yesterday (up) | OCC 84% |
| Centara Grand Mirage / DELUXE FAMILY · HB | ฿4,200 | ▲ ฿350 vs last week (up) | OCC 91% |
| Amari Bangkok / DELUXE SEA · ROOM ONLY | ฿3,180 | ▼ ฿120 vs yesterday (down) | OCC 72% |

Pricing suggestion callout (verbatim):

> **▲ REVENUE OPPORTUNITY · NEXT 14 NIGHTS**
> Competitors are pricing **+18% above you** on the March 12–19 window driven by a regional medical conference. Your occupancy is forecast at **89%** at current rates — a recommended lift of **฿320/night** would capture an additional **~฿284,000** over the period with negligible booking pace impact.
>
> → Approve in one click and rates push to Cloudbeds and all connected OTAs.

### Client CTA

Eyebrow `— WHEN YOU'RE READY`
h2: `If this looks like the workflow you want running, *let's deploy it for real.*`
p:
> Everything you see above runs on live data once we connect it to your PMS, OTAs, Meta and Google. The pilot takes 14 days and you only pay if it ships. If after the demo you'd rather just chat about what's possible, that's fine too — no decks, just answers.

Buttons:
- Primary `Email Jack →` → `mailto:jack@serviceopera.to?subject=Let's%20talk%20-%20automation%20pilot&body=...` (body URL-encoded: `Hi Jack,\n\nI've seen the private workspace and I'd like to talk about a pilot.\n\nBusiness:\nThe system that interests me most:\nBest time to call:\n\nThanks.`)
- Ghost `WhatsApp` → `https://wa.me/?text=Hi%20Jack%2C%20I%27ve%20seen%20the%20private%20demo.` (open in new tab)

### Footer (client page)

Minimal: `© 2026 SERVICE OPERA · PRIVATE WORKSPACE · BUILT FOR <span id="clientFooter">YOU</span>` (mono, centered).

---

## 7. JavaScript

### `app.js` (loaded by `index.html`)

Responsibilities:
1. Open/close `#portalModal` from `#clientPortalBtn`, `#footerPortal`, backdrop click, `[data-close]` button, and `Escape` key.
2. Validate credentials submitted via `#portalForm` against the `CREDENTIALS` map.
3. On success: store `so_client` and `so_business` in `sessionStorage`, redirect to `client.html#<slug>` after 500ms.
4. On failure: show error in `#portalHint`, clear password field.

### Inline `<script>` at bottom of `client.html`

Responsibilities:
1. Same `CREDENTIALS` map (kept identical between files — Cursor: keep these in sync, comment with a `// KEEP IN SYNC WITH app.js` marker on both).
2. On page load, check `sessionStorage.so_client`. If valid → reveal `#workspace`, hide `#gate`, populate `#clientName`, `#clientLabel`, `#clientFooter`, `#myBusinessRow` with the business name.
3. Bind `#gateForm` submit handler with same auth logic.
4. Bind `#logoutBtn` → clear sessionStorage and redirect to `/`.
5. Chat demo: on `#chatSend` click or Enter key in `#chatInput`, append user bubble, then after 700ms append one of 6 canned bot replies (round-robin or random).
6. Escape HTML in user input before insertion (no XSS in the demo).

### CREDENTIALS map (initial seed, identical in both files)

```js
const CREDENTIALS = {
  'amari-resort':    { password: 'demo2026', business: 'Amari Resort · Thailand' },
  'serenity-dental': { password: 'demo2026', business: 'Serenity Dental Clinic' },
  'jomtien-living':  { password: 'demo2026', business: 'Coastal Living Properties' },
  'demo':            { password: 'demo',     business: 'Demo Property · Thailand' },
};
```

Username is normalized to lowercase + trimmed before lookup. Password is exact-match, trimmed.

### Canned chat replies

```js
const cannedReplies = [
  "Yes — we offer airport pickup from Suvarnabhumi (฿1,400) and U-Tapao (฿900). Want me to add it to your booking?",
  "Absolutely. We have a poolside table available at 19:30 — would that suit?",
  "Yes, we welcome pets up to 10kg in our garden suites. There's a small cleaning fee of ฿500. Shall I check availability?",
  "Our spa is open 10:00–22:00. The 60-min Thai massage is ฿1,200 and bookings are highly recommended on weekends.",
  "Of course — late check-out until 16:00 is ฿800, subject to availability the night before. I can pre-arrange it for you.",
  "Yes, breakfast is served 06:30–10:30 in our sea-view restaurant. It's included in your rate.",
];
```

---

## 8. 404 page

Create `404.html` matching the dark aesthetic. Same header/grain. Centered card:

- Mono `— 404 · NOT FOUND`
- h1 (Fraunces 3rem): `This URL isn't in the deployment.`
- p: `The page you're looking for isn't here. It may have been moved, or the link is wrong.`
- Button: `← Back to home` → `/`

Inline minimal CSS that imports `styles.css`, no extra JS.

---

## 9. README.md

Write a concise README at repo root:

- Project: Service Opera — static landing + private demo workspace.
- Stack: HTML/CSS/vanilla JS. No build.
- Files: brief description of each.
- Local preview: `python3 -m http.server 8000` from repo root, open `http://localhost:8000`.
- Demo credentials: `demo` / `demo`.
- How to add a new prospect: edit `CREDENTIALS` in **both** `app.js` and `client.html` (clearly marked), commit, push, Netlify auto-deploys.
- Deploy: Netlify connected to `main` branch; pushes to `main` go live.
- Custom domain: `serviceopera.to` (DNS configured at the registrar pointing to Netlify).

Keep it under 100 lines. No badges. No emoji.

---

## 10. Deployment workflow (execute these in order)

### 10.1 Initial commit

```
git add .
git commit -m "feat: initial Service Opera site"
git branch -M main
git remote add origin git@github.com:<user>/serviceopera-site.git
git push -u origin main
```

If SSH isn't configured, use the GitHub CLI: `gh repo create serviceopera-site --public --source=. --remote=origin --push`.

### 10.2 Netlify deployment

Use the Netlify CLI if available, otherwise instruct the user to do this through the web UI and then continue:

```bash
npm install -g netlify-cli   # only if not installed
netlify login                # opens browser; user authorizes
netlify init                 # link this dir to a new Netlify site
                             # → choose "Create & configure a new site"
                             # → choose the user's team
                             # → site name: "serviceopera"
                             # → build command: (none)
                             # → directory to deploy: .
netlify deploy --prod        # ships to production
```

Verify the auto-generated `*.netlify.app` URL serves both `index.html` and `client.html` (the latter behind the gate).

### 10.3 Custom domain

```bash
netlify domains:add serviceopera.to
netlify domains:add www.serviceopera.to
```

Netlify will print DNS records (typically: `apex ALIAS/ANAME` to `apex-loadbalancer.netlify.com` and `www CNAME` to `<site>.netlify.app`).

Pause here and surface these records to the user with this message:

> "DNS records to add at your registrar for `serviceopera.to`:
> - [list the exact records]
>
> Once propagated (5–60 minutes), Netlify will auto-issue an SSL certificate. Confirm when DNS is set so I can verify."

After user confirms, run:

```bash
netlify api waitForDomainVerification   # or poll netlify status
```

When `https://serviceopera.to` returns 200 with a valid Let's Encrypt cert, proceed.

### 10.4 Post-deploy verification

Curl checks:

```bash
curl -sI https://serviceopera.to | head -1            # expect HTTP/2 200
curl -sI https://serviceopera.to/client.html | grep -i robots   # expect noindex, nofollow
curl -sI https://serviceopera.to/robots.txt          # expect 200, contains "Disallow: /client.html"
```

Manual smoke test (open in browser):
1. `https://serviceopera.to` renders landing.
2. "Client portal →" button opens modal.
3. Enter `demo` / `demo` → redirect to `/client.html#demo` → workspace renders with business name "Demo Property · Thailand".
4. Chat module accepts input and shows a canned reply.
5. Sign out returns to landing.
6. Direct visit to `https://serviceopera.to/client.html` shows the gate (not the workspace).

---

## 11. Acceptance criteria

The build is complete when all of the following hold:

- [ ] Repo `serviceopera-site` exists on GitHub, public, with the exact file tree from §2.
- [ ] `main` branch contains the latest commit.
- [ ] Netlify site is connected to the repo; pushes to `main` trigger auto-deploy.
- [ ] `https://serviceopera.to` returns 200 over HTTPS with a valid certificate.
- [ ] `https://www.serviceopera.to` redirects (or resolves) to apex.
- [ ] All 6 manual smoke-test steps in §10.4 pass.
- [ ] Lighthouse (mobile) scores: Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 95.
- [ ] No console errors on either page.
- [ ] `/client.html` is excluded from search engines (robots.txt + meta + header).
- [ ] All copy in §4 and §6 is reproduced verbatim. No paraphrasing.
- [ ] Color tokens and typography match §3 exactly.

---

## 12. Out of scope (do not build)

- Real server-side authentication for `/client.html`. Note in README that current auth is client-side and acceptable only for demo content; flag a future migration path (Netlify Identity or Cloudflare Access).
- Analytics, tracking, A/B testing.
- A blog, case studies, pricing page, or "About" page.
- Image assets, illustrations, or photography. The aesthetic is pure typography + geometry.
- Multi-tenant routing (per-client URL slugs like `/clients/amari-resort`). All clients use the same `/client.html` keyed by sessionStorage.
- Email-sending infrastructure. CTAs are pure `mailto:` links.
- Internationalization. Site is English-only.

---

## 13. Final report format

After deployment succeeds, output a single message containing:

1. Repository URL.
2. Production URL (`https://serviceopera.to`).
3. Netlify site name.
4. Confirmation that all acceptance criteria pass, as a checklist.
5. Demo credentials reminder: `demo` / `demo`.
6. One-line summary of how to add a new prospect.

No extra prose. No marketing language. No emoji.
