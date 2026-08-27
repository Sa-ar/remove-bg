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
- `WEB_ORIGIN` — primary Vercel origin for CORS
- `EXTRA_CORS_ORIGINS` — optional comma-separated extra origins
- `MODEL` — default rembg session (default `isnet-general-use`)
- `ALLOWED_MODELS` — optional allow-list (default includes isnet + birefnet)

## Endpoints

- `GET /v1/health` — `200` when ready, `503 code=waking` while loading
- `POST /v1/remove` — multipart `file` (+ optional `crop`, `model`) → PNG with alpha
- Auth: `Authorization: Bearer <API_KEY|ui-jwt>`
- Docs: `/docs`

## Deploy

```bash
./deploy.sh            # SSH host alias `rembg`
./deploy.sh user@host
```

CI: `.github/workflows/deploy-oracle.yml` on pushes to `apps/api/**`
(secrets: `ORACLE_HOST`, `ORACLE_USER`, `ORACLE_SSH_KEY`).

## Local

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

Or from repo root: `docker compose up --build`.

## Optional database

When `DATABASE_URL` is set, Bearer keys can resolve to Neon-backed project keys and
usage events are recorded. Without it, only env `API_KEYS` and UI JWTs work.
