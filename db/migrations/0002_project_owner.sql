-- db/migrations/0002_project_owner.sql
-- Owner scoping for dashboard projects/keys, plus optional user_id on usage.
-- Neon Auth user ids are stored as text (no FK): auth may be enabled after
-- this migration, and neon_auth.user.id type can differ by Auth version.

alter table projects add column if not exists owner_id text;
create index if not exists projects_owner_idx
  on projects (owner_id) where owner_id is not null;

alter table usage_events add column if not exists user_id text;
create index if not exists usage_events_user_time_idx
  on usage_events (user_id, created_at);

-- Reserved system projects stay unowned; dashboard CRUD must not use them.
update projects
  set owner_id = null
  where id in (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002'
  );
