# Remove BG API

FastAPI + `rembg` background removal worker.

Default model on Oracle: `isnet-general-use` (fast). Callers can pass multipart
`model=birefnet-general` for higher quality (much slower on CPU).

Deployed as systemd `rembg.service` (uvicorn on `127.0.0.1:5000`) behind nginx
TLS at **https://api.rembg.site**. See [`deploy.sh`](./deploy.sh).

## Configuration

Read from `/opt/rembg/current/.env` (not overwritten by deploys):

- `API_KEYS` — comma-separated Bearer keys for other projects
- `UI_TOKEN_SECRET` — shared with the Vercel web app (UI upload JWTs)
- `WEB_ORIGIN` — primary CORS origin (`https://www.rembg.site` in production)
- `EXTRA_CORS_ORIGINS` — optional comma-separated extra origins
- Production also always allows `https://www.rembg.site`, `https://rembg.site`, and the Vercel project URL
- `MODEL` — default rembg session (default `isnet-general-use`)
- `ALLOWED_MODELS` — optional allow-list (default includes isnet + birefnet)
- `DAILY_QUOTA_PER_PROJECT` — integer daily cap per project (default `50`, UTC day). Fail-open if `usage_events` cannot be read.

## Endpoints

- `GET /v1/health` — `200` when ready, `503 code=waking` while loading (no quota check)
- `POST /v1/remove` — multipart `file` (+ optional `crop`, `model`) → PNG with alpha
- Auth: `Authorization: Bearer <API_KEY|ui-jwt>` (UI JWT requires a signed-in website session)
- Limits: 30/minute (`rate_limited`), one in-flight inference (`busy`), 50/project/UTC day (`quota_exceeded`)
- Docs: `/docs`

## Deploy

```bash
./deploy.sh            # SSH host alias `rembg`
./deploy.sh user@host
```

CI: `.github/workflows/deploy-oracle.yml` on pushes to `apps/api/**`
(secrets: `ORACLE_HOST`, `ORACLE_USER`, `ORACLE_SSH_KEY`). The workflow
unmasks `rembg.service` if needed and installs `deploy/rembg.service` when
the unit fragment is missing.

## Local

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

Or from repo root: `docker compose up --build`.

## Optional database

When `DATABASE_URL` is set, Bearer keys can resolve to Neon-backed project keys,
usage events are recorded, and the daily per-project quota is enforced from
`usage_events`. Without it, only env `API_KEYS` and UI JWTs work, and the quota
check fails open (allows the request). See [docs/quotas.md](../../docs/quotas.md).
