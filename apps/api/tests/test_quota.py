import logging
from datetime import datetime, timezone
from pathlib import Path

from app import quota

MAIN_PY = Path(__file__).resolve().parents[1] / "app" / "main.py"


def test_daily_quota_limit_default(monkeypatch):
    monkeypatch.delenv("DAILY_QUOTA_PER_PROJECT", raising=False)
    assert quota.daily_quota_limit() == 50


def test_daily_quota_limit_env_override(monkeypatch):
    monkeypatch.setenv("DAILY_QUOTA_PER_PROJECT", "12")
    assert quota.daily_quota_limit() == 12


def test_daily_quota_limit_invalid_falls_back(monkeypatch):
    monkeypatch.setenv("DAILY_QUOTA_PER_PROJECT", "nope")
    assert quota.daily_quota_limit() == 50


def test_utc_day_reset_unix_is_next_midnight():
    now = datetime(2026, 9, 16, 15, 30, tzinfo=timezone.utc)
    assert quota.utc_day_reset_unix(now) == int(
        datetime(2026, 9, 17, 0, 0, tzinfo=timezone.utc).timestamp()
    )


async def test_under_limit_allows(monkeypatch):
    monkeypatch.setenv("DAILY_QUOTA_PER_PROJECT", "50")

    class FakePool:
        async def fetchval(self, sql, *args):
            assert "usage_events" in sql
            assert "project_id" in sql
            assert args == ("proj-1",)
            return 49

    monkeypatch.setattr("app.db.get_pool", lambda: FakePool())
    check = await quota.check_daily_quota("proj-1")
    assert check.allowed is True
    assert check.checked is True
    assert check.used == 49
    assert check.remaining == 1
    assert check.limit == 50


async def test_at_limit_rejects(monkeypatch):
    monkeypatch.setenv("DAILY_QUOTA_PER_PROJECT", "50")

    class FakePool:
        async def fetchval(self, sql, *args):
            return 50

    monkeypatch.setattr("app.db.get_pool", lambda: FakePool())
    check = await quota.check_daily_quota("proj-1")
    assert check.allowed is False
    assert check.used == 50
    assert check.remaining == 0
    assert "50" in quota.exceeded_hint(check)
    assert "UTC midnight" in quota.exceeded_hint(check)
    headers = quota.quota_headers(check)
    assert headers["X-RateLimit-Limit"] == "50"
    assert headers["X-RateLimit-Remaining"] == "0"
    assert headers["X-Quota-Reset"] == str(check.reset_unix)


async def test_over_limit_rejects(monkeypatch):
    monkeypatch.setenv("DAILY_QUOTA_PER_PROJECT", "50")

    class FakePool:
        async def fetchval(self, sql, *args):
            return 51

    monkeypatch.setattr("app.db.get_pool", lambda: FakePool())
    check = await quota.check_daily_quota("proj-1")
    assert check.allowed is False
    assert check.used == 51
    assert check.remaining == 0


async def test_db_down_fails_open(monkeypatch, caplog):
    monkeypatch.setenv("DAILY_QUOTA_PER_PROJECT", "50")

    class FakePool:
        async def fetchval(self, sql, *args):
            raise RuntimeError("connection refused")

    monkeypatch.setattr("app.db.get_pool", lambda: FakePool())
    with caplog.at_level(logging.WARNING, logger="remove_bg.quota"):
        check = await quota.check_daily_quota("proj-1")
    assert check.allowed is True
    assert check.checked is False
    assert "fail open" in caplog.text


async def test_missing_pool_fails_open(monkeypatch, caplog):
    monkeypatch.setattr("app.db.get_pool", lambda: None)
    with caplog.at_level(logging.WARNING, logger="remove_bg.quota"):
        check = await quota.check_daily_quota("proj-1")
    assert check.allowed is True
    assert check.checked is False
    assert "pool unavailable" in caplog.text


async def test_count_sql_uses_utc_day_trunc(monkeypatch):
    captured = {}

    class FakePool:
        async def fetchval(self, sql, *args):
            captured["sql"] = sql
            captured["args"] = args
            return 0

    monkeypatch.setattr("app.db.get_pool", lambda: FakePool())
    await quota.check_daily_quota("web-ui")
    sql = captured["sql"]
    assert "from usage_events" in sql
    assert "project_id = $1" in sql
    assert "date_trunc('day', now() at time zone 'utc')" in sql
    assert captured["args"] == ("web-ui",)


def test_health_handler_does_not_call_quota():
    text = MAIN_PY.read_text()
    start = text.index("async def health")
    end = text.index("def _guess_allowed")
    assert "quota" not in text[start:end]


def test_remove_checks_quota_after_auth_before_lock():
    text = MAIN_PY.read_text()
    start = text.index("async def remove_bg")
    auth_at = text.index("Depends(verify_auth)", start)
    quota_at = text.index("check_daily_quota", start)
    lock_at = text.index("inference_lock.acquire", start)
    assert auth_at < quota_at < lock_at
    assert "quota_exceeded" in text[start:]
