# whateverscraper API

FastAPI service and worker runtime for the internal Google Maps scraper tool.

## Responsibilities

- Accept fixed Google Maps runs and recurring schedules
- Persist deduped places plus per-run snapshots
- Claim queued runs from Postgres
- Execute browser-isolated scraper attempts
- Rotate proxy sessions through one configured provider

## Local setup

1. Create a Python 3.11+ virtual environment.
2. Install the package:

```bash
pip install -e .
playwright install chromium
```

3. Copy `.env.example` to `.env` and set real values.
   `SCRAPER_ADMIN_TOKEN` is required for all mutation requests.
4. Run the API:

```bash
uvicorn app.main:app --reload --port 8001
```

5. Run the worker in another shell:

```bash
whateverscraper-worker
```
