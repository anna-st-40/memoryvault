# backend

FastAPI service. Handles all HTTP endpoints.

Does **not** run transcription or file processing. It writes `ScanJob` records to the database; the worker picks them up.

## Key files

```
app/
  main.py                  — all HTTP endpoints
  schemas.py               — Pydantic request/response models
  config.py                — shared config (RAW_DIR, parse_filename_title)
  services/
    semantic_indexing.py   — embedding + clustering for the semantic map
    jobs.py                — scan job summary queries
```

Models and database engine live in `../shared/`.

## Environment variables

See the root README for shared variables (`DATABASE_URL`, `MEMORYVAULT_BASE`, `THUMBNAILS_DIR`).

Backend-specific:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CORS_ORIGINS` | no | `http://localhost:3000,...` | Comma-separated allowed origins |
| `SEMANTIC_EMBEDDING_MODEL` | no | `sentence-transformers/all-MiniLM-L6-v2` | Embedding model for the semantic map |

## Run locally (without Docker)

Install dependencies once:

```bash
pip install -e ../shared/
poetry install
```

Then run with all required env vars set:

```bash
DATABASE_URL=sqlite:////absolute/path/to/database/app.db \
MEMORYVAULT_BASE=/path/to/your/videos \
THUMBNAILS_DIR=/path/to/thumbnails \
poetry run uvicorn app.main:app --reload
```

Or use the **Start Backend** task in `.vscode/tasks.json`, which pre-fills these paths for the local `test_volume` layout.
