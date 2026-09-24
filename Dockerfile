# Operations Dashboard for Coolify (or any Docker host).
# Serves the site with nginx and refreshes data from Google Drive every REFRESH_MINUTES.
FROM nginx:1.27-alpine

RUN apk add --no-cache python3 py3-pip openssl tzdata \
 && pip3 install --no-cache-dir --break-system-packages "openpyxl==3.1.5" "gdown>=5.2,<6"

ENV TZ=Asia/Dhaka \
    REFRESH_MINUTES=60 \
    DATA_OUT=/usr/share/nginx/html/data/data.json \
    NETWORK_OUT=/usr/share/nginx/html/data/network.json

COPY index.html /usr/share/nginx/html/
COPY assets /usr/share/nginx/html/assets
COPY data /usr/share/nginx/html/data
COPY scripts /app/scripts
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1/healthz || exit 1
ENTRYPOINT ["/entrypoint.sh"]
