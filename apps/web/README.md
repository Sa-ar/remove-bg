# Remove BG web

Next.js UI for https://www.rembg.site.

Sign-in (Neon Auth) is required for the tool and dashboard. `/docs` is public. Uploads go straight to `NEXT_PUBLIC_API_URL` (Oracle), not through Vercel.

## Setup

```bash
cp .env.example .env.local
npm install
npm run dev
```

Required env (see `.env.example` and [docs/auth.md](../../docs/auth.md)):

- `NEXT_PUBLIC_API_URL`
- `UI_TOKEN_SECRET` (same as the API)
- `DATABASE_URL` (Neon pooled) for the dashboard
- `NEON_AUTH_BASE_URL` / `NEON_AUTH_COOKIE_SECRET`

```bash
npm run lint
npm run test
npm run build
```
