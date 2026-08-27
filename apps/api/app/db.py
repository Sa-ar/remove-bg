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
