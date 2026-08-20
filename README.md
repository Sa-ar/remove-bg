# Remove BG

High-quality background removal with a web UI and an HTTP API other projects can call.

| Piece | Stack | Free deploy |
| --- | --- | --- |
| API | FastAPI + [rembg](https://github.com/danielgatis/rembg) BiRefNet | [Hugging Face Spaces](https://huggingface.co/docs/hub/spaces-sdks-docker) Docker (CPU Basic, 16GB) |
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

**Free-tier cold start:** Spaces sleep when idle. First request can take 1–2 minutes. Client timeout ≥ 120s. `GET /v1/health` returns `503` with `code=waking` while the model loads. CPU inference after wake is typically 10–40s.

## Free deploy

### 1. Hugging Face Space (API)

1. Create a **Docker** Space, hardware **CPU Basic** (2 vCPU / 16GB).
2. Space must be **public** (auth is Bearer keys, not Space visibility).
3. Point the Space at this repo with Dockerfile path `apps/api/Dockerfile`, or push the contents of `apps/api` (including `README.md` Spaces YAML).
4. Secrets: `API_KEYS`, `UI_TOKEN_SECRET`, `WEB_ORIGIN` (set after Vercel URL is known).
5. Confirm `GET https://<user>-<space>.hf.space/v1/health`.

The Dockerfile listens on **port 7860** and prefetches BiRefNet weights at build time.

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
| `deploy-space.yml` | push to `apps/api/**` or manual | Sync `apps/api` → HF Space |
| `deploy-vercel.yml` | push to `apps/web/**` or manual | CLI production deploy (optional) |

**GitHub Actions secrets** (Settings → Secrets → Actions):

| Secret | Used by | Notes |
| --- | --- | --- |
| `HF_TOKEN` | Space deploy | Hugging Face write token |
| `HF_USERNAME` | Space deploy | e.g. your HF username |
| `HF_SPACE` | Space deploy | Space name, e.g. `remove-bg` |
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
