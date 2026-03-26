import hmac
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import SeoUser
from app.security import verify_token

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> SeoUser:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Authorization header")

    payload = verify_token(credentials.credentials, get_settings().session_secret)
    seo_user_id = payload.get("seo_user_id")
    if not isinstance(seo_user_id, str):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid SEO session")

    user = db.query(SeoUser).filter(SeoUser.id == seo_user_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="SEO user not found")

    if not user.seo_access:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SEO access disabled")

    return user


def require_super_admin(current_user: SeoUser = Depends(get_current_user)) -> SeoUser:
    if current_user.role != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="super_admin required")
    return current_user


def require_internal_service_token(request: Request) -> None:
    token = request.headers.get("x-seo-service-token")
    if token is None or not hmac.compare_digest(token, get_settings().internal_api_token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
