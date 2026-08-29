import asyncio
import io
import logging
import os
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Optional

import jwt
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from jwt.exceptions import InvalidTokenError
from PIL import Image
from pillow_heif import register_heif_opener
from pydantic import BaseModel
from rembg import new_session, remove
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app import db, keys, usage
from app.keys import Principal

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

logger = logging.getLogger("remove_bg")
logging.basicConfig(level=logging.INFO)

register_heif_opener()

MAX_BYTES = 15 * 1024 * 1024
ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
}
# Default model is the fast isnet; birefnet-general is available as an opt-in
# override for callers who want maximum quality (much slower on CPU).
DEFAULT_MODEL = os.getenv("MODEL", "isnet-general-use")
ALLOWED_MODELS = {
    m.strip()
    for m in os.getenv("ALLOWED_MODELS", "isnet-general-use,birefnet-general").split(",")
    if m.strip()
}
ALLOWED_MODELS.add(DEFAULT_MODEL)
API_KEYS = {k.strip() for k in os.getenv("API_KEYS", "").split(",") if k.strip()}
UI_TOKEN_SECRET = os.getenv("UI_TOKEN_SECRET", "")
WEB_ORIGIN = os.getenv("WEB_ORIGIN", "http://localhost:3000").rstrip("/")
# Always allow the production custom domain. WEB_ORIGIN on the box was left
# pointing at the Vercel *.vercel.app URL, which made rembg.site look "down".
PRODUCTION_CORS_ORIGINS = (
    "https://www.rembg.site",
    "https://rembg.site",
    "https://remove-bg-five-topaz.vercel.app",
)

# Sessions are loaded lazily and cached per model name.
_sessions: dict[str, object] = {}
_sessions_lock = threading.Lock()
model_ready = False
model_error: Optional[str] = None
inference_lock = asyncio.Lock()


class ErrorBody(BaseModel):
    error: str
    code: str
    hint: str


class HealthBody(BaseModel):
    status: str
    model: str
    models: list[str]
    device: str


def _parse_origins() -> list[str]:
    origins: list[str] = []
    for candidate in (WEB_ORIGIN, *PRODUCTION_CORS_ORIGINS):
        origin = (candidate or "").strip().rstrip("/")
        if origin and origin not in origins:
            origins.append(origin)
    extra = os.getenv("EXTRA_CORS_ORIGINS", "")
    for part in extra.split(","):
        origin = part.strip().rstrip("/")
        if origin and origin not in origins:
            origins.append(origin)
    for local in ("http://localhost:3000", "http://127.0.0.1:3000"):
        if local not in origins:
            origins.append(local)
    return origins


def get_limiter_key(request: Request) -> str:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return f"bearer:{auth[7:24]}"
    return get_remote_address(request)


limiter = Limiter(key_func=get_limiter_key)


def _get_session(name: str):
    session = _sessions.get(name)
    if session is None:
        with _sessions_lock:
            session = _sessions.get(name)
            if session is None:
                logger.info("Loading model %s", name)
                session = new_session(name)
                _sessions[name] = session
                logger.info("Model ready: %s", name)
    return session


def _load_model() -> None:
    global model_ready, model_error
    try:
        _get_session(DEFAULT_MODEL)
        model_ready = True
        model_error = None
    except Exception as exc:  # noqa: BLE001
        model_ready = False
        model_error = str(exc)
        logger.exception("Failed to load model")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await db.init_pool()
    await asyncio.to_thread(_load_model)
    yield
    await db.close_pool()


app = FastAPI(
    title="Remove BG API",
    version="1.0.0",
    description="Background removal via rembg (isnet-general-use by default, birefnet-general opt-in via the `model` field).",
    lifespan=lifespan,
)
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(_request: Request, _exc: RateLimitExceeded):
    return error_response(
        429,
        "Rate limit exceeded",
        "rate_limited",
        "Slow down — free tier allows 30 requests per minute per key/IP.",
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=_parse_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


def error_response(status: int, error: str, code: str, hint: str) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content=ErrorBody(error=error, code=code, hint=hint).model_dump(),
    )


