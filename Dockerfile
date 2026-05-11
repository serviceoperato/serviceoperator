# Static site + security headers (aligned with netlify.toml).
# Railway provides PORT; nginx official image envsubst expands ${PORT} from
# /etc/nginx/templates/*.template (nginx vars use $$ in templates).

FROM nginx:alpine

COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY index.html client.html styles.css app.js robots.txt 404.html /usr/share/nginx/html/

EXPOSE 8080
