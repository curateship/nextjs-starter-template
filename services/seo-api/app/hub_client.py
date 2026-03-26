import json
from urllib import error, request

from fastapi import HTTPException, status

from app.config import get_settings


def redeem_hub_launch_code(code: str) -> dict:
    body = _post_json(get_settings().hub_redeem_url, {"code": code})
    access = body.get("access")

    if not isinstance(access, dict):
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Hub redeem response invalid")

    return access


def fetch_hub_access(hub_user_id: str) -> dict:
    body = _post_json(get_settings().hub_access_url, {"hub_user_id": hub_user_id})
    access = body.get("access")

    if not isinstance(access, dict):
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Hub access response invalid")

    return access


def _post_json(url: str, payload: dict) -> dict:
    settings = get_settings()
    req = request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-seo-service-token": settings.internal_api_token,
        },
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=10) as response:
            data = response.read().decode("utf-8")
    except error.HTTPError as exc:
        detail = _load_error_detail(exc)
        raise HTTPException(status_code=exc.code, detail=detail) from exc
    except error.URLError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Hub service unavailable") from exc

    try:
        body = json.loads(data)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Hub returned invalid JSON") from exc

    if not isinstance(body, dict):
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Hub returned invalid response")

    return body


def _load_error_detail(exc: error.HTTPError) -> str:
    try:
        body = json.loads(exc.read().decode("utf-8"))
    except (OSError, json.JSONDecodeError):
        return "Hub request failed"

    detail = body.get("error") or body.get("detail")
    if isinstance(detail, str) and detail:
        return detail

    return "Hub request failed"
