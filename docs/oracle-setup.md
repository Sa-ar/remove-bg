# Oracle Always Free API host

Live API: **https://api.rembg.site** (ephemeral public IP `84.13.79.22`, `il-jerusalem-1`).

Stack: `rembg.service` (FastAPI in `/opt/rembg/current`, venv `/opt/rembg`) behind nginx + Certbot. Not Docker.

See also [architecture.md](./architecture.md), [runbook.md](./runbook.md), [auth.md](./auth.md).

## SSH

```bash
ssh ubuntu@84.13.79.22
```

## Public IP

Ephemeral IPs survive **stop/start**. They are released on **terminate**.
Do not "reserve" expecting to keep `84.13.79.22` — Oracle assigns a new address.
Reserve only if you plan to rebuild; then reserve first, then DNS.

## HTTPS

`api.rembg.site` already has a Let's Encrypt cert (Certbot timer). Port 80/443 must be open in **both** the VCN security list and guest iptables.

## CORS

The API always allows:

- `https://www.rembg.site`
- `https://rembg.site`
- `https://remove-bg-five-topaz.vercel.app`
- `WEB_ORIGIN` and `EXTRA_CORS_ORIGINS` from `.env`
- localhost:3000

If the custom domain still cannot read `/v1/health`, the running process is stale. Deploy `apps/api` or run `scripts/patch-oracle-cors.sh ubuntu@84.13.79.22`.

Recommended box env (not overwritten by rsync):

```
WEB_ORIGIN=https://www.rembg.site
EXTRA_CORS_ORIGINS=https://rembg.site,https://remove-bg-five-topaz.vercel.app
```

GitHub secret `WEB_ORIGIN` should match `https://www.rembg.site`.

## CI/CD (GitHub Actions)

| Workflow | When | What |
| --- | --- | --- |
| `deploy-oracle.yml` | push `apps/api/**` or manual | rsync → `/opt/rembg/current`, pip, restart `rembg`, health check |
| `sync-vercel-env.yml` | manual | set `NEXT_PUBLIC_API_URL` + `UI_TOKEN_SECRET`, prod redeploy |
| `deploy-vercel.yml` | push `apps/web/**` | optional CLI prod deploy |
| `ci.yml` | push/PR | lint/build/compile |

**Actions secrets:** `ORACLE_HOST`, `ORACLE_USER`, `ORACLE_SSH_KEY`, `API_KEYS`, `UI_TOKEN_SECRET`, `WEB_ORIGIN`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.

`.env` on the server is **never** overwritten by rsync.

Manual deploy from a laptop:

```bash
cd apps/api && ./deploy.sh ubuntu@84.13.79.22
```

## App wiring

- API CORS: see above (custom domain is required; Vercel URL alone is not enough)
- Web: `NEXT_PUBLIC_API_URL=https://api.rembg.site`, same `UI_TOKEN_SECRET` as the API
- Neon: `DATABASE_URL` on the box (direct) and Vercel (pooled); Auth env on Vercel only

## Safe API use

| Client | Auth |
| --- | --- |
| Browser UI | Short-lived JWT from Next.js `POST /api/token` (signed-in session) |
| Other backends | Dashboard project key, or legacy `API_KEYS` |

Never put long-lived API keys in the browser. Client timeouts ≥ 120s for first inference after restart.
