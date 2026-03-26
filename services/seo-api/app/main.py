from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import Base, get_engine
from app.routes import auth, workspaces


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=get_engine())
    yield


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="whateverseo SEO API",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.seo_app_origin, settings.hub_app_origin],
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type"],
    )

    @app.get("/healthz")
    def healthz():
        return {"status": "ok"}

    app.include_router(auth.router)
    app.include_router(workspaces.router)

    return app


app = create_app()
