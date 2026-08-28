import asyncio
import logging
from app import db
from app.keys import Principal

logger = logging.getLogger("remove_bg.usage")

# The event loop only holds a weak reference to a scheduled task, so we must
# keep a strong reference around until it finishes or it can be garbage
# collected mid-flight, silently dropping the usage event.
_pending: set = set()


async def _insert(project_id, api_key_id, model, bytes_in, bytes_out, duration_ms, status, user_id):
    pool = db.get_pool()
    if pool is None:
        return
    try:
        await pool.execute(
            "insert into usage_events "
            "(project_id, api_key_id, model, bytes_in, bytes_out, duration_ms, status, user_id) "
            "values ($1, $2, $3, $4, $5, $6, $7, $8)",
            project_id, api_key_id, model, bytes_in, bytes_out, duration_ms, status, user_id,
        )
    except Exception:  # noqa: BLE001 — usage logging never affects the response
        logger.exception("usage insert failed")


def record_usage(principal: Principal, *, model: str, bytes_in: int,
                 bytes_out: int, duration_ms: int, status: int) -> None:
    task = asyncio.create_task(_insert(
        principal.project_id, principal.api_key_id, model,
        bytes_in, bytes_out, duration_ms, status, principal.user_id))
    _pending.add(task)
    task.add_done_callback(_pending.discard)
