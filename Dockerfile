# Static site + security headers. Railway sets PORT at runtime; we inject it into
# nginx config here (official nginx ${PORT} templates are unreliable with Railway).

FROM nginx:alpine

RUN rm -f /etc/nginx/conf.d/default.conf

COPY docker/nginx.site.conf /etc/nginx/nginx.site.conf
COPY docker/entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

COPY index.html client.html styles.css app.js robots.txt 404.html /usr/share/nginx/html/

ENTRYPOINT ["/entrypoint.sh"]
