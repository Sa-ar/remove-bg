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
| UI | Vercel Git integration (root `apps/web`). CLI workflow needs a valid `VERCEL_TOKEN`. |

If the GitHub Actions `VERCEL_TOKEN` is invalid, rotate it in GitHub secrets. Do not paste tokens into chat.

## Smoke

1. Sign in at https://www.rembg.site → badge **Worker ready** (no CORS errors in the console).
2. Drop a photo; timeout ≥ 120s after a restart.
3. `curl` with a dashboard key and `--max-time 120`.
