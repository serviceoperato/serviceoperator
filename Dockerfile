# Static site + security headers. Railway sets PORT at runtime; we inject it into
# nginx config here (official nginx ${PORT} templates are unreliable with Railway).
# Bump: trigger fresh Railway deploy when HTTP logs / routing look stale after a green build.

FROM nginx:alpine

RUN rm -f /etc/nginx/conf.d/default.conf

COPY docker/nginx.site.conf /etc/nginx/nginx.site.conf
COPY docker/entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

# Statici serviti da nginx (root + cartelle referenziate da index / client / admin).
COPY index.html client.html styles.css app.js robots.txt 404.html \
  theme.js debug.js logo-icon.svg logo.svg favicon.png \
  admin.html admin.js admin-config.js admin-config.example.js \
  /usr/share/nginx/html/
COPY clinics /usr/share/nginx/html/clinics/
RUN test -f /usr/share/nginx/html/index.html \
    && test -f /usr/share/nginx/html/debug.js \
    && test -f /usr/share/nginx/html/theme.js \
    && test -f /usr/share/nginx/html/client.html \
    && test -f /usr/share/nginx/html/clinics/demo.html \
    && ls -la /usr/share/nginx/html/

ENTRYPOINT ["/entrypoint.sh"]
