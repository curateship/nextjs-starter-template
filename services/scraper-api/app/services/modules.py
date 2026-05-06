from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models import ScraperModule


@dataclass(frozen=True)
class ModuleDefinition:
    key: str
    name: str
    description: str


MODULE_REGISTRY: list[ModuleDefinition] = []


def list_module_definitions() -> list[ModuleDefinition]:
    return MODULE_REGISTRY.copy()


def seed_modules(db: Session) -> None:
    for module in MODULE_REGISTRY:
        existing = db.get(ScraperModule, module.key)
        if existing is None:
            db.add(
                ScraperModule(
                    key=module.key,
                    name=module.name,
                    description=module.description,
                )
            )
            continue

        existing.name = module.name
        existing.description = module.description

    db.commit()
