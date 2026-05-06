from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class ModuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    key: str
    name: str
    description: str


class ModuleListOut(BaseModel):
    modules: list[ModuleOut]
