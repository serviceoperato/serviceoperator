# Public contact vs operator identity

## Intentional public contact

Marketing pages, footers, JSON-LD, and `mailto:` links use **`hello@serviceopera.to`** by default (`PUBLIC_CONTACT_EMAIL` on the server, overridable in Railway).

Load at runtime: `GET /api/site-config` → `{ publicContactEmail, operatorIdentity }`.  
Client helper: `public/site-contact.js` (`SoSiteContact.contactMailto`, `applyMailtoAnchors`).

## Not published in HTML/JS bundles

- **`ADMIN_EMAIL`** / operator portal sign-in (`jack@…` or env) — server-only; portal JWT may include `isOperator: true` without exposing the address in static assets.
- **`OPERATOR_CONTACT_EMAIL`** — Resend routing and internal error copy; set via `OPERATOR_CONTACT_EMAIL` or `ADMIN_EMAIL` in env.

## Account UX

- Signed-in users see a short nav label (local-part or “Operator” / “Signed in”), not the full email in the top bar.
- Full email remains on account settings pages after authentication.

## Debug / admin

- `GET /api/debug/user-store` requires admin auth.
- The DEBUG floating panel mounts only under `/admin/*` and `/operator/*`.
- Debug copy masks emails (`***@domain`).

## Search engines

`public/robots.txt` disallows private routes (`/clinics/`, `/login.html`, `/admin/`, `/workspace.html`, etc.). `public/sitemap.xml` lists marketing URLs only.
