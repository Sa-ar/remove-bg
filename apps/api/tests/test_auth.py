import jwt
import pytest
from fastapi import HTTPException
from app import main, keys


@pytest.fixture(autouse=True)
def _secrets(monkeypatch):
    monkeypatch.setattr(main, "API_KEYS", {"legacy-key"})
    monkeypatch.setattr(main, "UI_TOKEN_SECRET", "s3cret")


async def test_ui_jwt_maps_to_web_ui(monkeypatch):
    tok = jwt.encode({"purpose": "ui-upload"}, "s3cret", algorithm="HS256")
    p = await main.verify_auth(f"Bearer {tok}")
    assert p.kind == "ui" and p.project_id == keys.WEB_UI_PROJECT_ID
    assert p.user_id is None


async def test_ui_jwt_carries_sub_as_user_id():
    tok = jwt.encode(
        {"purpose": "ui-upload", "sub": "user-42"},
        "s3cret",
        algorithm="HS256",
    )
    p = await main.verify_auth(f"Bearer {tok}")
    assert p.kind == "ui" and p.user_id == "user-42"


async def test_static_key_maps_to_legacy():
    p = await main.verify_auth("Bearer legacy-key")
    assert p.kind == "legacy" and p.project_id == keys.LEGACY_PROJECT_ID


async def test_db_key_resolved(monkeypatch):
    async def fake_resolve(raw):
        return keys.Principal("api_key", "proj-9", "key-9")
    monkeypatch.setattr(keys, "resolve_api_key", fake_resolve)
    p = await main.verify_auth("Bearer rmbg_live")
    assert p.api_key_id == "key-9" and p.project_id == "proj-9"


async def test_unknown_key_401(monkeypatch):
    async def fake_resolve(raw):
        return None
    monkeypatch.setattr(keys, "resolve_api_key", fake_resolve)
    with pytest.raises(HTTPException) as e:
        await main.verify_auth("Bearer rmbg_nope")
    assert e.value.status_code == 401
