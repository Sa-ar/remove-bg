# Remove BG

High-quality background removal with a web UI and an HTTP API other projects can call.

| Piece | Stack | Free deploy |
| --- | --- | --- |
| API | FastAPI + [rembg](https://github.com/danielgatis/rembg) | Oracle Always Free Ampere A1 → **https://api.rembg.site** |
| UI | Next.js | Vercel Hobby → **https://www.rembg.site** |
| Auth / DB | Neon Auth + Postgres | Neon project `remove-bg` |

Uploads go **directly to the API** (not through Vercel) so 10MB+ photos work on the Hobby body limit. The tool and dashboard require sign-in. `/docs` is public.

See [docs/architecture.md](docs/architecture.md), [docs/auth.md](docs/auth.md), [docs/quotas.md](docs/quotas.md), [docs/runbook.md](docs/runbook.md).

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

For keys/usage and sign-in:

1. Enable Neon Auth (see [docs/auth.md](docs/auth.md)).
2. Set `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`.
3. Apply `db/migrations/0001_init.sql` then `0002_project_owner.sql`.

## API usage

```bash
curl -X POST "http://localhost:8000/v1/remove" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "file=@./photo.jpg" \
  --max-time 120 \
  -o removed.png
```

- Auth: `Authorization: Bearer <key>` from a dashboard project key, legacy `API_KEYS`, or a short-lived signed-in UI JWT
- Success: `image/png` with alpha
- Errors: `{ "error", "code", "hint" }`
- OpenAPI: `/docs`

### Limits (free tier)

| Limit | Default | When exceeded |
| --- | --- | --- |
| Per key/IP | 30 requests / minute | HTTP 429 `code=rate_limited` |
| In-flight inference | 1 at a time | HTTP 429 `code=busy` |
| Per project | **50 removals / UTC day** | HTTP 429 `code=quota_exceeded` |

The daily cap is counted from `usage_events` for the authenticated project (dashboard keys, signed-in website traffic on the reserved `web-ui` project, and `legacy` env keys). Override with API env `DAILY_QUOTA_PER_PROJECT`. If the database is down so today's count cannot be read, the API **fails open** (allows the request) and logs a warning — inference never depends on the DB. See [docs/quotas.md](docs/quotas.md).

The 429 body is `{ "error", "code", "hint" }`. For `quota_exceeded`, `hint` includes the limit and that usage resets at the next UTC midnight.

**First inference after restart:** The Oracle VM stays on. After a service restart the model loads into RAM; `GET /v1/health` returns `503` with `code=waking` until ready. Client timeout ≥ 120s. Warm CPU inference is typically a few seconds (`isnet-general-use`).

If the website shows **Worker down** while that health call is `200`, it is CORS — see [docs/runbook.md](docs/runbook.md).

## Production

- UI: https://www.rembg.site
- API: https://api.rembg.site — [docs/oracle-setup.md](docs/oracle-setup.md). Free uptime checks + GitHub Issue alerts: [docs/runbook.md#monitoring](docs/runbook.md#monitoring).

### CI/CD (GitHub Actions)

| Workflow | Trigger | Purpose |
| --- | --- | --- |
| `ci.yml` | push/PR to `main` | Web lint+build, API compile + quota tests, uptime script self-test |
| `deploy-oracle.yml` | push `apps/api/**` or manual | rsync + restart systemd on Oracle |
| `sync-vercel-env.yml` | manual | set API URL + `UI_TOKEN_SECRET`, redeploy UI |
| `deploy-vercel.yml` | push `apps/web/**` or manual | optional CLI production deploy (skips on push if `VERCEL_TOKEN` is missing or rejected) |
| `deploy-space.yml` | optional | legacy HF Space sync (skipped without HF secrets) |
| `uptime-api.yml` | hourly or manual | `GET /v1/health`; one reused `uptime` GitHub Issue on hard / stuck-waking failure |

**Required Actions secrets for Oracle + Vercel:**

| Secret | Used by |
| --- | --- |
| `ORACLE_HOST` / `ORACLE_USER` / `ORACLE_SSH_KEY` | Oracle deploy |
| `API_KEYS` / `UI_TOKEN_SECRET` / `WEB_ORIGIN` | App config (`WEB_ORIGIN` should be `https://www.rembg.site`) |
| `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` | Optional Vercel CLI workflows (rotate `VERCEL_TOKEN` to re-enable CLI deploys) |

Vercel Git integration (root `apps/web`) still deploys the UI on push to `main`. Set `NEON_AUTH_*` and `DATABASE_URL` in the Vercel project.

### Smoke test

1. Sign in at https://www.rembg.site, confirm **Worker ready**, drop a photo.
2. `curl` with a dashboard Bearer key and `--max-time 120`.

## Out of scope (this iteration)

No billing, image storage, batch/video, background replacement, RMBG-2.0 (CC BY-NC), `birefnet-massive` on free hardware, GPU hosts, Clerk, Docker-on-Oracle, or SDKs. Daily per-project quotas are free-tier abuse control, not billing.

## License

MIT for this repo. BiRefNet weights used via rembg are MIT-licensed (ZhengPeng7/BiRefNet).
