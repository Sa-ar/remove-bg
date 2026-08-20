title: Remove BG API
emoji: ✂️
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
license: mit
short_description: High-quality BiRefNet background removal API
---

# Remove BG API

FastAPI + `rembg` (`birefnet-general`) background removal worker.

## Secrets

Set these in the Space settings:

- `API_KEYS` — comma-separated Bearer keys for other projects
- `UI_TOKEN_SECRET` — shared with the Vercel web app (JWT for the UI)
- `WEB_ORIGIN` — Vercel URL, e.g. `https://your-app.vercel.app`

## Endpoints

- `GET /v1/health`
- `POST /v1/remove` — multipart `file` → PNG with alpha
- Interactive docs: `/docs`

Hardware: **CPU Basic** (16GB). Free Spaces sleep when idle; allow 120s client timeouts.
