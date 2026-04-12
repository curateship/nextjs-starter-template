import hmac

from fastapi import HTTPException, Request, status

from app.config import get_settings


def require_admin_token(request: Request) -> None:
    token = request.headers.get("x-admin-token")
    if token is None or not hmac.compare_digest(token, get_settings().admin_token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
