# whateverscraper API

FastAPI service and worker runtime for the internal scraper modules workspace.

## Responsibilities

- Serve health checks and module metadata
- Accept manual runs and recurring schedules
- Store raw JSON, shared result rows, and module-owned records
- Execute queued runs from a separate worker process

## Local setup

1. Create a Python 3.11+ virtual environment.
2. Install the package:

```bash
pip install -e .
```

3. Run database migrations:

```bash
alembic upgrade head
```

4. Copy `.env.example` to `.env` and set real values.
   `SCRAPER_ADMIN_TOKEN` is required for all mutation requests.
5. Run the API:

```bash
python3 -m uvicorn app.main:app --reload --port 8001
```

6. Run the worker in another shell:

```bash
whateverscraper-worker
```
