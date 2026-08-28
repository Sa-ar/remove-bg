# Auth (Neon Auth)

The website uses **Neon Auth (Managed Better Auth, Beta)**. Users and sessions live in the `neon_auth` schema of the existing Neon project `remove-bg` (`restless-forest-85176663`, `aws-eu-central-1`). Clerk is not used.

## Enable (once per Neon project)

1. Open [console.neon.tech](https://console.neon.tech) → project **remove-bg** → Branch → **Auth**.
2. Click **Enable Auth** (email/password). Google OAuth is optional.
3. Copy the **Auth URL** (`NEON_AUTH_BASE_URL`).
4. Trusted domains:
   - `https://www.rembg.site`
   - `https://rembg.site`
   - `http://localhost:3000`
   - the current Vercel project / preview host
5. Generate a cookie secret: `openssl rand -base64 32` → `NEON_AUTH_COOKIE_SECRET` (32+ characters).

CLI alternative (if you are logged into the Neon CLI):

```bash
neon neon-auth enable
```

Do not commit the Auth URL secret material or the cookie secret. Set them in:

- Vercel project env (Production + Preview)
- `apps/web/.env.local` for laptop dev
- GitHub Actions only if a workflow needs them (CI uses placeholders)

Also required, already in use:

- `DATABASE_URL` — pooled Neon URL on Vercel; direct URL on Oracle `/opt/rembg/current/.env`
- `UI_TOKEN_SECRET` — same value on web and API

Apply SQL after Auth exists:

```bash
psql "$DATABASE_URL" -f db/migrations/0001_init.sql
psql "$DATABASE_URL" -f db/migrations/0002_project_owner.sql
```

## App wiring

| File | Role |
| --- | --- |
| `apps/web/src/lib/auth/server.ts` | `createNeonAuth` |
| `apps/web/src/lib/auth/client.ts` | browser client |
| `apps/web/src/app/api/auth/[...path]/route.ts` | Auth HTTP handler |
| `apps/web/src/proxy.ts` | Protects `/`, `/dashboard`, `/dashboard/usage` |
| `apps/web/src/app/auth/sign-in` / `sign-up` | Email/password UI |

Public: `/docs`, `/auth/*`, `/api/auth/*`.

`POST /api/token` and `/dashboard/api/*` return JSON `401` without a session. The token route puts `sub` (Neon user id) on the UI JWT. The API attributes those requests to the reserved `web-ui` project and stores `user_id` on `usage_events` when the column exists.

Dashboard routes call `requireUserId()` and filter by `projects.owner_id`. Reserved projects `web-ui` and `legacy` cannot have dashboard keys.

## Local

```bash
cd apps/web
cp .env.example .env.local
# fill NEON_AUTH_BASE_URL, NEON_AUTH_COOKIE_SECRET, DATABASE_URL, UI_TOKEN_SECRET
npm install
npm run dev
```

Safari blocks third-party cookies on non-HTTPS localhost; use `npm run dev -- --experimental-https` if sign-in fails in Safari.

## Out of scope

Billing, per-user quotas, email verification enforcement, OAuth-only signup, Clerk.
