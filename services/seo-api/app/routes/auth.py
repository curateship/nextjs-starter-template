from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import get_current_user
from app.models import SeoUser
from app.schemas import AuthMeOut, SeoSessionOut, SsoExchangeRequest
from app.security import create_session_token, verify_hub_sso_token

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/sso/exchange", response_model=SeoSessionOut)
def exchange_hub_sso_token(payload: SsoExchangeRequest, db: Session = Depends(get_db)) -> SeoSessionOut:
    claims = verify_hub_sso_token(payload.token)

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

    return SeoSessionOut(
        token=create_session_token(user),
        user=user,
    )


@router.get("/me", response_model=AuthMeOut)
def get_authenticated_user(current_user: SeoUser = Depends(get_current_user)) -> AuthMeOut:
    return AuthMeOut(user=current_user)
