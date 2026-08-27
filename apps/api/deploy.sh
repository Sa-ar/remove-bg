#!/usr/bin/env bash
# Deploy this API to the Oracle Cloud VM running the systemd `rembg` service.
#
#   ./deploy.sh            # uses the `rembg` SSH host alias
#   ./deploy.sh user@host  # or an explicit SSH target
#
# Server layout (provisioned once): venv at /opt/rembg, code at
# /opt/rembg/current, model cache at /opt/rembg/models, unit rembg.service
# (uvicorn app.main:app on 127.0.0.1:5000), nginx terminating TLS in front.
#
# CI: .github/workflows/deploy-oracle.yml (secrets ORACLE_HOST, ORACLE_USER, ORACLE_SSH_KEY)
set -euo pipefail

TARGET="${1:-rembg}"
HERE="$(cd "$(dirname "$0")" && pwd)"

echo "→ syncing code to ${TARGET}:/opt/rembg/current"
rsync -az --delete \
  --exclude '__pycache__' --exclude '*.pyc' \
  --exclude '.env' --exclude '.venv' \
  -e ssh "${HERE}/" "${TARGET}:/opt/rembg/current/"

echo "→ installing deps, prefetching model, restarting service"
ssh "$TARGET" '
  set -e
  /opt/rembg/bin/pip install --no-input -q -r /opt/rembg/current/requirements.txt
  MODEL="$(grep -E "^MODEL=" /opt/rembg/current/.env | cut -d= -f2- || true)"
  MODEL="${MODEL:-isnet-general-use}"
  U2NET_HOME=/opt/rembg/models /opt/rembg/bin/python -c "from rembg import new_session; new_session(\"$MODEL\")"
  sudo systemctl restart rembg.service
  for i in $(seq 1 40); do
    curl -fsS http://127.0.0.1:5000/v1/health >/dev/null 2>&1 && { echo "✓ healthy"; exit 0; }
    sleep 3
  done
  echo "✗ health check timed out"; sudo journalctl -u rembg.service -n 20 --no-pager; exit 1
'
echo "✓ deployed"
