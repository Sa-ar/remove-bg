# API Keys + Usage Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add project-scoped, DB-backed API keys and per-request usage tracking, plus a Vercel-Access-gated dashboard to manage keys and view usage.

**Architecture:** A shared Neon Postgres holds `projects`, `api_keys` (hashed), and `usage_events`. The Oracle FastAPI validates DB-backed keys (with an in-process TTL cache) and logs one usage event per removal fire-and-forget. The Vercel Next.js app gains a `/dashboard` (Vercel Access protected) that creates/revokes keys and renders usage from the same DB.

**Tech Stack:** Postgres (Neon), FastAPI + asyncpg (Python 3.12), Next.js App Router + `@neondatabase/serverless` (TypeScript), pytest for API, vitest for web helpers.

**Spec:** `docs/superpowers/specs/2026-08-23-api-keys-usage-tracking-design.md`

## Global Constraints

- Removal (`POST /v1/remove`) MUST NOT be slowed or broken by the keys/usage subsystem. Usage logging is fire-and-forget; DB outage never blocks inference.
- API keys are stored only as SHA-256 hashes plus a short display prefix. Plaintext is shown exactly once, at creation.
- Key format: `rmbg_` + `secrets.token_urlsafe(24)`.
- Two reserved projects seeded at fixed UUIDs, reused verbatim by API and DB: `web-ui` = `00000000-0000-0000-0000-000000000001`, `legacy` = `00000000-0000-0000-0000-000000000002`.
- `DATABASE_URL` is a secret in both the Oracle `.env` and Vercel env; never committed.
- Existing anonymous UI-JWT upload flow keeps working, attributed to the `web-ui` project.

---

## File structure

- Create `db/migrations/0001_init.sql` — schema + seeds (source of truth).
- Create `apps/api/app/db.py` — asyncpg pool lifecycle + raw queries.
- Create `apps/api/app/keys.py` — key generation/hashing + TTL cache + auth resolution.
- Modify `apps/api/app/main.py` — open/close pool in lifespan; call keys resolution in `verify_auth`; log usage after removal.
- Modify `apps/api/requirements.txt` — add `asyncpg`; add `apps/api/requirements-dev.txt` (pytest).
- Create `apps/api/tests/…` — pytest suite.
- Create `apps/web/src/lib/db.ts` — Neon client + typed query helpers.
- Create `apps/web/src/lib/keys.ts` — key generation/hashing (web side, for creation).
- Create `apps/web/src/app/dashboard/**` — pages + route handlers.
- Create `apps/web/src/lib/__tests__/…` — vitest for web helpers.
- Modify `apps/web/package.json` — add `@neondatabase/serverless`, vitest.

---

## Task 1: Database migration (schema + seeds)

**Files:**
- Create: `db/migrations/0001_init.sql`
- Create: `db/README.md` (how to apply)

**Interfaces:**
- Produces: tables `projects`, `api_keys`, `usage_events`; seeded project UUIDs `WEB_UI_PROJECT_ID = '00000000-0000-0000-0000-000000000001'`, `LEGACY_PROJECT_ID = '00000000-0000-0000-0000-000000000002'` (used verbatim by Tasks 3–7).

- [ ] **Step 1: Write the migration**

```sql
-- db/migrations/0001_init.sql
create extension if not exists pgcrypto;

create table projects (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table api_keys (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  name         text not null,
  key_prefix   text not null,
  key_hash     text not null unique,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
create index api_keys_active_hash_idx on api_keys (key_hash) where revoked_at is null;

create table usage_events (
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
create index usage_events_project_time_idx on usage_events (project_id, created_at);
create index usage_events_key_time_idx on usage_events (api_key_id, created_at);

insert into projects (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'web-ui'),
  ('00000000-0000-0000-0000-000000000002', 'legacy')
on conflict (id) do nothing;
```

- [ ] **Step 2: Write db/README.md**

