#!/usr/bin/env bash
# Deploy this API to the Oracle Cloud VM running the systemd `rembg` service.
#
#   ./deploy.sh            # uses the `rembg` SSH host alias
#   ./deploy.sh user@host  # or an explicit SSH target
#
# Server layout (provisioned once): venv at /opt/rembg, code at
# /opt/rembg/current, model cache at /opt/rembg/models, unit rembg.service
# (uvicorn app.main:app on 127.0.0.1:5000), nginx terminating TLS in front.
# Restart logic lives in deploy/remote-restart.sh (unmasks / restores the unit).
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
ssh "$TARGET" bash /opt/rembg/current/deploy/remote-restart.sh
echo "✓ deployed"
