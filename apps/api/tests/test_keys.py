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