```markdown
# Database

Single Neon Postgres shared by the API (apps/api) and dashboard (apps/web).

Apply migrations (idempotent, run in order):

    psql "$DATABASE_URL" -f db/migrations/0001_init.sql

`DATABASE_URL` is the Neon connection string (use the pooled/`-pooler` host).
```

- [ ] **Step 3: Apply against a scratch DB to verify it runs**

Run: `psql "$DATABASE_URL" -f db/migrations/0001_init.sql`
Expected: no errors; `\dt` shows the three tables; `select name from projects` shows `web-ui`, `legacy`.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/0001_init.sql db/README.md
git commit -m "feat(db): initial schema for api keys + usage events"
```

---

## Task 2: API database module (asyncpg pool)

**Files:**
- Create: `apps/api/app/db.py`
- Modify: `apps/api/requirements.txt` (add `asyncpg==0.30.0`)
- Create: `apps/api/requirements-dev.txt` (`pytest==8.3.4`, `pytest-asyncio==0.25.0`, `httpx==0.28.1`)
- Test: `apps/api/tests/test_db_module.py`

**Interfaces:**
- Produces: `async def init_pool() -> None`, `async def close_pool() -> None`, `def get_pool() -> asyncpg.Pool | None`, `DATABASE_URL: str | None`. When `DATABASE_URL` is unset, `init_pool()` is a no-op and `get_pool()` returns `None` (keys/usage degrade gracefully).

- [ ] **Step 1: Write the failing test**

```python
# apps/api/tests/test_db_module.py
from app import db

def test_get_pool_is_none_before_init():
    assert db.get_pool() is None

async def test_init_pool_noop_without_url(monkeypatch):
    monkeypatch.setattr(db, "DATABASE_URL", None)
    await db.init_pool()
    assert db.get_pool() is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && python -m pytest tests/test_db_module.py -v`
Expected: FAIL (`ModuleNotFoundError: app.db` / attribute errors)

- [ ] **Step 3: Write minimal implementation**

```python
# apps/api/app/db.py
import logging
import os
from typing import Optional

import asyncpg

logger = logging.getLogger("remove_bg.db")
DATABASE_URL: Optional[str] = os.getenv("DATABASE_URL") or None
_pool: Optional[asyncpg.Pool] = None


def get_pool() -> Optional[asyncpg.Pool]:
    return _pool


async def init_pool() -> None:
    global _pool
    if not DATABASE_URL:
        logger.warning("DATABASE_URL not set; keys/usage disabled")
        return
    _pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=5)
    logger.info("DB pool ready")


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
```

- [ ] **Step 4: Add pytest config so async tests run**

```ini
# apps/api/pytest.ini
[pytest]
asyncio_mode = auto
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/api && pip install -r requirements-dev.txt && python -m pytest tests/test_db_module.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/app/db.py apps/api/requirements.txt apps/api/requirements-dev.txt apps/api/pytest.ini apps/api/tests/test_db_module.py
git commit -m "feat(api): asyncpg pool module with graceful no-DB fallback"
```

---

## Task 3: Key generation, hashing, and cached lookup

**Files:**
- Create: `apps/api/app/keys.py`
- Test: `apps/api/tests/test_keys.py`

**Interfaces:**
- Consumes: `app.db.get_pool()` (Task 2).
- Produces:
  - `def hash_key(raw: str) -> str` — hex SHA-256.
  - `class Principal` with fields `kind: str` (`"ui"|"api_key"|"legacy"`), `project_id: str`, `api_key_id: str | None`.
  - `async def resolve_api_key(raw: str) -> Principal | None` — hashes, checks a TTL cache, else queries `api_keys` for a non-revoked row; returns `None` if unknown/revoked or no pool. Caches positive and negative results for `CACHE_TTL = 45` seconds.
  - `WEB_UI_PROJECT_ID`, `LEGACY_PROJECT_ID` constants (verbatim from Task 1).

- [ ] **Step 1: Write the failing tests**

```python
# apps/api/tests/test_keys.py
import hashlib
from app import keys

