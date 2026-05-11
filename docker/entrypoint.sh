#!/bin/sh
set -e
PORT="${PORT:-8080}"
sed "s/__PORT__/${PORT}/g" /etc/nginx/nginx.site.conf > /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'
