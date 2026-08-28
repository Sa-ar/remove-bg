from app import main


def test_parse_origins_includes_custom_domain(monkeypatch):
    monkeypatch.setattr(main, "WEB_ORIGIN", "http://localhost:3000")
    monkeypatch.delenv("EXTRA_CORS_ORIGINS", raising=False)
    origins = main._parse_origins()
    assert "https://www.rembg.site" in origins
    assert "https://rembg.site" in origins
    assert "https://remove-bg-five-topaz.vercel.app" in origins
    assert "http://localhost:3000" in origins


def test_parse_origins_keeps_extra_and_web_origin(monkeypatch):
    monkeypatch.setattr(main, "WEB_ORIGIN", "https://preview.example")
    monkeypatch.setenv("EXTRA_CORS_ORIGINS", "https://extra.example")
    origins = main._parse_origins()
    assert origins[0] == "https://preview.example"
    assert "https://extra.example" in origins
    assert "https://www.rembg.site" in origins