def test_hash_key_is_sha256_hex():
    assert keys.hash_key("rmbg_abc") == hashlib.sha256(b"rmbg_abc").hexdigest()

async def test_resolve_returns_none_without_pool(monkeypatch):
    monkeypatch.setattr(keys, "_cache", {})
    monkeypatch.setattr("app.db.get_pool", lambda: None)
    assert await keys.resolve_api_key("rmbg_missing") is None

async def test_resolve_hits_cache_without_second_query(monkeypatch):
    monkeypatch.setattr(keys, "_cache", {})
    calls = {"n": 0}
    class FakePool:
        async def fetchrow(self, *a, **k):
            calls["n"] += 1
            return {"id": "k1", "project_id": "p1"}
        async def execute(self, *a, **k):
            return None
    monkeypatch.setattr("app.db.get_pool", lambda: FakePool())
    p1 = await keys.resolve_api_key("rmbg_x")
    p2 = await keys.resolve_api_key("rmbg_x")
    assert p1.project_id == "p1" and p2.api_key_id == "k1"
    assert calls["n"] == 1  # second call served from cache
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && python -m pytest tests/test_keys.py -v`
Expected: FAIL (`ModuleNotFoundError: app.keys`)

- [ ] **Step 3: Write minimal implementation**

```python
# apps/api/app/keys.py
import hashlib
import secrets
import time
from dataclasses import dataclass
from typing import Optional

from app import db

WEB_UI_PROJECT_ID = "00000000-0000-0000-0000-000000000001"
LEGACY_PROJECT_ID = "00000000-0000-0000-0000-000000000002"
CACHE_TTL = 45  # seconds

_cache: dict[str, tuple[float, Optional["Principal"]]] = {}


@dataclass
class Principal:
    kind: str
    project_id: str
    api_key_id: Optional[str] = None


def generate_key() -> str:
    return "rmbg_" + secrets.token_urlsafe(24)


def hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


async def resolve_api_key(raw: str) -> Optional[Principal]:
    h = hash_key(raw)
    now = time.monotonic()
    cached = _cache.get(h)
    if cached and now - cached[0] < CACHE_TTL:
        return cached[1]
    pool = db.get_pool()
    principal: Optional[Principal] = None
    if pool is not None:
        row = await pool.fetchrow(
            "select id, project_id from api_keys "
            "where key_hash = $1 and revoked_at is null",
            h,
        )
        if row is not None:
            principal = Principal(
                kind="api_key",
                project_id=str(row["project_id"]),
                api_key_id=str(row["id"]),
            )
            await pool.execute(
                "update api_keys set last_used_at = now() where id = $1",
                row["id"],
            )
    _cache[h] = (now, principal)
    return principal
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && python -m pytest tests/test_keys.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/app/keys.py apps/api/tests/test_keys.py
git commit -m "feat(api): db-backed api key resolution with ttl cache"
```

---

## Task 4: Wire auth resolution into the request path

**Files:**
- Modify: `apps/api/app/main.py` (imports; `verify_auth` returns a `Principal`; lifespan opens/closes pool)
- Test: `apps/api/tests/test_auth.py`

**Interfaces:**
- Consumes: `keys.resolve_api_key`, `keys.Principal`, `keys.WEB_UI_PROJECT_ID`, `keys.LEGACY_PROJECT_ID`, `db.init_pool`, `db.close_pool`.
- Produces: `async def verify_auth(authorization) -> Principal`. UI JWT → `Principal("ui", WEB_UI_PROJECT_ID)`; static `API_KEYS` → `Principal("legacy", LEGACY_PROJECT_ID)`; DB key → the resolved `Principal`; otherwise 401. The `/v1/remove` handler receives `principal: Principal = Depends(verify_auth)`.

- [ ] **Step 1: Write the failing tests**

```python
# apps/api/tests/test_auth.py
import jwt
import pytest
from fastapi import HTTPException
from app import main, keys

@pytest.fixture(autouse=True)
def _secrets(monkeypatch):
    monkeypatch.setattr(main, "API_KEYS", {"legacy-key"})
    monkeypatch.setattr(main, "UI_TOKEN_SECRET", "s3cret")

