from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SeoUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    hub_user_id: str
    email: str
    role: str
    seo_access: bool


class WorkspaceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    created_at: datetime


class SsoExchangeRequest(BaseModel):
    code: str


class AuthMeOut(BaseModel):
    user: SeoUserOut


class WorkspaceListOut(BaseModel):
    workspaces: list[WorkspaceOut]


class WorkspaceCreateIn(BaseModel):
    name: str


class WorkspaceCreateOut(BaseModel):
    workspace: WorkspaceOut
