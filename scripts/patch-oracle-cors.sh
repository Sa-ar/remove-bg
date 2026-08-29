#!/usr/bin/env bash
# Patch CORS on the Oracle VM so www.rembg.site can call the API.
# rsync never overwrites /opt/rembg/current/.env — this is the env-side fix.
# Code also hardcodes these origins; prefer a deploy of apps/api as well.
set -euo pipefail
HOST="${1:-ubuntu@84.13.79.22}"
ssh "$HOST" 'bash -s' <<'REMOTE'
set -euo pipefail
ENV=/opt/rembg/current/.env
test -f "$ENV"
python3 - <<'PY'
from pathlib import Path
p = Path("/opt/rembg/current/.env")
text = p.read_text()
lines = [ln for ln in text.splitlines() if not ln.startswith("WEB_ORIGIN=") and not ln.startswith("EXTRA_CORS_ORIGINS=")]
lines.append("WEB_ORIGIN=https://www.rembg.site")
lines.append("EXTRA_CORS_ORIGINS=https://rembg.site,https://remove-bg-five-topaz.vercel.app")
p.write_text("\n".join(lines) + "\n")
PY
sudo systemctl restart rembg.service
REMOTE
echo "Restarted rembg. Verify:"
echo "  curl -sI -H 'Origin: https://www.rembg.site' https://api.rembg.site/v1/health"
