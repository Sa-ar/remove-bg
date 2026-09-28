from app import db


def test_get_pool_is_none_before_init():
    assert db.get_pool() is None


def test_pool_does_not_hold_warm_idle_connection():
    assert db.POOL_MIN_SIZE == 0
    assert db.POOL_MAX_SIZE >= 1
    assert db.POOL_MAX_INACTIVE_CONNECTION_LIFETIME > 0


async def test_init_pool_noop_without_url(monkeypatch):
    monkeypatch.setattr(db, "DATABASE_URL", None)
    await db.init_pool()
    assert db.get_pool() is None


async def test_init_pool_uses_scale_to_zero_settings(monkeypatch):
    captured: dict = {}

    async def fake_create_pool(dsn, **kwargs):
        captured["dsn"] = dsn
        captured["kwargs"] = kwargs
        return object()

    monkeypatch.setattr(db, "DATABASE_URL", "postgres://example.invalid/db")
    monkeypatch.setattr(db.asyncpg, "create_pool", fake_create_pool)
    try:
        await db.init_pool()
        assert captured["dsn"] == "postgres://example.invalid/db"
        assert captured["kwargs"]["min_size"] == 0
        assert captured["kwargs"]["max_size"] == db.POOL_MAX_SIZE
        assert (
            captured["kwargs"]["max_inactive_connection_lifetime"]
            == db.POOL_MAX_INACTIVE_CONNECTION_LIFETIME
        )
        assert db.get_pool() is not None
    finally:
        db._pool = None
