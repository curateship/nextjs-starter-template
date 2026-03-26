from urllib.parse import parse_qs

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.hub_client import redeem_hub_launch_code
from app.dependencies import get_current_user, require_hub_or_seo_origin, require_seo_app_origin
from app.models import SeoUser
from app.schemas import AuthMeOut, SsoExchangeRequest
from app.security import clear_session_cookie, create_session_token, set_session_cookie

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/sso/exchange")
async def exchange_hub_sso_token(
    request: Request,
    response: Response,
    _: None = Depends(require_hub_or_seo_origin),
    db: Session = Depends(get_db),
):
    payload = await _read_exchange_payload(request)
    claims = redeem_hub_launch_code(payload.code)

    if not claims["seo_access"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SEO access disabled")

    user = db.query(SeoUser).filter(SeoUser.hub_user_id == claims["hub_user_id"]).first()

    if user is None:
        user = SeoUser(
            hub_user_id=claims["hub_user_id"],
            email=claims["email"],
            role=claims["role"],
            seo_access=bool(claims["seo_access"]),
        )
        db.add(user)
    else:
        user.email = claims["email"]
        user.role = claims["role"]
        user.seo_access = bool(claims["seo_access"])

    db.commit()
    db.refresh(user)

    secure = request.url.scheme == "https"

    if _prefers_navigation_response(request):
        redirect = RedirectResponse(url=get_settings().seo_app_origin, status_code=status.HTTP_303_SEE_OTHER)
        set_session_cookie(redirect, create_session_token(user), secure=secure)
        return redirect

    set_session_cookie(response, create_session_token(user), secure=secure)

    return AuthMeOut(user=user)


@router.get("/me", response_model=AuthMeOut)
def get_authenticated_user(current_user: SeoUser = Depends(get_current_user)) -> AuthMeOut:
    return AuthMeOut(user=current_user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    response: Response,
    _: None = Depends(require_seo_app_origin),
) -> Response:
    response.status_code = status.HTTP_204_NO_CONTENT
    clear_session_cookie(response, secure=request.url.scheme == "https")
    return response


async def _read_exchange_payload(request: Request) -> SsoExchangeRequest:
    content_type = request.headers.get("content-type", "")
    body = await request.body()

    if "application/json" in content_type:
        return SsoExchangeRequest.model_validate_json(body)

    if "application/x-www-form-urlencoded" in content_type:
        parsed = parse_qs(body.decode("utf-8"), keep_blank_values=True)
        code = parsed.get("code", [""])[0]
        return SsoExchangeRequest(code=code)

    raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Unsupported content type")


def _prefers_navigation_response(request: Request) -> bool:
    content_type = request.headers.get("content-type", "")
    return "application/x-www-form-urlencoded" in content_type
