# Architecture

Production stack for **https://www.rembg.site** (UI) and **https://api.rembg.site** (worker).

```
Browser (www.rembg.site)
  │
  ├─ Neon Auth session cookie  →  Vercel Next.js (apps/web)
  │     /auth/*  /api/auth/*   public
  │     /  /dashboard          require session
  │     POST /api/token        require session → 5m HS256 JWT (purpose + sub)
  │
  ├─ GET  https://api.rembg.site/v1/health     (CORS must allow www)
  └─ POST https://api.rembg.site/v1/remove     Bearer UI JWT or project key
         │
         ▼
Oracle Always Free A1 (il-jerusalem-1)
  nginx + Certbot → rembg.service → uvicorn 127.0.0.1:5000
  rembg (isnet-general-use default, birefnet-general opt-in)
         │
         ▼
Neon Postgres (project remove-bg, aws-eu-central-1)
  neon_auth.*          users / sessions (Managed Better Auth)
  projects             owner_id = Neon user id (dashboard)
  api_keys             hashed project keys
  usage_events         per-removal log (best-effort)
```

## Pieces

| Piece | Where | Role |
| --- | --- | --- |
| UI | Vercel Hobby, root `apps/web` | Sign-in, remover, key dashboard |
| API | Oracle systemd `rembg.service` | Inference, CORS, Bearer auth |
| Auth | Neon Auth (Managed Better Auth, Beta) | Users in `neon_auth` in the same DB |
| Keys / usage | Same Neon database | Dashboard + API share `DATABASE_URL` |

Uploads go **directly to the API**, not through Vercel, so 10MB+ photos work on the Hobby body limit.

## Auth paths

| Client | Token | Identity |
| --- | --- | --- |
| Signed-in browser | 5-minute UI JWT (`purpose=ui-upload`, `sub=<user id>`) minted by `POST /api/token` | Attributed to reserved `web-ui` project |
| Programmatic | `rmbg_…` key from the dashboard | `api_keys` row → `projects.owner_id` |
| Legacy | env `API_KEYS` | Reserved `legacy` project |

Anonymous UI JWTs are no longer minted. `/docs` stays public. `/dashboard` is session-gated and scoped to `projects.owner_id`.

## CORS

The API allow-list is `WEB_ORIGIN` + `EXTRA_CORS_ORIGINS` + hardcoded production origins (`https://www.rembg.site`, `https://rembg.site`, the Vercel project URL) + localhost. Missing `www.rembg.site` makes the homepage show **Worker down** even when Oracle is healthy.

See [runbook.md](./runbook.md) and [oracle-setup.md](./oracle-setup.md).

## Out of scope

Billing, quotas, image storage, Clerk, Docker-on-Oracle, terminating the VM, RMBG-2.0, GPU hosts, SDKs.