async def test_ui_jwt_maps_to_web_ui(monkeypatch):
    tok = jwt.encode({"purpose": "ui-upload"}, "s3cret", algorithm="HS256")
    p = await main.verify_auth(f"Bearer {tok}")
    assert p.kind == "ui" and p.project_id == keys.WEB_UI_PROJECT_ID

async def test_static_key_maps_to_legacy():
    p = await main.verify_auth("Bearer legacy-key")
    assert p.kind == "legacy" and p.project_id == keys.LEGACY_PROJECT_ID

async def test_db_key_resolved(monkeypatch):
    async def fake_resolve(raw):
        return keys.Principal("api_key", "proj-9", "key-9")
    monkeypatch.setattr(keys, "resolve_api_key", fake_resolve)
    p = await main.verify_auth("Bearer rmbg_live")
    assert p.api_key_id == "key-9" and p.project_id == "proj-9"

async def test_unknown_key_401(monkeypatch):
    async def fake_resolve(raw):
        return None
    monkeypatch.setattr(keys, "resolve_api_key", fake_resolve)
    with pytest.raises(HTTPException) as e:
        await main.verify_auth("Bearer rmbg_nope")
    assert e.value.status_code == 401
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && python -m pytest tests/test_auth.py -v`
Expected: FAIL (`verify_auth` is sync / returns a string, not a `Principal`)

- [ ] **Step 3: Rewrite `verify_auth` and lifespan in main.py**

Replace the existing `def verify_auth(...) -> str:` with the async version below (order: JWT → static env → DB key). Keep all existing 401 detail dicts.

```python
# apps/api/app/main.py  (imports)
from app import db, keys
from app.keys import Principal
```

```python
async def verify_auth(
    authorization: Annotated[Optional[str], Header()] = None,
) -> Principal:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail={
            "error": "Missing or invalid Authorization header",
            "code": "unauthorized",
            "hint": "Send Authorization: Bearer <API_KEY> or a UI JWT"})
    token = authorization[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail={
            "error": "Empty bearer token", "code": "unauthorized",
            "hint": "Provide a non-empty API key or UI token"})
    # 1) UI JWT (anonymous website)
    if UI_TOKEN_SECRET:
        try:
            payload = jwt.decode(token, UI_TOKEN_SECRET, algorithms=["HS256"])
            if payload.get("purpose") == "ui-upload":
                return Principal("ui", keys.WEB_UI_PROJECT_ID)
        except InvalidTokenError:
            pass
    # 2) legacy static keys
    if token in API_KEYS:
        return Principal("legacy", keys.LEGACY_PROJECT_ID)
    # 3) DB-backed project key
    principal = await keys.resolve_api_key(token)
    if principal is not None:
        return principal
    raise HTTPException(status_code=401, detail={
        "error": "Invalid API key", "code": "unauthorized",
        "hint": "Check the key, or that it is not revoked. UI tokens require UI_TOKEN_SECRET."})
```

Update the lifespan to manage the pool:

```python
@asynccontextmanager
async def lifespan(_app: FastAPI):
    await db.init_pool()
    await asyncio.to_thread(_load_model)
    yield
    await db.close_pool()
```

Update the handler signature: `_auth: str = Depends(verify_auth)` → `principal: Principal = Depends(verify_auth)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && python -m pytest tests/test_auth.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/app/main.py apps/api/tests/test_auth.py
git commit -m "feat(api): resolve auth to a Principal (ui/legacy/db key)"
```

---

## Task 5: Log a usage event per removal (fire-and-forget)

**Files:**
- Create: `apps/api/app/usage.py`
- Modify: `apps/api/app/main.py` (call after a successful/failed removal)
- Test: `apps/api/tests/test_usage.py`

**Interfaces:**
- Consumes: `db.get_pool()`, `keys.Principal`.
- Produces: `def record_usage(principal, model, bytes_in, bytes_out, duration_ms, status) -> None` — schedules an insert via `asyncio.create_task`; returns immediately; swallows and logs all DB errors; no-ops when pool is `None`.

- [ ] **Step 1: Write the failing test**

```python
# apps/api/tests/test_usage.py
import asyncio
from app import usage, keys

