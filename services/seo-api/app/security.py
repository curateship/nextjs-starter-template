import base64
import hashlib
import hmac
import json
from time import time
from typing import Any

from fastapi import HTTPException, status

from app.config import get_settings
from app.models import SeoUser


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


def verify_hub_sso_token(token: str) -> dict[str, Any]:
    claims = verify_token(token, get_settings().hub_sso_secret)

    required_fields = ["hub_user_id", "email", "role", "seo_access", "exp"]
    missing = [field for field in required_fields if field not in claims]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Hub token missing fields: {', '.join(missing)}",
        )

    return claims


def create_session_token(user: SeoUser) -> str:
    settings = get_settings()

    return sign_token(
        {
            "seo_user_id": user.id,
            "hub_user_id": user.hub_user_id,
            "email": user.email,
            "role": user.role,
            "seo_access": user.seo_access,
            "exp": int(time()) + settings.session_ttl_hours * 3600,
        },
        settings.session_secret,
    )
