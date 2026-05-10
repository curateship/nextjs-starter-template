from time import time

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import get_current_user, require_app_origin
from app.models import CustomShellSession, CustomShellUser
from app.schemas import AuthLoginIn, AuthMeOut
from app.security import (
    SESSION_COOKIE_NAME,
    clear_session_cookie,
    create_session_expires_at,
    create_session_token,
    hash_session_token,
    set_session_cookie,
    verify_password,
)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

LOGIN_MAX_ATTEMPTS = 5
LOGIN_WINDOW_SECONDS = 15 * 60
_login_failures: dict[str, list[float]] = {}


@router.post("/login", response_model=AuthMeOut)
def login(
    credentials: AuthLoginIn,
    request: Request,
    response: Response,
    _: None = Depends(require_app_origin),
    db: Session = Depends(get_db),
) -> AuthMeOut:
    email = credentials.email.strip().lower()
    rate_limit_key = _get_login_rate_limit_key(request, email)
    _enforce_login_rate_limit(rate_limit_key)

    user = db.query(CustomShellUser).filter(func.lower(CustomShellUser.email) == email).first()

    if user is None or not verify_password(user.password_hash, credentials.password):
        _record_failed_login(rate_limit_key)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    _clear_failed_logins(rate_limit_key)
    token = create_session_token()
    db.add(
        CustomShellSession(
            user_id=user.id,
            token_hash=hash_session_token(token),
            expires_at=create_session_expires_at(),
        )
    )
    db.commit()

    set_session_cookie(response, token, secure=request.url.scheme == "https")
    return AuthMeOut(user=user)


@router.get("/me", response_model=AuthMeOut)
def me(current_user: CustomShellUser = Depends(get_current_user)) -> AuthMeOut:
    return AuthMeOut(user=current_user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    response: Response,
    _: None = Depends(require_app_origin),
    db: Session = Depends(get_db),
) -> Response:
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if token:
        db.query(CustomShellSession).filter(CustomShellSession.token_hash == hash_session_token(token)).delete()
        db.commit()

    response.status_code = status.HTTP_204_NO_CONTENT
    clear_session_cookie(response, secure=request.url.scheme == "https")
    return response


def _get_login_rate_limit_key(request: Request, email: str) -> str:
    ip = request.client.host if request.client else "unknown"
    return f"{ip}:{email}"


def _enforce_login_rate_limit(key: str) -> None:
    attempts = _recent_failed_logins(key)
    if len(attempts) >= LOGIN_MAX_ATTEMPTS:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many login attempts")


def _record_failed_login(key: str) -> None:
    attempts = _recent_failed_logins(key)
    attempts.append(time())
    _login_failures[key] = attempts


def _clear_failed_logins(key: str) -> None:
    _login_failures.pop(key, None)


def _recent_failed_logins(key: str) -> list[float]:
    cutoff = time() - LOGIN_WINDOW_SECONDS
    attempts = [attempt for attempt in _login_failures.get(key, []) if attempt > cutoff]
    _login_failures[key] = attempts
    return attempts
