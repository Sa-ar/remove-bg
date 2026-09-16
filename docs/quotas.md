# Daily per-project quotas

Free-tier abuse control for `POST /v1/remove`. This is **not billing**.

## Rule

After Bearer auth succeeds and before the single-flight inference lock is acquired, the API counts rows in `usage_events` for that `project_id` with `created_at` at or after the start of the current **UTC** day:

```sql
select count(*) from usage_events
where project_id = $1
  and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'
```

Any status counts (today's events are the abuse signal). The check runs for every principal that maps to a project:

| Principal | Project bucket |
| --- | --- |
| Dashboard API key | That key's `project_id` |
| Signed-in website JWT (`purpose=ui-upload`) | Reserved `web-ui` |
| Legacy env `API_KEYS` | Reserved `legacy` |

Default limit: **50 per project per UTC day**. Override with integer env `DAILY_QUOTA_PER_PROJECT` on the API (`/opt/rembg/current/.env` in production).

## When exceeded

HTTP **429** with:

```json
{ "error": "Daily project quota exceeded", "code": "quota_exceeded", "hint": "…" }
```

`hint` names the limit and that usage resets at the next UTC midnight. Responses may also send `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-Quota-Reset` (unix time of the next UTC midnight).

## Unchanged

- `GET /v1/health` is not quota-gated.
- slowapi **30/minute** per key/IP (`code=rate_limited`) stays.
- Single-flight inference lock (`code=busy`) stays.

## Degradation

If the pool is missing or the count query fails, the API **fails open** (allows the request) and logs a warning. Same policy as usage logging: inference never depends on the database.

## Out of scope

Per-user caps, paid plans, billing, overage, or changing the 30/minute limiter.
