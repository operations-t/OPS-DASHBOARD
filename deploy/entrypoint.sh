#!/bin/sh
set -e

# Optional password protection: set BASIC_AUTH_USER and BASIC_AUTH_PASSWORD in Coolify.
if [ -n "$BASIC_AUTH_USER" ] && [ -n "$BASIC_AUTH_PASSWORD" ]; then
  printf '%s:%s\n' "$BASIC_AUTH_USER" "$(openssl passwd -apr1 "$BASIC_AUTH_PASSWORD")" > /etc/nginx/.htpasswd
  printf 'auth_basic "Operations dashboard";\nauth_basic_user_file /etc/nginx/.htpasswd;\n' > /etc/nginx/auth.conf
  echo "Password protection on for user $BASIC_AUTH_USER"
else
  : > /etc/nginx/auth.conf
fi

# Refresh loop: download Drive folders and rebuild data.json. A failed run keeps the last good data.
(
  while true; do
    python3 /app/scripts/build_data.py || echo "Refresh failed; keeping the last good data."
    sleep $(( ${REFRESH_MINUTES:-60} * 60 ))
  done
) &

exec nginx -g 'daemon off;'
