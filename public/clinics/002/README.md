# SEA Clinic Pattaya Audit Pack

Generated: 2026-05-11

This ZIP contains a public-data audit pack for a demo page on www.serviceopera.to.

## What is inside

- `data/clinic_profile.json` — clinic profile, contact channels and public positioning
- `data/services.json` + `data/services.csv` — service catalog and automation angles
- `data/price_signals.json` + `data/price_signals.csv` — public pricing and marketplace signals
- `data/competitor_benchmark.json` + `.csv` — competitor snapshot
- `data/audit_scores.json` — inferred colored-line chart data
- `data/automation_opportunities.json` — suggested AI systems
- `components/SeaClinicAuditSection.tsx` — ready React/Tailwind component
- `components/seaClinicAuditData.ts` — TypeScript data import
- Chart SVGs live in `public/assets/` (`audit_lines.svg`, `automation_funnel.svg`, `competitor_radar.svg`) and are referenced from this page.
- `content/*.md` — report copy and landing page copy
- `cursor_prompt.md` — prompt to paste into Cursor

## Important

This is based on public information only. It is a demo/prospecting report, not an internal analytics report.

Before sending it to the clinic, refresh:
- Google rating
- Google review count
- competitor prices
- social follower counts
- opening hours
- WhatsApp / LINE links
- current promotions

Use approved APIs or manual verification. Do not scrape private, login-only, blocked, or sensitive data.
