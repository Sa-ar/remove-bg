# Runbook

Diagnose production without guessing. The Oracle worker is often healthy when the UI says it is not.

## Canonical URLs

- UI: https://www.rembg.site (apex `https://rembg.site` 308s to www)
- API: https://api.rembg.site
- Vercel project URL: https://remove-bg-five-topaz.vercel.app (keep on the CORS list)

## "Worker down" / "Waking worker…"

The homepage polls `GET ${NEXT_PUBLIC_API_URL}/v1/health` from the **browser**. Failures look the same as a dead VM.

### 1. Is the API actually up?

```bash
curl -sS -i --max-time 20 https://api.rembg.site/v1/health
```

- `200 {"status":"ok",...}` — worker is ready. The bug is almost certainly **CORS**.
- `503` with `code=waking` — model still loading after a restart. Wait and retry.
- Timeout / connection refused — VM, nginx, iptables, or DNS.

### 2. CORS (custom domain)

A healthy API that omits `Access-Control-Allow-Origin` for `https://www.rembg.site` is what users see as "worker not available".

```bash
curl -sS -D - -o /dev/null \
  -H "Origin: https://www.rembg.site" \
  https://api.rembg.site/v1/health
```

Expect `access-control-allow-origin: https://www.rembg.site`.

Code always allows www, apex, and the Vercel project URL. If production still fails, the running process is an old deploy — push `apps/api` to `main` or rsync + `sudo systemctl restart rembg.service`.

Optional box env (never overwritten by rsync):

```bash
# /opt/rembg/current/.env
WEB_ORIGIN=https://www.rembg.site
EXTRA_CORS_ORIGINS=https://rembg.site,https://remove-bg-five-topaz.vercel.app
```

Then `sudo systemctl restart rembg.service`.

GitHub secret `WEB_ORIGIN` should be `https://www.rembg.site`.

### 3. systemd / nginx on the VM

```bash
ssh ubuntu@84.13.79.22
sudo systemctl status rembg.service nginx
sudo journalctl -u rembg.service -n 80 --no-pager
curl -fsS http://127.0.0.1:5000/v1/health
```

Port 80/443 must be open in **both** the VCN security list and guest iptables.

### 4. DNS / IP

Ephemeral public IP (`84.13.79.22`) survives stop/start and is released on **terminate**. Do not terminate the instance.

## Auth / dashboard

- Logged-out `/` and `/dashboard` must redirect to `/auth/sign-in`.
- `/docs` stays public.
- `POST /api/token` without a session returns 401.
- Dashboard lists only `projects.owner_id = <signed-in user>`.

If sign-in fails: check Vercel `NEON_AUTH_BASE_URL` / `NEON_AUTH_COOKIE_SECRET` and Neon Auth trusted domains (`https://www.rembg.site`, `http://localhost:3000`). See [auth.md](./auth.md).

## Deploys

| Path | How |
| --- | --- |
| API | `.github/workflows/deploy-oracle.yml` on `apps/api/**` → rsync `/opt/rembg/current` (skips `.env`) → pip → restart |
| UI | Vercel Git integration (root `apps/web`). Optional CLI workflow skips on push if `VERCEL_TOKEN` is missing or rejected. |

If the GitHub Actions `VERCEL_TOKEN` is invalid, the push job stays green and Git integration still deploys. Rotate the secret to re-enable CLI deploys. Do not paste tokens into chat.

## Monitoring

`.github/workflows/uptime-api.yml` polls `GET https://api.rembg.site/v1/health` every 15 minutes (and on **Actions → API uptime → Run workflow**). Timeout is 25s. Uses only `GITHUB_TOKEN` (`issues: write`, `contents: read`). No SaaS keys.

| Probe result | What happens |
| --- | --- |
| HTTP `200` and JSON `status=ok` | Healthy. If an open `uptime` issue exists, it is commented and closed. |
| HTTP `503` and JSON `code=waking` | Soft / recoverable (model still loading). No issue on the first two consecutive waking checks. A third waking in a row is treated as stuck and alerts. |
| Timeout, connection error, non-200, `503` that is not `waking` (including `model_error`), or unexpected body | Hard failure — alert immediately. |

**Alert:** one open GitHub Issue, title `API uptime: api.rembg.site unhealthy`, label `uptime`. Later failures **edit that same issue** (no comment spam). The job also fails so the Actions run is red.

**Recovery:** the next healthy check comments `Recovered at <UTC>…` and closes the issue (`completed`).

Consecutive waking counts live in the Actions cache (`.uptime-state`). A cache miss starts the streak at 1 (no false page). An already-open uptime issue is still updated if the API is not `ok`.

### Manual run

1. Repo **Actions** → **API uptime** → **Run workflow**.
2. `workflow_dispatch` is available only after this workflow exists on the default branch (`main`).
3. If the workflow is missing from the Actions list: enable Actions under **Settings → Actions → General**. Schedules do not run from a PR branch.
4. GitHub may delay cron a few minutes. Schedules pause after ~60 days of repository inactivity until the next push.

### Silence / disable

- **Silence alerts:** Actions → **API uptime** → ⋯ → **Disable workflow**. Re-enable the same way. Closing the issue does **not** stop the next hard failure from opening a new one.
- **Mute mail:** watch the repo for Issues only (or unsubscribe from the `uptime` issue) if you do not want every red scheduled run.

This monitor does **not** check CORS. A `200` health with a missing `Access-Control-Allow-Origin` still looks like **Worker down** in the browser — see above.

## Smoke

1. Sign in at https://www.rembg.site → badge **Worker ready** (no CORS errors in the console).
2. Drop a photo; timeout ≥ 120s after a restart.
3. `curl` with a dashboard key and `--max-time 120`.
