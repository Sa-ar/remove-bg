#!/usr/bin/env bash
# Run on the Oracle VM after rsync. Installs deps, warms the default model,
# unmasks/restores rembg.service if needed, restarts, and waits for health.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=ensure-rembg-unit.sh
. "${HERE}/ensure-rembg-unit.sh"

HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:5000/v1/health}"
LISTEN_PORT="${LISTEN_PORT:-5000}"

/opt/rembg/bin/pip install --no-input -q -r /opt/rembg/current/requirements.txt
MODEL="$(grep -E '^MODEL=' /opt/rembg/current/.env | cut -d= -f2- || true)"
MODEL="${MODEL:-isnet-general-use}"
U2NET_HOME=/opt/rembg/models /opt/rembg/bin/python -c "from rembg import new_session; new_session(\"${MODEL}\")"

ensure_rembg_unit

# Mask without --now can leave an orphan listener on :5000 that systemd no
# longer tracks. Free it so the restored unit can bind.
if ! systemctl is-active --quiet rembg.service; then
  if command -v fuser >/dev/null 2>&1 && sudo fuser "${LISTEN_PORT}/tcp" >/dev/null 2>&1; then
    echo "freeing stale listener on :${LISTEN_PORT} (unit inactive after mask)"
    sudo fuser -k "${LISTEN_PORT}/tcp" || true
    sleep 2
  fi
fi

if ! sudo systemctl restart rembg.service; then
  echo "restart failed"
  dump_unit_state
  sudo systemctl status rembg.service --no-pager || true
  sudo journalctl -u rembg.service -n 40 --no-pager || true
  exit 1
fi

for i in $(seq 1 40); do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    echo "healthy after ${i} attempts"
    curl -fsS "$HEALTH_URL"
    echo
    exit 0
  fi
  sleep 3
done

echo "health check timed out"
dump_unit_state
sudo journalctl -u rembg.service -n 40 --no-pager
exit 1
