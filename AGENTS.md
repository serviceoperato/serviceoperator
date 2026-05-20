# AGENTS.md

## Cursor Cloud specific instructions

### Overview

ServiceOpera is a Node.js/Express B2B SaaS platform (`server.mjs`) serving static HTML pages from `public/` plus REST APIs (`/api/*`). A separate Next.js app under `app/` handles pricing and operator report pages.

### Running services

| Service | Command | Port | Notes |
|---------|---------|------|-------|
| Express server (main) | `npm start` | 8080 (default) | Requires `PORTAL_JWT_SECRET` env var. Set `DEMO_PORTAL_ACCOUNTS` JSON for demo login on `/client.html`. |
| Next.js dev server | `npm run dev:next` | 3000 | For `app/` pages (pricing, operator reports). Independent of Express server. |

### Required environment variables (minimum for local dev)

```
PORT=8080
PORTAL_JWT_SECRET=dev-secret-for-local-testing-only
DATA_DIR=./data
```

For demo client workspace login (`/client.html`), also set:
```
DEMO_PORTAL_ACCOUNTS='{"demo":{"password":"demo","slug":"demo-property","business":"Demo Property · Thailand"}}'
```

Pass these inline or create a `.env` file (gitignored). Note: `server.mjs` does **not** use dotenv — env vars must be passed via shell environment or process manager.

### Testing

- `npm run test:site-appearance` — tests site appearance JSON persistence (runs against the file system, no server needed).
- No ESLint or Prettier is configured in the main project.
- `npx tsc --noEmit` will report errors from `telegram-cursor-bot/` (separate sub-project with its own deps); the main app's TypeScript is correct.
- `npm run build:next` fails due to the telegram sub-project being in `tsconfig.json` include scope — this is a known repo issue, not a code defect.

### Gotchas

- The server does **not** use dotenv; you must pass env vars via the shell (e.g., `PORT=8080 PORTAL_JWT_SECRET=... npm start`).
- `admin.html` intentionally returns HTTP 404 when `ADMIN_PASSWORD_HASH` is not configured — the file still serves its content (used for detection by frontend JS).
- PostgreSQL is optional; without `DATABASE_URL`, the server falls back to JSON files in `DATA_DIR`.
- The `telegram-cursor-bot/` directory is a separate sub-project — run `npm install` inside it separately if needed.
- The `prestart` script runs `sync:version` which writes `public/app-version.json` — this is normal and expected.
