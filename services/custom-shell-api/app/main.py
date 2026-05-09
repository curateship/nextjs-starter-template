from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import get_engine
from app.models import CustomShellSettings
from app.routes import shell_settings


@asynccontextmanager
async def lifespan(_: FastAPI):
    CustomShellSettings.metadata.create_all(bind=get_engine())
    yield


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="custom-shell API",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.app_origins),
        allow_credentials=False,
        allow_methods=["GET", "PUT", "OPTIONS"],
        allow_headers=["Content-Type"],
    )

    @app.get("/healthz")
    def healthz():
        return {"status": "ok"}

    app.include_router(shell_settings.router)

    return app


app = create_app()
