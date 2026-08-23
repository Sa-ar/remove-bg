# Database

Single Neon Postgres shared by the API (apps/api) and dashboard (apps/web).

Apply migrations (idempotent, run in order):

    psql "$DATABASE_URL" -f db/migrations/0001_init.sql

`DATABASE_URL` is the Neon connection string (use the pooled/`-pooler` host).
