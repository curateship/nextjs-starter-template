from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import Base, get_engine, get_session_factory
from app.routes import modules
from app.services.modules import seed_modules


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=get_engine())
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
        allow_origins=[settings.app_origin],
        allow_credentials=False,
        allow_methods=["GET", "OPTIONS"],
        allow_headers=["Content-Type", "x-admin-token"],
    )

    @app.get("/healthz")
    def healthz():
        return {"status": "ok"}

    app.include_router(modules.router)

    return app


app = create_app()
