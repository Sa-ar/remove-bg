# Database

Single Neon Postgres shared by the API (apps/api) and dashboard (apps/web).

Apply migrations (idempotent, run in order):

    psql "$DATABASE_URL" -f db/migrations/0001_init.sql
    psql "$DATABASE_URL" -f db/migrations/0002_project_owner.sql

`DATABASE_URL` is the Neon connection string (use the pooled/`-pooler` host on Vercel; the direct host on Oracle `asyncpg`).

`0002_project_owner.sql` adds `projects.owner_id` (Neon Auth user id) and `usage_events.user_id`. Reserved projects `web-ui` and `legacy` stay unowned. Enable Neon Auth before expecting sign-in to work — see [docs/auth.md](../docs/auth.md).

## Provisioned project

Neon project: `remove-bg` (`restless-forest-85176663`, `aws-eu-central-1`).
Use the **pooled** connection string for Vercel (`apps/web`) and the **direct**
string for the Oracle API (`asyncpg`). `DATABASE_URL` lives in Vercel env and
`/opt/rembg/current/.env` — never commit it.

## Oracle must not pin Neon awake

`rembg.service` is always-on (`Restart=always`). The API pool must use
`min_size=0` and a short `max_inactive_connection_lifetime` so it does not
hold a warm idle Postgres connection. `GET /v1/health` stays DB-free (uptime
probes must not wake compute).

Neon still needs scale-to-zero enabled on the endpoint (`suspend_timeout_seconds`
> 0; default is 300). `suspend_timeout_seconds: 0` keeps compute running even
after the pool drops to zero. Vercel already uses `@neondatabase/serverless`
and does not hold connections.

