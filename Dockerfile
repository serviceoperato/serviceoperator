# Node serves /app/public + ServiceOpera API (operator console password JWT, portal email via Resend when configured).
# Railway: ADMIN_PASSWORD_HASH, ADMIN_JWT_SECRET, RESEND_API_KEY (optional ADMIN_EMAIL, DATA_DIR).

FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.mjs clinic-store.mjs postgres-user-store.mjs user-telemetry.mjs ./
COPY lib ./lib/
COPY public ./public/

RUN mkdir -p /app/data \
  && test -f /app/public/index.html \
  && test -f /app/server.mjs \
  && test -f /app/clinic-store.mjs \
  && test -f /app/postgres-user-store.mjs

ENV DATA_DIR=/app/data

ENTRYPOINT ["node", "server.mjs"]
