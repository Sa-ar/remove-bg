# Remove BG API

FastAPI + `rembg` (`birefnet-general`) background removal worker.

Deployed as a systemd service (`rembg.service`, uvicorn on `127.0.0.1:5000`)
behind nginx on an Oracle Cloud VM. nginx terminates HTTPS and proxies to the
app. See [`deploy.sh`](./deploy.sh).

## Configuration

Read from `/opt/rembg/current/.env` (systemd `EnvironmentFile`) on the server:

- `API_KEYS` — comma-separated Bearer keys for other projects
- `UI_TOKEN_SECRET` — shared with the Vercel web app (signs short-lived UI upload JWTs)
- `WEB_ORIGIN` — Vercel URL allowed for CORS, e.g. `https://your-app.vercel.app`
- `MODEL` — rembg model (default `birefnet-general`)
- `EXTRA_CORS_ORIGINS` — optional, comma-separated extra origins

## Endpoints

- `GET /v1/health` — `200 {status: ok}` when the model is loaded, `503 code=waking` while it loads
- `POST /v1/remove` — multipart `file` → PNG with alpha; auth via `Authorization: Bearer <key|ui-jwt>`
- Interactive docs: `/docs`

## Deploy

```bash
./deploy.sh            # uses the `rembg` SSH host alias
./deploy.sh user@host  # or an explicit target
```

CI can deploy automatically via `.github/workflows/deploy-oracle.yml` once the
`ORACLE_HOST`, `ORACLE_USER`, and `ORACLE_SSH_KEY` GitHub Actions secrets are set.

## Local

From the repo root: `docker compose up --build` (see the top-level README).
The included `Dockerfile` is also usable for container hosts that need port 7860.
