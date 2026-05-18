# Public contact vs operator identity

## Intentional public contact (no default inbox)

Marketing pages do **not** publish a public email or `mailto:` link by default. Visitors reach the team via the **48-hour audit request form** at [`/free-audit.html`](/free-audit.html) (homepage form, pricing inquiry, vertical pages).

Runtime config: `GET /api/site-config` → `{ contactFormUrl, operatorIdentity }` and optionally `publicContactEmail` when `PUBLIC_CONTACT_EMAIL` is set in env (advanced; not used on static HTML unless wired explicitly).

Client helper: `public/site-contact.js` (`SoSiteContact.contactFormUrl`, `applyContactAnchors`).

## Not published in HTML/JS bundles

- **`ADMIN_EMAIL`** / operator portal sign-in (`jack@…` or env) — server-only; portal JWT may include `isOperator: true` without exposing the address in static assets.
- **`OPERATOR_CONTACT_EMAIL`** — Resend routing and internal delivery; set via `OPERATOR_CONTACT_EMAIL` or `ADMIN_EMAIL` in env. Used server-side only, never as a public `mailto:` fallback.

## Optional env

- **`PUBLIC_CONTACT_EMAIL`** — If set, exposed in `/api/site-config` for dynamic mailto helpers only. Leave unset for form-only contact UX.
- **`contactFormUrl`** in API defaults to `/free-audit.html`.

## Account UX

- Signed-in users see a short nav label (local-part or “Operator” / “Signed in”), not the full email in the top bar.
- Full email remains on account settings pages after authentication.

## Debug / admin

- `GET /api/debug/user-store` requires admin auth.
- The DEBUG floating panel mounts only under `/admin/*` and `/operator/*`.
- Debug copy masks emails (`***@domain`).

## Search engines

`public/robots.txt` disallows private routes (`/clinics/`, `/login.html`, `/admin/`, `/workspace.html`, etc.). `public/sitemap.xml` lists marketing URLs only. Organization JSON-LD omits `email` unless a verified public inbox exists.