async def test_record_usage_inserts(monkeypatch):
    captured = {}
    class FakePool:
        async def execute(self, sql, *args):
            captured["sql"] = sql
            captured["args"] = args
    monkeypatch.setattr("app.db.get_pool", lambda: FakePool())
    usage.record_usage(keys.Principal("api_key", "p1", "k1"),
                       model="isnet-general-use", bytes_in=10, bytes_out=20,
                       duration_ms=30, status=200)
    await asyncio.sleep(0)  # let the task run
    assert "insert into usage_events" in captured["sql"]
    assert captured["args"][0] == "p1" and captured["args"][1] == "k1"

async def test_record_usage_noop_without_pool(monkeypatch):
    monkeypatch.setattr("app.db.get_pool", lambda: None)
    usage.record_usage(keys.Principal("ui", "web"), model="m",
                       bytes_in=0, bytes_out=0, duration_ms=0, status=200)
    await asyncio.sleep(0)  # must not raise
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && python -m pytest tests/test_usage.py -v`
Expected: FAIL (`ModuleNotFoundError: app.usage`)

- [ ] **Step 3: Write minimal implementation**

```python
# apps/api/app/usage.py
import asyncio
import logging
from app import db
from app.keys import Principal

logger = logging.getLogger("remove_bg.usage")


async def _insert(project_id, api_key_id, model, bytes_in, bytes_out, duration_ms, status):
    pool = db.get_pool()
    if pool is None:
        return
    try:
        await pool.execute(
            "insert into usage_events "
            "(project_id, api_key_id, model, bytes_in, bytes_out, duration_ms, status) "
            "values ($1, $2, $3, $4, $5, $6, $7)",
            project_id, api_key_id, model, bytes_in, bytes_out, duration_ms, status,
        )
    except Exception:  # noqa: BLE001 — usage logging never affects the response
        logger.exception("usage insert failed")


def record_usage(principal: Principal, *, model: str, bytes_in: int,
                 bytes_out: int, duration_ms: int, status: int) -> None:
    asyncio.create_task(_insert(
        principal.project_id, principal.api_key_id, model,
        bytes_in, bytes_out, duration_ms, status))
```

- [ ] **Step 4: Call it from the removal handler**

In `remove_bg`, wrap the inference to measure time and record usage on both success and handled failure. After computing `png` (success) add before returning:

```python
    usage.record_usage(principal, model=model, bytes_in=len(data),
                       bytes_out=len(png), duration_ms=int((time.monotonic() - _t0) * 1000),
                       status=200)
```

Set `_t0 = time.monotonic()` just before acquiring the inference lock, add `import time` and `from app import usage`. (Recording on error paths is optional in v1; success path is required.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/api && python -m pytest tests/ -v`
Expected: PASS (all suites)

- [ ] **Step 6: Commit**

```bash
git add apps/api/app/usage.py apps/api/app/main.py apps/api/tests/test_usage.py
git commit -m "feat(api): fire-and-forget usage event per removal"
```

---

## Task 6: Web DB client + key helpers + deps

**Files:**
- Modify: `apps/web/package.json` (add `@neondatabase/serverless`, dev `vitest`)
- Create: `apps/web/src/lib/db.ts`
- Create: `apps/web/src/lib/keys.ts`
- Create: `apps/web/src/lib/__tests__/keys.test.ts`

**Interfaces:**
- Produces:
  - `sql` — a configured Neon tagged-template client from `db.ts`.
  - `generateKey(): string` → `rmbg_<base64url>`; `hashKey(raw): Promise<string>` → hex SHA-256 (Web Crypto), matching the API's Python hash byte-for-byte.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/__tests__/keys.test.ts
import { describe, it, expect } from "vitest";
import { generateKey, hashKey } from "../keys";

