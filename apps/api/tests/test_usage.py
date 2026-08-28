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
    assert captured["args"][7] is None


async def test_record_usage_passes_user_id(monkeypatch):
    captured = {}
    class FakePool:
        async def execute(self, sql, *args):
            captured["sql"] = sql
            captured["args"] = args
    monkeypatch.setattr("app.db.get_pool", lambda: FakePool())
    usage.record_usage(
        keys.Principal("ui", "web-ui", user_id="user-42"),
        model="isnet-general-use", bytes_in=10, bytes_out=20,
        duration_ms=30, status=200)
    await asyncio.sleep(0)
    assert captured["args"][7] == "user-42"


async def test_record_usage_falls_back_without_user_id_column(monkeypatch):
    calls = []
    class FakePool:
        async def execute(self, sql, *args):
            calls.append(sql)
            if "user_id" in sql:
                raise RuntimeError("column user_id does not exist")
    monkeypatch.setattr("app.db.get_pool", lambda: FakePool())
    usage.record_usage(keys.Principal("ui", "web-ui", user_id="user-42"),
                       model="m", bytes_in=1, bytes_out=1, duration_ms=1, status=200)
    await asyncio.sleep(0)
    assert len(calls) == 2
    assert "user_id" in calls[0]
    assert "user_id" not in calls[1]

async def test_record_usage_noop_without_pool(monkeypatch):
    monkeypatch.setattr("app.db.get_pool", lambda: None)
    usage.record_usage(keys.Principal("ui", "web"), model="m",
                       bytes_in=0, bytes_out=0, duration_ms=0, status=200)
    await asyncio.sleep(0)  # must not raise


async def test_record_usage_keeps_strong_reference_until_done(monkeypatch):
    started = asyncio.Event()
    release = asyncio.Event()
    class FakePool:
        async def execute(self, sql, *args):
            started.set()
            await release.wait()
    monkeypatch.setattr("app.db.get_pool", lambda: FakePool())
    usage._pending.clear()
    usage.record_usage(keys.Principal("api_key", "p1", "k1"),
                       model="m", bytes_in=1, bytes_out=1, duration_ms=1, status=200)
    await started.wait()
    # The task must be held strongly while pending, else it could be GC'd.
    assert len(usage._pending) == 1
    task = next(iter(usage._pending))
    assert not task.done()
    release.set()
    await asyncio.sleep(0)
    await asyncio.sleep(0)
    assert len(usage._pending) == 0
