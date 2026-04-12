from sqlalchemy.orm import Session

from app.models import ScraperModule

MODULE_KEY_GOOGLE_MAPS_SEARCH = "google_maps_search"

MODULE_REGISTRY = [
    {
        "key": MODULE_KEY_GOOGLE_MAPS_SEARCH,
        "name": "Google Maps Search",
        "description": "Search Google Maps by keyword and area and persist lead fields only.",
    }
]


def seed_modules(db: Session) -> None:
    for module in MODULE_REGISTRY:
        existing = db.get(ScraperModule, module["key"])
        if existing is None:
            db.add(ScraperModule(**module))
            continue

        existing.name = module["name"]
        existing.description = module["description"]

    db.commit()
