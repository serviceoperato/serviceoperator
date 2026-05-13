# Service Opera — Analisi Completa della Piattaforma

**Autore:** Jack · `jack@serviceopera.to`  
**Dominio:** www.serviceopera.to  
**Data analisi:** 13 maggio 2026  
**Scopo:** Documentazione tecnica + comunicazione stakeholder

---

## 1. CHE COSA È SERVICE OPERA (La tesi)

Service Opera è una **piattaforma di automazione AI per operazioni di servizio** rivolta a imprese B2B in tre settori specifici (ospitalità, sanità, gestione proprietà) geograficamente concentrate in Thailandia. Non è un SaaS generico; è un **sistema di consulenza + dimostrazione + esecuzione**: Jack (fondatore + unico operatore) costruisce demo private per prospect, le personalizza sul loro business reale, e se il prospect accetta, gestisce l'automazione in outsourcing a canone mensile.

**Accordo:** questo modello è saggio perché trasforma il risk dal cliente allo specialist. Se non funziona, il cliente non paga.  
**Obiezione (con prova scientifica):** [McKinsey, 2023](https://www.mckinsey.com/capabilities/operations/our-insights/automation-can-boost-productivity-but-dont-ignore-the-change-management) documenta che il 70% dei progetti di automazione fallisce quando manca change management e buy-in operativo. Una demo astratta su carta non cura questo; Service Opera lo affronta con una demo funzionante che il cliente *tocca con mano*.

---

## 2. ARCHITETTURA TECNICA (Come è costruito)

Il sito è costruito in **Next.js + Node.js (Express) + React**, con una struttura ibrida:

### 2.1 Frontend – Stack client-side
- **Landing page pubblica** (`/index.html` o app Next.js): presenta i servizi, il brand, il metodo di lavoro.
- **Portal modale sulla landing**: form di accesso per inserire credenziali client → reindirizza a `/client.html`.
- **Pagina privata demo** (`/client.html`): workspace intero dietro autenticazione basata su SessionStorage (client-side) o server JWT (se ADMIN_PASSWORD_HASH è impostato).
- **Admin console** (`/admin.html`): gestione utenti, inbox, catalogo report, apparenza del sito.
- **Stile unificato**: design system rigoroso in CSS con variabili (nero, bianco, indaco, mono + serif + monospace).

### 2.2 Backend – Stack server-side
- **Server Node.js** (`server.mjs`): serve file statici da `/public`, espone API REST:
  - `/api/admin/login` – login operatore con password hash (scrypt)
  - `/api/admin/capabilities` – verifica di un JWT admin
  - `/api/clinic-users` – CRUD utenti clinica (lettura)
  - `/api/auth/clinic-login` – login paziente/clinica
  - `/api/clinics/report-data` – fetch dati report privati per slug clinica

- **Autenticazione a due livelli:**
  1. **Operatore (Jack):** email + password hash, JWT long-lived (sessionStorage o cookie secure)
  2. **Clienti demo:** sessione (sessionStorage `so_client`, `so_business`, `so_clinic_jwt`)

- **Dati persistenti:** JSON file-based (`./data/clinic_users.json`) oppure PostgreSQL (con `pg` in package.json, non ancora fully integrated)

- **Email transazionale:** via Resend API (se `RESEND_API_KEY` è impostato):
  - Conferma account clinica
  - Reset password
  - OTP login opzionale

### 2.3 Deployment
- **Opzione A: Netlify** (static) – espone `/public`, no `/api/*`
- **Opzione B: Railway** (Docker + Node) – full-stack, `/api/*` disponibili
- **Opzione C: Cloudflare Pages** (static) + Workers (API) – ibrido
- **DNS:** custom domain `serviceopera.to` via registrar → Netlify ALIAS + SSL auto

---

## 3. I QUATTRO SISTEMI DI AUTOMAZIONE (Cosa vende)

Ogni engagement ruota intorno a uno di questi:

### 3.1 WhatsApp & Booking Concierge (Modulo 01)
**Cosa fa:**  
Un chatbot AI 24/7 su WhatsApp, LINE, web chat che:
- Risponde a domande ospiti in EN, TH, RU, ZH, DE
- Cita tariffe camere
- Conferma appuntamenti (cliniche)
- Prende depositi tramite link Stripe/Omise
- Escala a umano quando serve

**Target:** hotel boutique, cliniche, resort con volume ospiti multilingue.  
**Metriche dimostrate nella demo:** 98.4% ospiti che rispondono entro 30 secondi (vs 4h manuale).

### 3.2 Review Intelligence (Modulo 02)
**Cosa fa:**  
Monitora in real-time Google, Booking.com, Agoda, TripAdvisor:
- Bozza risposte in stile cliente (EN, FR, ZH)
- Flagga problemi operativi (AC rotto = ticket manutenzione)
- Estrae sentiment + topic clustering (cosa piace, cosa no)
- Digest settimanale per management

**Target:** qualsiasi business con reputazione online crittica (hotel, cliniche, ristoranti).  
**Metriche nella demo:** +0.4★ score medio in 30 giorni; sentiment positivo +18%.

### 3.3 Lead Engine & CRM (Modulo 03)
**Cosa fa:**  
Unifica inbound da Meta ads, Google Ads, web form, WhatsApp, referral in una pipeline unica:
- Auto-qualificazione lead (score 0–100)
- Follow-up sequenze automatizzate
- Booking call via Calendly/SimplyBook
- Attribuzione costo-per-booking

**Target:** proprietà che corrono ads, agenzie, operatori con multi-channel.  
**Metriche nella demo:** 142 lead qualificati; pipeline 3.7× vs manuale; 0% lead marcio.

### 3.4 Competitor & Pricing Radar (Modulo 04)
**Cosa fa:**  
Scrape notte competitor Booking/Agoda/OTA in live:
- Monitora rate, occupancy, package
- Segnala finestre di demand (conferenza medica = +18% rate opportunity)
- Raccomanda flex-price
- 1-click push rate su PMS + OTA

**Target:** hotel, resort, strutture dove il pricing è leva critica.  
**Metriche nella demo:** ฿284k di revenue opportunity in 14 giorni (+320/night su 89% occupancy).

---

## 4. IL BUSINESS MODEL (Come guadagna)

### 4.1 Outreach → Discovery
1. Jack identifica prospect target (8–80 key hotel, clinica indipendente, 20–200 porte property manager).
2. Cerca: nome proprietario + email + Instagram/website.
3. Prepara una **demo privata personale** (15-60 minuti di lavoro):
   - Clona `/client.html`
   - Personalizza competitor Pricing Radar con i *veri* 3 competitor del prospect
   - Cambia chat examples, nomi ospiti, event window
   - Crea credentials uniche
4. Invia email cold:
   ```
   Oggetto: A private demo I built for {Business Name}
   
   Body: Ho passato un pomeriggio a costruire una demo privata mostrando 
   come potrebbe sembrare una settimana di service operations dialed-in 
   una volta automatizzata.
   
   → https://serviceopera.to/client.html
   Username: {slug}
   Password: {password}
   ```
5. **Expected conversion:** 1 in 8 to 1 in 12 (il 8–12% dei prospect risponde).

### 4.2 Pilot (14 giorni)
Se il prospect è interessato:
- Scelta di 1 dei 4 sistemi
- Scope fisso, prezzo fisso
- Risultati misurabili
- Se non funziona, stop (no costo al cliente)

### 4.3 Rollout + Retained Operator
Espansione ai 4 sistemi:
- Integrazione PMS, OTA, Meta, Google, Slack
- Jack diventa "operatore ritenuto" con canone mensile
- Ruoli: monitoraggio, optimization, escalation, strategia

**Revenue model:** consulenza iniziale (probabilmente gratuita o soft cost nella demo) → pilota a prezzo fisso → retainer mensile.

---

## 5. I TRE SETTORI TARGET (Chi compra)

### 5.1 Ospitalità (Hospitality)
- **Profilo:** hotel boutique, serviced apartments, pool villa (8–80 keys)
- **Problemi:** booking concierge manuale, review response lento, competitor blind, pricing static
- **Automazioni:** Moduli 01 + 02 + 04 (tutto)
- **Leva economica:** revenue per room è alta (฿2k–5k/night) → ROI su automation chiaro

### 5.2 Sanità & Wellness (Medical & Wellness)
- **Profilo:** clinica dentale, estetica, IVF, wellness retreat (serve clientela medico-turistica internazionale)
- **Problemi:** intake in lingua mista (EN, RU, ZH, AR), appointment booking fragile, follow-up rotto, patient communication
- **Automazioni:** Moduli 01 + 02 + 03 (non radar)
- **Leva economica:** customer lifetime value è altissimo (paziente chirurgia = ฿100k+) → retention e follow-up hanno peso

### 5.3 Property Management (Rental Management, Brokerage)
- **Profilo:** agenzia rental, brokerage, operatore relocation (20–200 doors)
- **Problemi:** lead bleeding (portali + ads), pipeline non hygiene, owner reporting manuale, tenant comms senza tracking
- **Automazioni:** Moduli 03 + 04 (lead engine, competitive intel)
- **Leva economica:** scalabilità senza headcount (growth senza assumere staff) è killer differentiator

---

## 6. IL CICLO DI VITA DELLA DEMO (Come funziona l'esperienza)

### 6.1 Landing page (`/index.html` → Next.js `/`)
- **Layout:** fissa, hero, 4 sistemi, 3-step method, 3 settori, quote, CTA finale, modal portal
- **CTA principale:** "See the work" → scroll a #build
- **CTA secondaria:** "Start a conversation" → mailto Jack
- **Portal entry:** "Client portal →" → apre modal login

### 6.2 Portal Modal (sulla landing)
```
Username: [e.g. amari-resort]
Password: [••••••••]
[Enter →]
```
Se credenziali valide:
- Store sessionStorage: `so_client` (username), `so_business` (nome), `so_clinic_jwt` (optional)
- Redirect a `client.html#slug` dopo 500ms

### 6.3 Client Workspace (`/client.html`)
**Autenticazione gate:**
```
◐ SERVICE OPERA
— PRIVATE WORKSPACE

Welcome back.
This page was built for one business. 
Enter the credentials from Jack's email to open your workspace.

[Username] [Password] [Enter →]
```

**Una volta dentro:**
1. **Hero stats** — 4 KPI:
   - REPLY TIME: 28s (vs 4h 12m manuale)
   - REVIEW SCORE: 4.7/5 (+0.4 last 30d)
   - QUALIFIED LEADS: 142 (3.7× pipeline)
   - REVENUE OPPORTUNITY: ฿284k (next 14 days)

2. **Modulo 01 – WhatsApp & Booking Concierge**
   - Chat interattiva (guest Anna chiede room, bot offre, guest paga, bot conferma)
   - L'utente può scrivere nel chat input e riceve risposte canned
   - Meta: EN · TH · RU · ZH · DE — try it below

3. **Modulo 02 – Review Intelligence**
   - 3 review card (Marc 5★ Google, Elena 3★ Booking, Liu Wei 5★ Agoda ZH)
   - Ogni card mostra testo, bozza risposta redatta, azioni (Approve & Post / Edit / Regenerate)
   - Flag: MAINTENANCE FLAGGED (AC rumoroso = ticket issued)

4. **Modulo 03 – Lead Engine & CRM** (full-width)
   - Tabella 5 lead (Hans DE, Sofia IT, Yuki JP, Aleksei RU, Charles UK)
   - Colonne: NAME | SOURCE | INTENT | SCORE | STAGE | NEXT ACTION
   - Score chip: 94 hot (rust), 88 hot, 71 warm (amber), 66 warm, 42 cold (mute)

5. **Modulo 04 – Competitor & Pricing Radar** (full-width)
   - Tabella 4 property (Your property + 3 competitor)
   - Colonne: NAME | PRICE | DELTA | OCC
   - Callout: "▲ REVENUE OPPORTUNITY · NEXT 14 NIGHTS — Competitors pricing +18% above you..."
   - Button: "Approve in one click and rates push to Cloudbeds and all connected OTAs."

**CTA finale:**
- Eyebrow: "— WHEN YOU'RE READY"
- h2: "If this looks like the workflow you want running, *let's deploy it for real.*"
- Button primary: "Email Jack →" (mailto con soggetto/body precompilato)
- Button secondary: "WhatsApp" (wa.me link)

---

## 7. STACK TECNICO PROFONDO (Tutto il codice)

### 7.1 Frontend
- **HTML/CSS/JS:** semantico, vanilla, nessun framework per la landing statica
- **Next.js (opzionale ma presente in package.json):** se si passa a app server-rendered
- **Styling:** CSS variables + utility classes (`.btn--primary`, `.sector--featured`, etc.)
- **Animazioni:** Framer Motion / vanilla CSS:
  - Hero title: line-by-line rise 0.9s, staggered 130ms
  - Live dot: pulse 2s infinite
  - ◐ mark: 14s linear rotation
  - Marquee: 40s scroll
  - Card hover: 1px lift + color shift

### 7.2 Backend
```
node server.mjs
├─ serve public/ static
├─ POST /api/admin/login
│  └─ Email + password hash (scrypt) → JWT Bearer
├─ GET /api/admin/capabilities
│  └─ Verify JWT → admin features
├─ POST /api/clinic-users
│  └─ Create clinica account (invite-only o self-register con Resend email)
├─ POST /api/auth/clinic-login
│  └─ Email + password → clinic JWT (sessionStorage so_clinic_jwt)
└─ GET /api/clinics/report-data?slug=...
   └─ Serve private report JSON per clinic
```

### 7.3 Data persistence
- **Local dev:** `./data/clinic_users.json` (file JSON, no database)
- **Production (Railway):** PostgreSQL (pg package in dependencies)
- **Schema:** clinic_users table con email, password_hash, clinic_slug, created_at, updated_at, ...

### 7.4 Environment variables (Railway)
```
ADMIN_PASSWORD_HASH=salt:hex  # scrypt hash per Jack
ADMIN_EMAIL=jack@serviceopera.to
PORTAL_JWT_SECRET=long-random-string  # shared secret sign JWT
RESEND_API_KEY=re_...  # optional, Resend.com
RESEND_FROM=ServiceOpera <noreply@domain>
CLINIC_SELF_REGISTER=true  # allow sign-up on /login.html
PUBLIC_ORIGIN=https://serviceopera.to  # for reset links
```

### 7.5 Security headers (Netlify / Railway)
```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
X-Robots-Tag: noindex, nofollow  (su /client.html)
Cache-Control: no-store  (su /client.html)
```

---

## 8. IL FLUSSO DI PERSONALIZZAZIONE (Workflow operativo)

### Passo 1: Identificare prospect
- Cerca hotel boutique (8–80 key), clinica indipendente, property manager 20–200 porte
- Estrai: owner name, email, Instagram, website, 3 competitor diretti

### Passo 2: Clonare + personalizzare demo
Apertura:
- `public/client.html`
- `public/app.js`

Modifiche:
```js
const CREDENTIALS = {
  'amari-resort': { 
    password: 'demo2026', 
    business: 'Amari Resort · Thailand' 
  },
  'serenity-dental': {  // NUOVO
    password: 'demo2026',
    business: 'Serenity Dental Clinic'
  },
};
```

Personalizzazione (15 minuti di lavoro):
- Modulo 04 (Pricing Radar): sostituisci i 3 competitor con i *veri* 3
- Modulo 01 (Chat): cambia "Anna" con nome ospite reale + room type
- Revenue callout: se possibile, drop in un evento reale nella loro finestra (e.g. "Regional Medical Conference March 12–19")

### Passo 3: Inviare email
```
Soggetto: A private demo I built for {Business Name}

Body:
Hi {First name},

I'm Jack — I design and run AI automation systems for hospitality 
and medical operators worldwide. Rather than send another cold pitch, 
I spent an afternoon and built you a private demo workspace showing 
what a dialed-in week of service operations could look like once a 
few workflows are automated.

It's a real working page, not a PDF. Have a look when you have 5 minutes:

→ https://serviceopera.to/client.html
Username: amari-resort
Password: demo2026

If it's useful, reply and we'll talk. If it isn't, no follow-ups — 
you have my word.

Jack
jack@serviceopera.to
serviceopera.to
```

### Passo 4: Attesa + Reply handling
- Conversione attesa: 1 in 8–12 (8–12% reply rate)
- Chi clicca e explore, poi clicca "Email Jack →" in fondo → mailto con pre-filled subject/body
- Jack legge email → scheduled call → sales/discovery

---

## 9. DISTRIBUZIONE TECNICA (Come gira in produzione)

### Opzione A: Netlify (static only)
```
git push origin main
→ Netlify auto-build (no build step)
→ publish directory: public/
→ https://serviceopera.to ✓
→ /api/* routes: NOT available (static-only)
```
**Pro:** free, instant, simple  
**Contro:** operator console JWT + email features richiedono Node

### Opzione B: Railway (full-stack, recommended)
```
1. Dockerfile in repo
   FROM node:20
   COPY . /app
   WORKDIR /app
   RUN npm install
   EXPOSE 3000
   CMD ["npm", "start"]

2. Railway: connect GitHub repo
   → auto-detect Dockerfile
   → set env vars (ADMIN_PASSWORD_HASH, PORTAL_JWT_SECRET, RESEND_API_KEY)
   → deploy

3. Result:
   node server.mjs
   → Serve public/ (static)
   → /api/* routes available
   → POST /api/admin/login works
   → PORT auto-set by Railway (3000 internal, *.railway.app external)

4. DNS: CNAME serviceopera.to → *.railway.app
```
**Pro:** Node.js full-stack, /api/* funzionano, auto-scale, Postgres easy  
**Contro:** 5$/month ballpark

### Opzione C: Cloudflare Pages + Workers
```
Cloudflare Pages: serve public/
Cloudflare Worker: /api/* routes (JS runtime)
KV store: clinic_users data

Ibrido: free static, free API (within limits)
```

---

## 10. PRIVACY & SECURITY (Come proteggere i dati)

### 10.1 Autenticazione
- **Client-side (dev/demo):** SessionStorage `so_client`, no server check → insicuro ma OK per demo content only
- **Server-side (production):** JWT Bearer, ADMIN_PASSWORD_HASH (scrypt), TTL 24h, secure HttpOnly cookie

### 10.2 Dati sensibili
- `/client.html` è hidden da ricerca (`robots.txt Disallow + meta noindex + header X-Robots-Tag`)
- Nessun dato reale nella demo, solo seed content finto
- Quando clienti reali si iscrivono → `/login.html` → clinic_users.json con password hash

### 10.3 HTTPS
- Netlify: SSL auto (Let's Encrypt)
- Railway: SSL auto (Let's Encrypt)
- Custom domain: CNAME/ALIAS → provider handle cert

### 10.4 Rate limiting
- No rate limiting attualmente; Railway + Cloudflare DDoS basic included
- Resend API: throttle built-in per RESEND_API_KEY

---

## 11. METRICHE OSSERVABILI (Cosa misura il sito)

Dalla demo, il prospect vede:

| Metrica | Valore nella demo | Significato |
|---|---|---|
| **REPLY TIME** | 28s | ChatBot 24/7 riduce wait time da 4h 12m a 28s |
| **REVIEW SCORE** | 4.7/5 | +0.4★ in 30 giorni grazie a gestione intelligente reply + sentiment tracking |
| **QUALIFIED LEADS** | 142 | Pipeline chiara; 3.7× più lead qualificati vs. sprawl inbox |
| **REVENUE OPPORTUNITY** | ฿284k | 14 giorni, +18% rate lift su demand window (conference signal) |
| **Competitor delta** | ▼ ฿120 / ▲ ฿350 | Tracking daily per competitor; nightly scrape |
| **Occupancy forecast** | 89% | Predictive: at current rates, OCC è 89% → if lift ฿320, capture ฿284k |

Queste non sono "vanity metrics" random:
- **Reply time** → unico KPI che i clienti veramente sentono (guest experience)
- **Review score** → online reputation è asset tangibile
- **Lead pipeline** → diretto cash flow (booking → revenue)
- **Revenue opportunity** → la "killer line" che fa mandare l'email a Jack

---

## 12. ROADMAP IMPLICITA (Cosa potrebbe fare Service Opera domani)

### 12.1 Near-term (prossimi 6 mesi)
- ✓ Multi-language chat (TH, RU, ZH out-of-box)
- ✓ PMS integration: Cloudbeds, Opera, Mews, SimplyBook
- ✓ PostgreSQL full migration (da JSON file)
- ✓ Real clinic intake forms + case studies

### 12.2 Medium-term (6–12 mesi)
- Marketplace: catalog di pre-built playbook per cliniche, hotel, property managers
- White-label: Jack vende la piattaforma a altri consultant
- Mobile app: iOS/Android client per review + lead management on-the-go
- Advanced analytics: trend, anomaly detection, forecasting

### 12.3 Long-term (12+ mesi)
- Geographic expansion: Vietnam, Indonesia, Singapore, Filippine (same playbook)
- Vertical deepening: banca dati competitor automatica per ogni verticale
- Team scaling: Jack non è più "unico operatore", ma founder di agenzia

---

## 13. LIMITAZIONI ATTUALI (Cosa NON fa)

❌ **Non ha:**
- Blog, case study, pricing page
- Analytics o tracking (no Google Analytics)
- Real customer data (tutto seed/demo)
- Multi-tenant per URL (tutti usano /client.html, key via sessionStorage)
- Mobile app
- Integrazione diretta OTA (rate push è manual "approve in one click", poi Cloudbeds sync)
- API pubblica per partner
- SLA formal
- Team management / role-based access

---

## 14. CONCLUSIONE & POSITIONING

Service Opera **non è un SaaS generico**. È un **sistema di consulenza + dimostrazione + esecuzione** per operator che vogliono scalare automazione nel Southeast Asia senza assumere staff.

**La logica:** la demo privata personale è il *vero* prodotto di vendita. La piattaforma (sito + server) è il *vettore* che lo consegna. Jack spende 15–60 minuti a costruire una demo che il prospect tocca con mano, vede risultati reali (finti dati, ma pattern reale), e se interessato firma un pilota 14gg con ROI stimato.

**Killer feature:** non hai mai visto un demo hotel/clinic/property specifico per *te*, con *i tuoi* competitor e *il tuo* numero (฿284k). Questo è differentiated selling in un mercato di AI agency template identici.

**Stack non è fancy**, ma è **pragmatico**: Node.js, Express, Next.js (optional), PostgreSQL, Resend, Railway. Tutto standard, niente proprietario. Se domani Jack decide di vendere il business, il codice è migrable. Se domani vuole hiring team, l'architettura scala. Se la feature set cambia, HTML/CSS/JS aggiorna facile.

**Tone del brand:** dry, confident, senza "supercharge" o "revolutionize". "Engineered automation, observable results, honest pricing." Non è marketing teatro; è ingegneria.

---

## TABELLA SINOTTICA FINALE

| Aspetto | Dettaglio |
|---|---|
| **Cosa è** | Piattaforma cold-outreach con demo privata personalizzata per hotel/clinica/property |
| **Chi lo usa** | Jack (founder) per inbound sales; prospect (hotel/clinic) per valutare automation |
| **Come entra il prospect** | Email cold + credenziali → `/client.html` con demo custom → "Email Jack" → call |
| **I 4 sistemi** | WhatsApp Concierge, Review Intelligence, Lead Engine CRM, Competitor Radar |
| **3 settori** | Hospitality (8–80 key), Medical & Wellness (clinica), Property Management (20–200 doors) |
| **Tech** | Next.js + Express + React + CSS-in-JS + PostgreSQL (Railway) / Resend (email) |
| **Deployment** | Netlify (static) o Railway (full-stack, recommended) |
| **Security** | JWT + password hash + noindex /client.html + HTTPS + secure headers |
| **Business model** | Cold outreach → free demo → ฿X pilot (14gg) → ฿Y retainer mensile |
| **Conversion rate** | ~8–12% (1 in 8–12 prospect rispondono a email) |
| **KPI killer** | ฿284k revenue opportunity in 14 giorni (la linea che convince a scrivere) |
| **Time to personalize demo** | 15–60 minuti (competitor swap + chat name + event window) |

---

**Fine analisi.**
