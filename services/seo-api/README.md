# whateverseo SEO API

FastAPI service for the separate SEO product system.

## Responsibilities in the current slice

- Verify Hub-issued SSO tokens
- Mirror Hub users into the SEO database
- Issue SEO-local session tokens
- Own workspace CRUD in the SEO database

## Local setup

1. Create a Python 3.11+ virtual environment.
2. Install dependencies:

```bash
pip install -e .
```

3. Copy `.env.example` to `.env` and set real values.
4. Run the API:

```bash
uvicorn app.main:app --reload
```
