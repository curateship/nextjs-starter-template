import base64
import hashlib
import hmac
import json
from time import time
from typing import Any

from fastapi import HTTPException, Response, status

from app.config import get_settings
from app.models import SeoUser

SESSION_COOKIE_NAME = "whateverseo_session"


def _base64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def _base64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}".encode("utf-8"))


def _sign(encoded_payload: str, secret: str) -> str:
    digest = hmac.new(secret.encode("utf-8"), encoded_payload.encode("utf-8"), hashlib.sha256).digest()
    return _base64url_encode(digest)


def sign_token(payload: dict[str, Any], secret: str) -> str:
    encoded_payload = _base64url_encode(
        json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    signature = _sign(encoded_payload, secret)
    return f"{encoded_payload}.{signature}"


def verify_token(token: str, secret: str) -> dict[str, Any]:
    try:
        encoded_payload, signature = token.split(".", 1)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token format") from exc

    expected_signature = _sign(encoded_payload, secret)

    if not hmac.compare_digest(signature, expected_signature):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token signature")

    payload = json.loads(_base64url_decode(encoded_payload))
    exp = payload.get("exp")
    if not isinstance(exp, int) or exp <= int(time()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")

    return payload


def create_session_token(user: SeoUser) -> str:
    settings = get_settings()

    return sign_token(
        {
            "seo_user_id": user.id,
            "exp": int(time()) + settings.session_ttl_hours * 3600,
        },
        settings.session_secret,
    )


def set_session_cookie(response: Response, token: str, secure: bool) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=get_settings().session_ttl_hours * 3600,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response, secure: bool) -> None:
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
    )
