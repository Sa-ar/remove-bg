import logging
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from app import db

logger = logging.getLogger("remove_bg.quota")

DEFAULT_DAILY_QUOTA_PER_PROJECT = 50

COUNT_TODAY_SQL = (
    "select count(*) from usage_events "
    "where project_id = $1 "
    "and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'"
)


@dataclass(frozen=True)
class QuotaCheck:
    allowed: bool
    limit: int
    used: int
    remaining: int
    reset_unix: int
    checked: bool = True


def daily_quota_limit() -> int:
    raw = os.getenv("DAILY_QUOTA_PER_PROJECT", str(DEFAULT_DAILY_QUOTA_PER_PROJECT))
    try:
        return max(0, int(raw))
    except (TypeError, ValueError):
        logger.warning(
            "invalid DAILY_QUOTA_PER_PROJECT=%r; using %s",
            raw,
            DEFAULT_DAILY_QUOTA_PER_PROJECT,
        )
        return DEFAULT_DAILY_QUOTA_PER_PROJECT


def utc_day_reset_unix(now: Optional[datetime] = None) -> int:
    current = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    start = current.replace(hour=0, minute=0, second=0, microsecond=0)
    return int((start + timedelta(days=1)).timestamp())


def _pass(limit: int, *, checked: bool, used: int = 0) -> QuotaCheck:
    remaining = max(0, limit - used) if checked else limit
    return QuotaCheck(
        allowed=True,
        limit=limit,
        used=used,
        remaining=remaining,
        reset_unix=utc_day_reset_unix(),
        checked=checked,
    )


def exceeded_hint(check: QuotaCheck) -> str:
    return (
        f"Free tier allows {check.limit} removals per project per UTC day. "
        f"This project has used {check.used}. "
        f"The limit resets at the next UTC midnight (unix {check.reset_unix})."
    )


def quota_headers(check: QuotaCheck) -> dict[str, str]:
    return {
        "X-RateLimit-Limit": str(check.limit),
        "X-RateLimit-Remaining": str(check.remaining),
        "X-Quota-Reset": str(check.reset_unix),
    }


async def check_daily_quota(project_id: str) -> QuotaCheck:
    """Return today's per-project usage vs the daily cap.

    Fail-open: if the pool is missing or the count cannot be read, allow the
    request and log a warning. Inference never depends on the database.
    """
    limit = daily_quota_limit()
    pool = db.get_pool()
    if pool is None:
        logger.warning(
            "daily quota skipped: database pool unavailable (fail open) project_id=%s",
            project_id,
        )
        return _pass(limit, checked=False)

    try:
        count = await pool.fetchval(COUNT_TODAY_SQL, project_id)
    except Exception:  # noqa: BLE001 — quota must not block inference
        logger.warning(
            "daily quota count failed; allowing request (fail open) project_id=%s",
            project_id,
            exc_info=True,
        )
        return _pass(limit, checked=False)

    used = int(count or 0)
    if used >= limit:
        return QuotaCheck(
            allowed=False,
            limit=limit,
            used=used,
            remaining=0,
            reset_unix=utc_day_reset_unix(),
            checked=True,
        )
    return _pass(limit, checked=True, used=used)
