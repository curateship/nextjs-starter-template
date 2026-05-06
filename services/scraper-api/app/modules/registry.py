from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from app.models import ScraperModule
from app.modules.base import ModuleHandler
from app.modules.page_metadata import handler as page_metadata_handler

MODULE_REGISTRY: dict[str, ModuleHandler] = {
    page_metadata_handler.manifest.key: page_metadata_handler,
}


def list_modules() -> list[ModuleHandler]:
    return list(MODULE_REGISTRY.values())


def get_module(key: str) -> Optional[ModuleHandler]:
    return MODULE_REGISTRY.get(key)


def seed_modules(db: Session) -> None:
    for handler in list_modules():
        manifest = handler.manifest
        existing = db.get(ScraperModule, manifest.key)
        if existing is None:
            db.add(
                ScraperModule(
                    key=manifest.key,
                    name=manifest.name,
                    description=manifest.description,
                    enabled=True,
                    capabilities=manifest.capabilities,
                )
            )
            continue

        existing.name = manifest.name
        existing.description = manifest.description
        existing.capabilities = manifest.capabilities

    db.commit()
