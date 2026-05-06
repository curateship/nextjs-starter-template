from setuptools import find_packages, setup

setup(
    name="whateverscraper-api",
    version="0.1.0",
    description="Python backend for the whateverscraper internal tool",
    packages=find_packages(),
    python_requires=">=3.11",
    install_requires=[
        "alembic>=1.17.2,<2.0.0",
        "beautifulsoup4>=4.14.2,<5.0.0",
        "fastapi>=0.116.1,<1.0.0",
        "httpx>=0.28.1,<1.0.0",
        "pydantic-settings>=2.10.1,<3.0.0",
        "psycopg[binary]>=3.2.9,<4.0.0",
        "sqlalchemy>=2.0.43,<3.0.0",
        "uvicorn>=0.35.0,<1.0.0",
    ],
    entry_points={
        "console_scripts": [
            "whateverscraper-worker=app.services.worker:main",
        ],
    },
)
