# Remove BG

High-quality background removal with a web UI and an HTTP API other projects can call.

| Piece | Stack | Free deploy |
| --- | --- | --- |
| API | FastAPI + [rembg](https://github.com/danielgatis/rembg) BiRefNet | Always-on VM (Oracle Cloud), systemd + nginx |
| UI | Next.js | [Vercel Hobby](https://vercel.com/docs/accounts/plans/hobby) |

Uploads go **directly to the API** (not through Vercel) so 10MB+ photos work on the Hobby body limit.

## Local development

### API

```bash
cd apps/api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

Or with Docker:

```bash
cp apps/api/.env.example apps/api/.env
docker compose up --build
# API on http://localhost:8000
```

### Web

```bash
cd apps/web
cp .env.example .env.local
npm install
npm run dev
# http://localhost:3000
```

Use the **same** `UI_TOKEN_SECRET` in `apps/api/.env` and `apps/web/.env.local`.

## API usage

```bash
curl -X POST "http://localhost:8000/v1/remove" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "file=@./photo.jpg" \
  --max-time 120 \
  -o removed.png
```

- Auth: `Authorization: Bearer <key>` from `API_KEYS`, or a short-lived UI JWT
- Success: `image/png` with alpha
- Errors: `{ "error", "code", "hint" }`
- OpenAPI: `/docs`

**Cold start:** The VM stays on, so there is no idle sleep. After a deploy/restart the model takes ~10–20s to load; `GET /v1/health` returns `503` with `code=waking` until it is ready. Keep client timeouts ≥ 120s: CPU inference is typically 10–40s per image.

## Free deploy

### 1. API (Oracle Cloud VM)

Provisioned once on an always-on VM: Python venv at `/opt/rembg`, code at `/opt/rembg/current`, model cache at `/opt/rembg/models`, systemd unit `rembg.service` (uvicorn on `127.0.0.1:5000`), nginx terminating HTTPS on `443` and proxying to it.

1. Set `/opt/rembg/current/.env`: `API_KEYS`, `UI_TOKEN_SECRET`, `WEB_ORIGIN` (the Vercel URL), `MODEL=birefnet-general`.
2. Deploy from `apps/api`: `./deploy.sh` (rsync + install + model prefetch + restart).
3. HTTPS: point a subdomain at the VM's IP, then `sudo certbot --nginx -d api.example.com`.
4. Confirm `GET https://api.example.com/v1/health`.

CPU inference on the VM is typically 10–40s per image.

### 2. Vercel (UI)

1. Import the GitHub repo; set root directory to `apps/web`.
2. Env:
   - `NEXT_PUBLIC_API_URL=https://<user>-<space>.hf.space`
   - `UI_TOKEN_SECRET=` (same value as the Space)
3. Deploy, then put the Vercel origin into Space `WEB_ORIGIN` and restart the Space if needed.

### 3. CI/CD (GitHub Actions)

Workflows in `.github/workflows/`:

| Workflow | Trigger | Purpose |
| --- | --- | --- |
| `ci.yml` | push/PR to `main` | Web lint+build, API compile check |
| `deploy-oracle.yml` | push to `apps/api/**` or manual | rsync `apps/api` → Oracle VM + restart service |
| `deploy-vercel.yml` | push to `apps/web/**` or manual | CLI production deploy (optional) |

**GitHub Actions secrets** (Settings → Secrets → Actions):

| Secret | Used by | Notes |
| --- | --- | --- |
| `ORACLE_HOST` | API deploy | VM public IP or host |
| `ORACLE_USER` | API deploy | SSH user, e.g. `ubuntu` |
| `ORACLE_SSH_KEY` | API deploy | Private key with access to the VM (enables CI deploy) |
| `ORACLE_APP_DIR` | API deploy | Optional; defaults to `/opt/rembg/current` |
| `VERCEL_TOKEN` | Optional Vercel CLI | From vercel.com/account/tokens |
| `VERCEL_ORG_ID` | Optional Vercel CLI | From `.vercel/project.json` after `vercel link` |
| `VERCEL_PROJECT_ID` | Optional Vercel CLI | Same |

After linking the GitHub repo in the Vercel dashboard (root `apps/web`), pushes to `main` deploy the UI automatically even without `VERCEL_*` secrets.

### Smoke test

1. Open the Vercel URL, drop a photo (after idle, expect “Waking worker…”).
2. `curl` with a Bearer key and `--max-time 120`.

## Out of scope (this iteration)

No accounts, billing, key dashboard, image storage, batch/video, background replacement, RMBG-2.0 (CC BY-NC), `birefnet-massive` on free hardware, GPU hosts, or SDKs. See the product plan for the full list.

## License

MIT for this repo. BiRefNet weights used via rembg are MIT-licensed (ZhengPeng7/BiRefNet).
