#!/usr/bin/env bash
# Bootstrap remove-bg API on Oracle Always Free (Ubuntu ARM).
# Run as root on the VM: bash bootstrap-oracle.sh
set -euo pipefail

APP_DIR=/opt/remove-bg
API_DIR="${APP_DIR}/apps/api"
DOMAIN="${DOMAIN:-84.13.79.22.sslip.io}"
WEB_ORIGIN="${WEB_ORIGIN:-https://remove-bg-five-topaz.vercel.app}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo bash $0"
  exit 1
fi

if [[ -z "${API_KEYS:-}" || -z "${UI_TOKEN_SECRET:-}" ]]; then
  echo "Export API_KEYS and UI_TOKEN_SECRET before running."
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl git ufw rsync

# Docker (official)
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

# Firewall
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

mkdir -p "${APP_DIR}"
if [[ ! -d "${APP_DIR}/.git" ]]; then
  git clone https://github.com/Sa-ar/remove-bg.git "${APP_DIR}"
else
  git -C "${APP_DIR}" fetch origin
  git -C "${APP_DIR}" reset --hard origin/main
fi

# Runtime env for API container
cat > "${API_DIR}/.env" <<EOF
API_KEYS=${API_KEYS}
UI_TOKEN_SECRET=${UI_TOKEN_SECRET}
WEB_ORIGIN=${WEB_ORIGIN}
EXTRA_CORS_ORIGINS=https://remove-bg-saars-projects-d2973f9d.vercel.app
MODEL=birefnet-general
EOF
chmod 600 "${API_DIR}/.env"

# Caddyfile for HTTPS (sslip.io → free certs, works with bare IP)
cat > "${APP_DIR}/Caddyfile" <<EOF
${DOMAIN} {
  encode gzip
  reverse_proxy 127.0.0.1:7860

  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Content-Type-Options nosniff
    Referrer-Policy no-referrer
  }
}
EOF

# Compose: API + Caddy
cat > "${APP_DIR}/docker-compose.oracle.yml" <<EOF
services:
  api:
    build:
      context: ./apps/api
      dockerfile: Dockerfile
    env_file:
      - ./apps/api/.env
    restart: unless-stopped
    ports:
      - "127.0.0.1:7860:7860"
    volumes:
      - rembg-models:/models
    healthcheck:
      test:
        [
          "CMD",
          "python",
          "-c",
          "import urllib.request; urllib.request.urlopen('http://127.0.0.1:7860/v1/health')",
        ]
      interval: 30s
      timeout: 10s
      retries: 20
      start_period: 300s

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    depends_on:
      - api

volumes:
  rembg-models:
  caddy-data:
  caddy-config:
EOF

cd "${APP_DIR}"
docker compose -f docker-compose.oracle.yml build
docker compose -f docker-compose.oracle.yml up -d

echo
echo "Deployed."
echo "  Health: https://${DOMAIN}/v1/health"
echo "  Docs:   https://${DOMAIN}/docs"
echo "First model load can take several minutes."
