from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import get_session_factory
from app.routes import modules, runs, schedules
from app.modules.registry import seed_modules


@asynccontextmanager
async def lifespan(_: FastAPI):
    db = get_session_factory()()
    try:
        seed_modules(db)
    finally:
        db.close()
    yield


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="whateverscraper API",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.app_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "x-admin-token"],
    )

    @app.get("/healthz")
    def healthz():
        return {"status": "ok"}

    app.include_router(modules.router)
    app.include_router(runs.router)
    app.include_router(schedules.router)

    return app


app = create_app()
