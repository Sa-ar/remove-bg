# API keys + per-project usage tracking — design

Date: 2026-08-23
Status: approved (design); implementation plan pending

## Overview

Add project-scoped API keys and per-request usage tracking to remove-bg.
Today the API accepts a static `API_KEYS` env list plus anonymous short-lived
UI JWTs from the website; there is no persistence, no per-caller identity, and
no usage visibility. This adds a shared Postgres store, DB-backed keys the
owner creates per project, per-request usage events, and a dashboard to manage
keys and view usage.

Primary user: the project owner, issuing one or more keys per project and
tracking each project's usage. The design deliberately leaves room to grow
into a multi-user / paid product later, without building that now.

## Goals

- Create and revoke named API keys, grouped by project.
- Record every `/v1/remove` request as a usage event (model, sizes, latency, status).
- A dashboard to manage keys and view usage over time, per project and per key.
- Keep the existing anonymous website flow working, with its usage attributed
  to a reserved `web-ui` project.
- Never let the usage/keys subsystem slow down or break background removal.

## Non-goals (v1)

- No public signup / app-level user accounts (dashboard is gated by Vercel Access).
- No billing or payments.
- No per-key quota **enforcement** (usage is tracked, not capped).
- No per-key rate limiting (the existing global limiter stays).

Foundations for the above are left in place (see Schema notes) but not implemented.

## Architecture

Three pieces share one database:

```
  Vercel (apps/web)                     Oracle VM (apps/api)
  /dashboard  --- writes/reads --.   .--- validates keys, writes events
  (Vercel Access gated)          |   |
                                 v   v
                        Neon Postgres (shared)
```

- **Neon Postgres** — single shared database, free tier. Chosen over a
  DB-on-the-box so the Vercel dashboard and the Oracle API both connect
  directly, and so the store is independent of the single VM. (Supabase is a
  viable alternative; Neon is lighter and integrates natively with Vercel.)
- **API (apps/api, Oracle)** — validates DB-backed keys and logs usage events.
- **Dashboard (apps/web, Vercel)** — manages keys and renders usage, protected
  by Vercel Access (no auth code in v1).

## Data model

Plain SQL migration files under `db/migrations/` are the single source of
truth (both a Python API and a TypeScript dashboard read the same schema, so no
shared ORM). Proposed initial DDL:

```sql
create table projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
  -- future: owner_id uuid references users(id)
);

create table api_keys (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  name         text not null,
  key_prefix   text not null,             -- e.g. "rmbg_ab12" for display
  key_hash     text not null unique,      -- sha-256 of the full key
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
create index on api_keys (key_hash) where revoked_at is null;

create table usage_events (
  id           bigint generated always as identity primary key,
  project_id   uuid references projects(id) on delete set null,
  api_key_id   uuid references api_keys(id) on delete set null,  -- null for web-ui JWT
  model        text not null,
  bytes_in     integer not null default 0,
  bytes_out    integer not null default 0,
  duration_ms  integer not null default 0,
  status       integer not null,          -- HTTP status of the removal
  created_at   timestamptz not null default now()
);
create index on usage_events (project_id, created_at);
create index on usage_events (api_key_id, created_at);
```

Two reserved project rows are seeded by migration at well-known ids:
`web-ui` (anonymous website traffic) and `legacy` (requests authenticated by a
legacy static `API_KEYS` env value during the transition).

Key format: `rmbg_<24+ url-safe random bytes>`. Only the SHA-256 hash and a
short display prefix are stored; the plaintext is shown once at creation and
never again.

At personal scale the dashboard aggregates `usage_events` on the fly with
time-bucketing. A daily rollup table can be added later if event volume grows;
not needed in v1.

## API changes (apps/api)

- New env `DATABASE_URL`; add `asyncpg` to `requirements.txt`. A small pool is
  opened in the lifespan handler.
- **Auth resolution** in `verify_auth`, in order:
  1. UI JWT (existing HS256 `ui-upload` token) → attributed to the `web-ui`
     project, `api_key_id = null`.
  2. DB-backed key: SHA-256 the bearer token, look up a non-revoked row in
     `api_keys`; resolve its `project_id`. Update `last_used_at` (throttled).
  3. (Optional bootstrap) legacy static `API_KEYS` env still accepted, mapped
     to a `legacy` project, so nothing breaks before keys are migrated.
  Revoked / unknown keys → 401. Lookups are cached in-process with a short TTL
  (e.g. 30–60s) keyed by hash, so steady traffic does not hit the DB per
  request.
- **Usage logging**: after each `/v1/remove` returns, enqueue a `usage_events`
  insert **fire-and-forget** (background task / small async queue). It must
  never block or delay the response. If the DB is unreachable, the removal
  still succeeds and the event is dropped (best-effort) with a logged warning.
- The single-inference guardrail and resource limits are unchanged.

Degradation policy: inference availability never depends on the DB. If the DB
is down, cached keys continue to authenticate; uncached new keys fail closed
(401) until the DB returns.

## Dashboard (apps/web)

- New routes under `/dashboard`, protected by **Vercel Access** (project
  setting; no auth code in v1).
- Server-side route handlers / server actions connect to Neon via its
  serverless driver. Endpoints/actions:
  - list projects and their keys (with `last_used_at`, revoked state);
  - create project;
  - create key → generates the key, stores the hash, returns plaintext **once**;
  - revoke key (sets `revoked_at`);
  - usage views: per project and per key — request counts over time (chart),
    totals, and a recent-events list. Reads aggregate from `usage_events`.
- No changes to the existing anonymous upload flow on the home page.

## Security

- Keys are high-entropy random, stored only as SHA-256 hashes; plaintext shown
  once. Display uses `key_prefix` only.
- Dashboard access gated by Vercel Access.
- `DATABASE_URL` is a secret in both Vercel env and the Oracle `.env`.
- Revocation is immediate on next uncached lookup (bounded by the cache TTL).

## Error handling

- Usage insert failures: logged, swallowed; never surfaced to the client.
- DB pool exhaustion / outage: auth falls back to cache; removal path unaffected.
- Dashboard DB errors: shown as a normal error state in the UI.

## Testing

- API unit tests: key hashing, auth resolution (JWT vs DB key vs revoked vs
  unknown), cache behavior, and that a usage event is recorded with correct
  fields (mocked DB). One integration test: seed a key, call `/v1/remove`,
  assert a `usage_events` row.
- Dashboard: route-handler tests for create/revoke and a basic render of the
  usage view.
- Migration applies cleanly on an empty database.

## Migrations & rollout

1. Provision Neon; set `DATABASE_URL` in Vercel and the Oracle `.env`.
2. Apply `db/migrations` (creates tables, seeds the `web-ui` project).
3. Deploy the API with DB-backed auth + usage logging (legacy env keys still
   accepted during transition).
4. Ship the dashboard; create real project keys; migrate callers off legacy
   env keys, then remove `API_KEYS` from the box.

## Future (explicitly deferred)

- User accounts / multi-tenant (`projects.owner_id`, real auth).
- Billing and per-key quota enforcement, built on `usage_events`.
- Daily usage rollups for large-volume dashboards.
- Per-key rate limiting.
