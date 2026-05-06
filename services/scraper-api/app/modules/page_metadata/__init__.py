from app.modules.base import ModuleHandler

from .manifest import MANIFEST
from .schemas import PageMetadataInput
from .scraper import scrape
from .storage import persist

handler = ModuleHandler(
    manifest=MANIFEST,
    input_model=PageMetadataInput,
    execute=scrape,
    persist=persist,
)
