#!/usr/bin/env bash
# systemd ExecStart helper for rembg.service.
# Sources /opt/rembg/current/.env so DATABASE_URL and other secrets are in
# the process environment (app.db reads DATABASE_URL at import time).
set -euo pipefail

cd /opt/rembg/current
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi
export U2NET_HOME="${U2NET_HOME:-/opt/rembg/models}"
exec /opt/rembg/bin/uvicorn app.main:app --host 127.0.0.1 --port 5000
