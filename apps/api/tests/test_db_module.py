from app import db


def test_get_pool_is_none_before_init():
    assert db.get_pool() is None


async def test_init_pool_noop_without_url(monkeypatch):
    monkeypatch.setattr(db, "DATABASE_URL", None)
    await db.init_pool()
    assert db.get_pool() is None
