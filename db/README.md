# Database

Single Neon Postgres shared by the API (apps/api) and dashboard (apps/web).

Apply migrations (idempotent, run in order):

    psql "$DATABASE_URL" -f db/migrations/0001_init.sql

`DATABASE_URL` is the Neon connection string (use the pooled/`-pooler` host).

## Provisioned project

Neon project: `remove-bg` (`restless-forest-85176663`, `aws-eu-central-1`).
Use the **pooled** connection string for Vercel (`apps/web`) and the **direct**
string for the Oracle API (`asyncpg`). `DATABASE_URL` lives in Vercel env and
`/opt/rembg/current/.env` — never commit it.

