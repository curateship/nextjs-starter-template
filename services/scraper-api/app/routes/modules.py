from fastapi import APIRouter

from app.schemas import ModuleListOut, ModuleOut
from app.services.modules import list_module_definitions

router = APIRouter(prefix="/api/v1/modules", tags=["modules"])


@router.get("", response_model=ModuleListOut)
def list_modules() -> ModuleListOut:
    modules = [
        ModuleOut(
            key=module.key,
            name=module.name,
            description=module.description,
        )
        for module in list_module_definitions()
    ]
    return ModuleListOut(modules=modules)
