from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.models import ScraperRun


class ModuleInputError(ValueError):
    pass


class ModuleRunError(Exception):
    pass


@dataclass(frozen=True)
class ModuleManifest:
    key: str
    name: str
    description: str
    capabilities: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ModuleExecutionResult:
    payload: dict[str, Any]


@dataclass(frozen=True)
class ModulePersistResult:
    raw_items: int
    results: int


@dataclass(frozen=True)
class ModuleHandler:
    manifest: ModuleManifest
    input_model: type[BaseModel]
    execute: Callable[[dict[str, Any]], ModuleExecutionResult]
    persist: Callable[[Session, ScraperRun, ModuleExecutionResult], ModulePersistResult]

    def validate_input(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self.input_model.model_validate(payload).model_dump(mode="json")
