# Node serves /app/public + admin email OTP (Resend).
# Railway: RESEND_API_KEY, RESEND_FROM, ADMIN_JWT_SECRET (optional ADMIN_EMAIL).

FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.mjs ./
COPY public ./public/

RUN test -f /app/public/index.html \
  && test -f /app/public/admin.html \
  && test -f /app/server.mjs

ENTRYPOINT ["node", "server.mjs"]
