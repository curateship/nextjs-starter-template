from app.modules.base import ModuleManifest

MODULE_KEY = "page_metadata"

MANIFEST = ModuleManifest(
    key=MODULE_KEY,
    name="Page Metadata",
    description="Fetch a public URL and extract basic page metadata.",
    capabilities={
        "manual_runs": True,
        "schedules": True,
        "input_fields": [
            {
                "key": "url",
                "label": "URL",
                "type": "url",
                "required": True,
            }
        ],
    },
)
