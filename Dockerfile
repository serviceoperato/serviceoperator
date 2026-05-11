# Static site + security headers. Railway sets PORT at runtime; we inject it into
# nginx config here (official nginx ${PORT} templates are unreliable with Railway).
# Bump: trigger fresh Railway deploy when HTTP logs / routing look stale after a green build.

FROM nginx:alpine

RUN rm -f /etc/nginx/conf.d/default.conf

COPY docker/nginx.site.conf /etc/nginx/nginx.site.conf
COPY docker/entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

# Elenco esplicito: se un file manca nel contesto di build, Docker fallisce subito (non “in silenzio”).
COPY index.html client.html styles.css app.js robots.txt 404.html /usr/share/nginx/html/
RUN test -f /usr/share/nginx/html/index.html \
    && test -f /usr/share/nginx/html/client.html \
    && test -f /usr/share/nginx/html/styles.css \
    && test -f /usr/share/nginx/html/app.js \
    && test -f /usr/share/nginx/html/robots.txt \
    && test -f /usr/share/nginx/html/404.html \
    && ls -la /usr/share/nginx/html/

ENTRYPOINT ["/entrypoint.sh"]