describe("keys", () => {
  it("generateKey has rmbg_ prefix and entropy", () => {
    const k = generateKey();
    expect(k.startsWith("rmbg_")).toBe(true);
    expect(k.length).toBeGreaterThan(24);
  });
  it("hashKey matches Python's hashlib sha-256 for the same input", async () => {
    // python: hashlib.sha256(b"rmbg_abc").hexdigest()
    expect(await hashKey("rmbg_abc")).toBe(
      "f9aba3f56e4168d7aaf2d293d297a6e378a076de0ce7108de343054ccd0e8b60");
  });
});
```

This fixed vector proves the JS (`crypto.subtle`) and Python (`hashlib`) hashes are byte-for-byte identical, so a key created in the dashboard resolves in the API.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/lib/__tests__/keys.test.ts`
Expected: FAIL (module missing)

- [ ] **Step 3: Implement db.ts and keys.ts**

```ts
// apps/web/src/lib/db.ts
import { neon } from "@neondatabase/serverless";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
export const sql = neon(process.env.DATABASE_URL);
```

```ts
// apps/web/src/lib/keys.ts
export function generateKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return "rmbg_" + b64;
}

export async function hashKey(raw: string): Promise<string> {
  const data = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}
```

Then replace the placeholder in the test with the real digest of `rmbg_abc` (run the Python `hashlib.sha256(b"rmbg_abc").hexdigest()` once and paste it) so the JS and Python hashes are proven identical.

- [ ] **Step 4: Add vitest config + script**

```json
// apps/web/package.json (scripts)
"test": "vitest run"
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/web && npm i && npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json apps/web/src/lib/db.ts apps/web/src/lib/keys.ts apps/web/src/lib/__tests__/keys.test.ts
git commit -m "feat(web): neon client + key gen/hash helpers"
```

---

## Task 7: Dashboard route handlers (create project/key, revoke, usage)

**Files:**
- Create: `apps/web/src/app/dashboard/api/projects/route.ts` (GET list, POST create)
- Create: `apps/web/src/app/dashboard/api/keys/route.ts` (POST create returns plaintext once)
- Create: `apps/web/src/app/dashboard/api/keys/[id]/route.ts` (DELETE = revoke)
- Create: `apps/web/src/app/dashboard/api/usage/route.ts` (GET aggregates)
- Test: `apps/web/src/lib/__tests__/usageQuery.test.ts`
- Create: `apps/web/src/lib/usageQuery.ts` (pure SQL/param builder, unit-tested)

**Interfaces:**
- Consumes: `sql` (Task 6), `generateKey`, `hashKey`.
- Produces: JSON endpoints under `/dashboard/api/*`. `buildUsageQuery({projectId?, days})` returns `{ text, params }` for a daily-bucketed count query (pure function, testable without a DB).

- [ ] **Step 1: Write the failing test for the query builder**

```ts
// apps/web/src/lib/__tests__/usageQuery.test.ts
import { describe, it, expect } from "vitest";
import { buildUsageQuery } from "../usageQuery";

describe("buildUsageQuery", () => {
  it("filters by project when given", () => {
    const q = buildUsageQuery({ projectId: "p1", days: 30 });
    expect(q.text).toContain("date_trunc('day', created_at)");
    expect(q.text).toContain("project_id = $1");
    expect(q.params).toEqual(["p1", 30]);
  });
  it("omits project filter when absent", () => {
    const q = buildUsageQuery({ days: 7 });
    expect(q.text).not.toContain("project_id =");
    expect(q.params).toEqual([7]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/lib/__tests__/usageQuery.test.ts`
Expected: FAIL (module missing)

- [ ] **Step 3: Implement usageQuery.ts**

