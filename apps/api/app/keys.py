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
    user_id: Optional[str] = None


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
