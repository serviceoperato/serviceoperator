# Node serves /app/public + ServiceOpera API (operator console password JWT, portal email via Resend when configured).
# Railway (each service that runs this image): PORTAL_JWT_SECRET or ADMIN_JWT_SECRET — required when RAILWAY_ENVIRONMENT is set or the process exits before listen (/api/version healthcheck fails).
# Also: ADMIN_PASSWORD_HASH (operator login), RESEND_API_KEY, DATABASE_URL (optional; if Postgres init fails, server falls back to JSON under DATA_DIR with an error log).

FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.mjs clinic-store.mjs postgres-user-store.mjs postgres-site-appearance.mjs user-telemetry.mjs lead-events.mjs ./
COPY lib ./lib/
COPY public ./public/

RUN mkdir -p /app/data \
  && test -f /app/public/index.html \
  && test -f /app/server.mjs \
  && test -f /app/clinic-store.mjs \
  && test -f /app/postgres-user-store.mjs \
  && test -f /app/postgres-site-appearance.mjs \
  && test -f /app/lead-events.mjs

ENV DATA_DIR=/app/data

ENTRYPOINT ["node", "server.mjs"]
