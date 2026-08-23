import asyncio
from app import usage, keys


async def test_record_usage_inserts(monkeypatch):
    captured = {}
    class FakePool:
        async def execute(self, sql, *args):
            captured["sql"] = sql
            captured["args"] = args
    monkeypatch.setattr("app.db.get_pool", lambda: FakePool())
    usage.record_usage(keys.Principal("api_key", "p1", "k1"),
                       model="isnet-general-use", bytes_in=10, bytes_out=20,
                       duration_ms=30, status=200)
    await asyncio.sleep(0)  # let the task run
    assert "insert into usage_events" in captured["sql"]
    assert captured["args"][0] == "p1" and captured["args"][1] == "k1"

async def test_record_usage_noop_without_pool(monkeypatch):
    monkeypatch.setattr("app.db.get_pool", lambda: None)
    usage.record_usage(keys.Principal("ui", "web"), model="m",
                       bytes_in=0, bytes_out=0, duration_ms=0, status=200)
    await asyncio.sleep(0)  # must not raise
