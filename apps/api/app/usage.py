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
