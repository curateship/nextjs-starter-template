# whateverscraper API

FastAPI service for the internal scraper modules workspace.

## Responsibilities

- Serve health checks
- Seed and expose registered scraper modules
- Provide the backend foundation for future module-specific routes

## Local setup

1. Create a Python 3.11+ virtual environment.
2. Install the package:

```bash
pip install -e .
```

3. Copy `.env.example` to `.env` and set real values.
   `SCRAPER_ADMIN_TOKEN` is required for all mutation requests.
4. Run the API:

```bash
uvicorn app.main:app --reload --port 8001
```
