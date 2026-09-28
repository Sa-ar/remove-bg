import logging
import os
from typing import Optional

import asyncpg

logger = logging.getLogger("remove_bg.db")
DATABASE_URL: Optional[str] = os.getenv("DATABASE_URL") or None
_pool: Optional[asyncpg.Pool] = None

# Oracle systemd is always-on. A warm min_size>=1 connection pins Neon compute
# awake and burns CU-hours. min_size=0 opens nothing until the first acquire;
# idle connections are closed so Neon can scale to zero.
POOL_MIN_SIZE = 0
POOL_MAX_SIZE = 5
POOL_MAX_INACTIVE_CONNECTION_LIFETIME = 60.0


def get_pool() -> Optional[asyncpg.Pool]:
    return _pool


async def init_pool() -> None:
    global _pool
    if not DATABASE_URL:
        logger.warning("DATABASE_URL not set; keys/usage disabled")
        return
    _pool = await asyncpg.create_pool(
        DATABASE_URL,
        min_size=POOL_MIN_SIZE,
        max_size=POOL_MAX_SIZE,
        max_inactive_connection_lifetime=POOL_MAX_INACTIVE_CONNECTION_LIFETIME,
    )
    logger.info(
        "DB pool ready (min_size=%s, max_size=%s, max_inactive=%.0fs)",
        POOL_MIN_SIZE,
        POOL_MAX_SIZE,
        POOL_MAX_INACTIVE_CONNECTION_LIFETIME,
    )


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