```ts
// apps/web/src/lib/usageQuery.ts
export function buildUsageQuery(opts: { projectId?: string; days: number }) {
  const select =
    "select date_trunc('day', created_at) as day, count(*)::int as requests " +
    "from usage_events ";
  const tail = "group by day order by day";
  if (opts.projectId) {
    return {
      text:
        select +
        "where project_id = $1 " +
        "and created_at > now() - ($2 || ' days')::interval " +
        tail,
      params: [opts.projectId, opts.days] as (string | number)[],
    };
  }
  return {
    text:
      select +
      "where created_at > now() - ($1 || ' days')::interval " +
      tail,
    params: [opts.days] as (string | number)[],
  };
}
```

- [ ] **Step 4: Implement the route handlers**

```ts
// apps/web/src/app/dashboard/api/projects/route.ts
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
export const runtime = "nodejs";
export async function GET() {
  const rows = await sql`select id, name, created_at from projects order by created_at`;
  return NextResponse.json(rows);
}
export async function POST(req: Request) {
  const { name } = await req.json();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const rows = await sql`insert into projects (name) values (${name}) returning id, name, created_at`;
  return NextResponse.json(rows[0], { status: 201 });
}
```

```ts
// apps/web/src/app/dashboard/api/keys/route.ts
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { generateKey, hashKey } from "@/lib/keys";
export const runtime = "nodejs";
export async function POST(req: Request) {
  const { projectId, name } = await req.json();
  if (!projectId || !name)
    return NextResponse.json({ error: "projectId and name required" }, { status: 400 });
  const raw = generateKey();
  const prefix = raw.slice(0, 12);
  const hash = await hashKey(raw);
  const rows = await sql`
    insert into api_keys (project_id, name, key_prefix, key_hash)
    values (${projectId}, ${name}, ${prefix}, ${hash})
    returning id, key_prefix, created_at`;
  return NextResponse.json({ ...rows[0], key: raw }, { status: 201 }); // plaintext once
}
```

```ts
// apps/web/src/app/dashboard/api/keys/[id]/route.ts
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
export const runtime = "nodejs";
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await sql`update api_keys set revoked_at = now() where id = ${id} and revoked_at is null`;
  return NextResponse.json({ ok: true });
}
```

```ts
// apps/web/src/app/dashboard/api/usage/route.ts
import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { buildUsageQuery } from "@/lib/usageQuery";
export const runtime = "nodejs";
export async function GET(req: Request) {
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId") ?? undefined;
  const days = Number(url.searchParams.get("days") ?? "30");
  const { text, params } = buildUsageQuery({ projectId, days });
  const client = neon(process.env.DATABASE_URL!);
  const rows = await client.query(text, params);
  return NextResponse.json(rows);
}
```

- [ ] **Step 5: Run web tests to verify they pass**

Run: `cd apps/web && npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/api apps/web/src/lib/usageQuery.ts apps/web/src/lib/__tests__/usageQuery.test.ts
git commit -m "feat(web): dashboard api routes for keys, projects, usage"
```

---

## Task 8: Dashboard UI pages

**Files:**
- Create: `apps/web/src/app/dashboard/page.tsx` (projects + keys management)
- Create: `apps/web/src/app/dashboard/usage/page.tsx` (usage view)
- Create: `apps/web/src/app/dashboard/DashboardClient.tsx` (client component: forms, list, reveal-once key modal)

**Interfaces:**
- Consumes: the `/dashboard/api/*` route handlers (Task 7).
- Produces: rendered management + usage UI. No new exported types.

- [ ] **Step 1: Build the management page (server shell + client component)**

```tsx
// apps/web/src/app/dashboard/page.tsx
import DashboardClient from "./DashboardClient";
export const dynamic = "force-dynamic";
export default function DashboardPage() {
  return <DashboardClient />;
}
```

