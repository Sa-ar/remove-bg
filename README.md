# Remove BG

High-quality background removal with a web UI and an HTTP API other projects can call.

| Piece | Stack | Free deploy |
| --- | --- | --- |
| API | FastAPI + [rembg](https://github.com/danielgatis/rembg) | Oracle Always Free Ampere A1 → **https://api.rembg.site** |
| UI | Next.js | [Vercel Hobby](https://vercel.com/docs/accounts/plans/hobby) → **https://remove-bg-five-topaz.vercel.app** |

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

**Cold / first inference:** After a service restart the model loads into RAM; `GET /v1/health` returns `503` with `code=waking` until ready. Client timeout ≥ 120s. Warm CPU inference is typically a few seconds (`isnet-general-use`).

## Production

- API: https://api.rembg.site — see [`docs/oracle-setup.md`](docs/oracle-setup.md)
- UI: https://remove-bg-five-topaz.vercel.app

### CI/CD (GitHub Actions)

| Workflow | Trigger | Purpose |
| --- | --- | --- |
| `ci.yml` | push/PR to `main` | Web lint+build, API compile check |
| `deploy-oracle.yml` | push `apps/api/**` or manual | rsync + restart systemd on Oracle |
| `sync-vercel-env.yml` | manual | set API URL + `UI_TOKEN_SECRET`, redeploy UI |
| `deploy-vercel.yml` | push `apps/web/**` or manual | optional CLI production deploy |
| `deploy-space.yml` | optional | legacy HF Space sync (skipped without HF secrets) |

**Required Actions secrets for Oracle + Vercel:**

| Secret | Used by |
| --- | --- |
| `ORACLE_HOST` / `ORACLE_USER` / `ORACLE_SSH_KEY` | Oracle deploy |
| `API_KEYS` / `UI_TOKEN_SECRET` / `WEB_ORIGIN` | App config sync helpers |
| `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` | Vercel CLI workflows |

Vercel Git integration (root `apps/web`) still deploys the UI on push to `main`.

### Smoke test

1. Open the Vercel URL, drop a photo (after idle, expect “Waking worker…”).
2. `curl` with a Bearer key and `--max-time 120`.

## Out of scope (this iteration)

No accounts, billing, key dashboard, image storage, batch/video, background replacement, RMBG-2.0 (CC BY-NC), `birefnet-massive` on free hardware, GPU hosts, or SDKs. See the product plan for the full list.

## License

MIT for this repo. BiRefNet weights used via rembg are MIT-licensed (ZhengPeng7/BiRefNet).
