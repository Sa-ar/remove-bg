#!/usr/bin/env bash
# Run on the Oracle VM after rsync of apps/api → /opt/rembg/current.
# Recovers a masked or missing rembg.service, then restarts and waits for health.
set -euo pipefail

UNIT=rembg.service
UNIT_SRC=/opt/rembg/current/deploy/rembg.service
UNIT_DST=/etc/systemd/system/rembg.service
HEALTH_URL=http://127.0.0.1:5000/v1/health

echo "=== systemd before ==="
systemctl is-enabled "$UNIT" || true
systemctl is-active "$UNIT" || true
systemctl is-masked "$UNIT" || true
ls -l "$UNIT_DST" /lib/systemd/system/"$UNIT" /usr/lib/systemd/system/"$UNIT" 2>/dev/null || true
ps -eo user,pid,cmd | grep -E '[u]vicorn|[r]embg' || true

echo "=== pip + model warm ==="
/opt/rembg/bin/pip install --no-input -q -r /opt/rembg/current/requirements.txt
MODEL="$(grep -E '^MODEL=' /opt/rembg/current/.env | cut -d= -f2- || true)"
MODEL="${MODEL:-isnet-general-use}"
U2NET_HOME=/opt/rembg/models /opt/rembg/bin/python -c "from rembg import new_session; new_session(\"${MODEL}\")"

unit_is_masked() {
  systemctl is-masked "$UNIT" >/dev/null 2>&1
}

unit_has_real_fragment() {
  local path
  path="$(systemctl show -p FragmentPath --value "$UNIT" 2>/dev/null || true)"
  if [[ -z "$path" || "$path" == /dev/null ]]; then
    return 1
  fi
  if [[ -L "$path" && "$(readlink -f "$path")" == /dev/null ]]; then
    return 1
  fi
  [[ -f "$path" ]]
}

if unit_is_masked; then
  echo "::warning::${UNIT} is masked; unmasking so deploy can restart the API"
  sudo systemctl unmask "$UNIT"
fi

if unit_is_masked; then
  echo "${UNIT} is still masked after unmask (sudo/permissions?)"
  exit 1
fi

if ! unit_has_real_fragment; then
  echo "installing ${UNIT} from ${UNIT_SRC} as $(id -un):$(id -gn)"
  test -f "$UNIT_SRC"
  test -x /opt/rembg/current/deploy/run-api.sh
  tmp="$(mktemp)"
  sed -e "s/^User=ubuntu$/User=$(id -un)/" -e "s/^Group=ubuntu$/Group=$(id -gn)/" \
    "$UNIT_SRC" > "$tmp"
  sudo install -m 644 "$tmp" "$UNIT_DST"
  rm -f "$tmp"
  sudo systemctl daemon-reload
  sudo systemctl enable "$UNIT"
else
  echo "using existing unit fragment $(systemctl show -p FragmentPath --value "$UNIT")"
fi

# A leftover uvicorn from before the unit was masked can hold :5000 so a new
# systemd start looks healthy (old process) while rembg.service is actually failed.
stale_pid="$(ss -lntp 2>/dev/null | awk '/:5000 / {print}' | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -1 || true)"
if [[ -n "${stale_pid}" ]] && ! systemctl is-active --quiet "$UNIT"; then
  stale_cmd="$(ps -p "$stale_pid" -o cmd= 2>/dev/null || true)"
  echo "port 5000 held by pid=${stale_pid} cmd=${stale_cmd} while ${UNIT} is inactive"
  if echo "$stale_cmd" | grep -qE 'uvicorn|/opt/rembg'; then
    echo "stopping stale listener ${stale_pid}"
    sudo kill "$stale_pid" || true
    sleep 2
  fi
fi

if ! sudo systemctl restart "$UNIT"; then
  echo "systemctl restart ${UNIT} failed"
  sudo systemctl status "$UNIT" --no-pager || true
  sudo journalctl -u "$UNIT" -n 40 --no-pager || true
  exit 1
fi

if ! systemctl is-active --quiet "$UNIT"; then
  echo "${UNIT} is not active after restart"
  sudo systemctl status "$UNIT" --no-pager || true
  sudo journalctl -u "$UNIT" -n 40 --no-pager || true
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
sudo systemctl status "$UNIT" --no-pager || true
sudo journalctl -u "$UNIT" -n 40 --no-pager
exit 1
