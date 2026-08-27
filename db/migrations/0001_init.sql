-- db/migrations/0001_init.sql
create extension if not exists pgcrypto;

create table if not exists projects (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table if not exists api_keys (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  name         text not null,
  key_prefix   text not null,
  key_hash     text not null unique,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
create index if not exists api_keys_active_hash_idx on api_keys (key_hash) where revoked_at is null;

create table if not exists usage_events (
  id          bigint generated always as identity primary key,
  project_id  uuid references projects(id) on delete set null,
  api_key_id  uuid references api_keys(id) on delete set null,
  model       text not null,
  bytes_in    integer not null default 0,
  bytes_out   integer not null default 0,
  duration_ms integer not null default 0,
  status      integer not null,
  created_at  timestamptz not null default now()
);
create index if not exists usage_events_project_time_idx on usage_events (project_id, created_at);
create index if not exists usage_events_key_time_idx on usage_events (api_key_id, created_at);

insert into projects (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'web-ui'),
  ('00000000-0000-0000-0000-000000000002', 'legacy')
on conflict (id) do nothing;
