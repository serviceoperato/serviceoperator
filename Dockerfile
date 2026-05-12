# Node serves /app/public + admin email OTP (Resend).
# Railway: RESEND_API_KEY, RESEND_FROM, ADMIN_JWT_SECRET (optional ADMIN_EMAIL, DATA_DIR).

FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.mjs clinic-store.mjs ./
COPY lib ./lib/
COPY public ./public/

RUN mkdir -p /app/data \
  && test -f /app/public/index.html \
  && test -f /app/public/admin.html \
  && test -f /app/server.mjs \
  && test -f /app/clinic-store.mjs

ENV DATA_DIR=/app/data

ENTRYPOINT ["node", "server.mjs"]