Implement `DashboardClient.tsx` to: fetch `GET /dashboard/api/projects`, list projects and their keys, a form to create a project, a form to create a key (on success show the plaintext `key` once in a copyable box with a warning it won't be shown again), and a revoke button calling `DELETE /dashboard/api/keys/[id]`. Follow the existing Tailwind/token styles used in `apps/web/src/components/Remover.tsx`.

- [ ] **Step 2: Build the usage page**

```tsx
// apps/web/src/app/dashboard/usage/page.tsx
async function getUsage(days: number) {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const res = await fetch(`${base}/dashboard/api/usage?days=${days}`, { cache: "no-store" });
  return res.json() as Promise<{ day: string; requests: number }[]>;
}
export const dynamic = "force-dynamic";
export default async function UsagePage() {
  const rows = await getUsage(30);
  const max = Math.max(1, ...rows.map((r) => r.requests));
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-xl font-medium">Usage (30 days)</h1>
      <div className="mt-6 space-y-1">
        {rows.map((r) => (
          <div key={r.day} className="flex items-center gap-2 text-sm">
            <span className="w-24 text-muted">{r.day.slice(0, 10)}</span>
            <span className="h-4 rounded bg-foreground" style={{ width: `${(r.requests / max) * 100}%` }} />
            <span>{r.requests}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Verify locally**

Run: `cd apps/web && DATABASE_URL=... npm run dev`, open `/dashboard`, create a project, create a key (confirm plaintext shows once), revoke it, open `/dashboard/usage`.
Expected: all actions work; usage bars render.

- [ ] **Step 4: Build passes**

Run: `cd apps/web && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/page.tsx apps/web/src/app/dashboard/usage/page.tsx apps/web/src/app/dashboard/DashboardClient.tsx
git commit -m "feat(web): dashboard UI for keys and usage"
```

---

## Task 9: Provision, wire env, protect, and roll out

**Files:**
- Modify: `apps/api/.env.example` (add `DATABASE_URL=`)
- Modify: `apps/web/.env.example` (add `DATABASE_URL=`)
- Modify: `README.md` (dashboard + DB section)

**Interfaces:** none (ops task).

- [ ] **Step 1: Provision Neon + apply migration**

Create a free Neon project; copy the pooled connection string. Then:
Run: `psql "$DATABASE_URL" -f db/migrations/0001_init.sql`
Expected: three tables + two seeded projects.

- [ ] **Step 2: Set secrets**

- Oracle box: add `DATABASE_URL=...` to `/opt/rembg/current/.env`; `sudo systemctl restart rembg.service`; confirm `/v1/health` still ok.
- Vercel: `printf '%s' "$DATABASE_URL" | vercel env add DATABASE_URL production` (and `preview`); redeploy.

- [ ] **Step 3: Protect the dashboard with Vercel Access**

In Vercel project settings → Deployment Protection / Access, restrict `/dashboard*` (or the project) to your account. Verify an incognito visit to `/dashboard` is blocked while `/` remains public.

- [ ] **Step 4: End-to-end verification**

Create a real project + key in the dashboard. Call the API with it:
Run: `curl -sS -o /dev/null -w "%{http_code}\n" -X POST https://api.rembg.site/v1/remove -H "Authorization: Bearer <new key>" -F file=@photo.jpg`
Expected: `200`, and a new row appears in `usage_events` for that key/project; `/dashboard/usage` count increments.

- [ ] **Step 5: Update docs + commit**

Document the dashboard URL, the DB, and the deprecation of static `API_KEYS` once callers migrate.

```bash
git add apps/api/.env.example apps/web/.env.example README.md
git commit -m "docs: dashboard + neon setup and rollout"
```

---

## Self-review notes

- Spec coverage: projects/keys/usage tables (Task 1); DB pool (2); key hashing+cache (3); auth resolution incl. web-ui/legacy attribution (4); fire-and-forget usage (5); web client+hash parity (6); create/revoke/usage APIs (7); UI (8); Neon provisioning + Vercel Access + rollout (9). All spec sections mapped.
- Degradation: Tasks 2/3/5 all no-op without a pool, satisfying the "removal never depends on DB" constraint.
- Hash parity between Python (`hashlib.sha256`) and JS (`crypto.subtle`) is explicitly pinned by a shared known-vector test in Task 6.
- Follow-up (not in this plan): per-key rate limiting, quota enforcement, user accounts, daily rollups — all deferred per spec.
