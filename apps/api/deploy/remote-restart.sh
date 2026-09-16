#!/usr/bin/env bash
# Run on the Oracle VM after rsync of apps/api → /opt/rembg/current.
# Installs deps, warms the default model, unmasks/restores rembg.service,
# restarts, and waits for local health.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=ensure-rembg-unit.sh
. "${HERE}/ensure-rembg-unit.sh"

HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:5000/v1/health}"

echo "=== pip + model warm ==="
/opt/rembg/bin/pip install --no-input -q -r /opt/rembg/current/requirements.txt
MODEL="$(grep -E '^MODEL=' /opt/rembg/current/.env | cut -d= -f2- || true)"
MODEL="${MODEL:-isnet-general-use}"
U2NET_HOME=/opt/rembg/models /opt/rembg/bin/python -c "from rembg import new_session; new_session(\"${MODEL}\")"

ensure_rembg_unit

# Mask without --now leaves an orphan uvicorn on :5000. Health would then
# pass against the old process while rembg.service fails to bind.
if ! systemctl is-active --quiet rembg.service; then
  stale_pid="$(ss -lntp 2>/dev/null | awk '/:5000 / {print}' | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -1 || true)"
  if [[ -z "${stale_pid}" ]] && command -v fuser >/dev/null 2>&1; then
    stale_pid="$(sudo fuser 5000/tcp 2>/dev/null | awk '{print $1}' | head -1 || true)"
  fi
  if [[ -n "${stale_pid}" ]]; then
    stale_cmd="$(ps -p "$stale_pid" -o cmd= 2>/dev/null || true)"
    echo "port 5000 held by pid=${stale_pid} cmd=${stale_cmd} while rembg.service is inactive"
    if echo "$stale_cmd" | grep -qE 'uvicorn|/opt/rembg'; then
      echo "stopping stale listener ${stale_pid}"
      sudo kill "$stale_pid" || true
      sleep 2
    fi
  fi
fi

if ! sudo systemctl restart rembg.service; then
  echo "systemctl restart rembg.service failed"
  dump_unit_state
  sudo systemctl status rembg.service --no-pager || true
  sudo journalctl -u rembg.service -n 40 --no-pager || true
  exit 1
fi

if ! systemctl is-active --quiet rembg.service; then
  echo "rembg.service is not active after restart"
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