async def verify_auth(
    authorization: Annotated[Optional[str], Header()] = None,
) -> Principal:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail={
                "error": "Missing or invalid Authorization header",
                "code": "unauthorized",
                "hint": "Send Authorization: Bearer <API_KEY> or a UI JWT",
            },
        )
    token = authorization[7:].strip()
    if not token:
        raise HTTPException(
            status_code=401,
            detail={
                "error": "Empty bearer token",
                "code": "unauthorized",
                "hint": "Provide a non-empty API key or UI token",
            },
        )
    # 1) UI JWT (signed-in website). `sub` is the Neon Auth user id when present.
    if UI_TOKEN_SECRET:
        try:
            payload = jwt.decode(token, UI_TOKEN_SECRET, algorithms=["HS256"])
            if payload.get("purpose") == "ui-upload":
                sub = payload.get("sub")
                user_id = sub.strip() if isinstance(sub, str) and sub.strip() else None
                return Principal("ui", keys.WEB_UI_PROJECT_ID, user_id=user_id)
        except InvalidTokenError:
            pass
    # 2) legacy static keys
    if token in API_KEYS:
        return Principal("legacy", keys.LEGACY_PROJECT_ID)
    # 3) DB-backed project key
    principal = await keys.resolve_api_key(token)
    if principal is not None:
        return principal
    raise HTTPException(
        status_code=401,
        detail={
            "error": "Invalid API key",
            "code": "unauthorized",
            "hint": "Check the key, or that it is not revoked. UI tokens require UI_TOKEN_SECRET.",
        },
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(_request: Request, exc: HTTPException):
    if isinstance(exc.detail, dict) and "code" in exc.detail:
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return error_response(
        exc.status_code,
        str(exc.detail),
        "http_error",
        "See API docs at /docs",
    )


@app.get("/v1/health", response_model=None)
async def health():
    if not model_ready:
        return error_response(
            503,
            "Worker is loading the model" if not model_error else "Model failed to load",
            "waking" if not model_error else "model_error",
            model_error
            or "The model is still loading; retry in a few seconds.",
        )
    return HealthBody(
        status="ok", model=DEFAULT_MODEL, models=sorted(ALLOWED_MODELS), device="cpu"
    )


def _guess_allowed(content_type: Optional[str], filename: Optional[str]) -> bool:
    if content_type and content_type.split(";")[0].strip().lower() in ALLOWED_CONTENT_TYPES:
        return True
    if filename:
        lower = filename.lower()
        return lower.endswith((".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"))
    return False


def _run_remove(data: bytes, crop: bool, model_name: str) -> bytes:
    session = _get_session(model_name)
    output = remove(
        data,
        session=session,
        force_return_bytes=True,
        only_mask=False,
        post_process_mask=True,
    )
    if not crop:
        return bytes(output)
    image = Image.open(io.BytesIO(output)).convert("RGBA")
    bbox = image.getbbox()
    if bbox:
        image = image.crop(bbox)
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return buf.getvalue()


@app.post(
    "/v1/remove",
    response_model=None,
    responses={
        200: {
            "content": {"image/png": {}},
            "description": "PNG with alpha channel",
        },
        400: {"model": ErrorBody},
        401: {"model": ErrorBody},
        413: {"model": ErrorBody},
        429: {"model": ErrorBody},
        503: {"model": ErrorBody},
        500: {"model": ErrorBody},
    },
)
@limiter.limit("30/minute")
async def remove_bg(
    request: Request,
    file: UploadFile = File(...),
    crop: bool = Form(False),
    model: str = Form(DEFAULT_MODEL),
    principal: Principal = Depends(verify_auth),
) -> Response:
    if not model_ready:
        return error_response(
            503,
            "Worker is not ready",
            "waking",
            "The worker is still loading the model. Retry in a few seconds.",
        )

    if not _guess_allowed(file.content_type, file.filename):
        return error_response(
            400,
            "Unsupported file type",
            "invalid_type",
            "Upload JPEG, PNG, WebP, or HEIC.",
        )

    if model not in ALLOWED_MODELS:
        return error_response(
            400,
            f"Unknown model '{model}'",
            "invalid_model",
            f"Allowed models: {', '.join(sorted(ALLOWED_MODELS))}.",
        )

    data = await file.read()
    if len(data) == 0:
        return error_response(
            400,
            "Empty file",
            "invalid_file",
            "Upload a non-empty image.",
        )
    if len(data) > MAX_BYTES:
        return error_response(
            413,
            "File too large",
            "too_large",
            f"Max size is {MAX_BYTES // (1024 * 1024)}MB.",
        )

    _t0 = time.monotonic()
    try:
        await asyncio.wait_for(inference_lock.acquire(), timeout=90.0)
    except TimeoutError:
        return error_response(
            429,
            "Worker busy",
            "busy",
            "Free tier runs one inference at a time. Retry shortly.",
        )

    try:
        try:
            png = await asyncio.to_thread(_run_remove, data, crop, model)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Inference failed")
            return error_response(
                500,
                "Inference failed",
                "inference_error",
                str(exc),
            )
    finally:
        inference_lock.release()

    usage.record_usage(
        principal,
        model=model,
        bytes_in=len(data),
        bytes_out=len(png),
        duration_ms=int((time.monotonic() - _t0) * 1000),
        status=200,
    )

    return Response(
        content=png,
        media_type="image/png",
        headers={
            "Content-Disposition": 'inline; filename="removed.png"',
            "Cache-Control": "no-store",
        },
    )


@app.get("/")
async def root():
    return {
        "service": "remove-bg",
        "docs": "/docs",
        "health": "/v1/health",
        "remove": "POST /v1/remove",
    }
