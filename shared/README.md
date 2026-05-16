# shared

Installable Python package (`memoryvault-shared`) containing the SQLAlchemy models and database engine used by both `backend/` and `worker/`.

## Contents

- `memoryvault_shared/database.py` — SQLAlchemy engine, session factory, `get_db` dependency. SQLite WAL mode enabled for safe concurrent access.
- `memoryvault_shared/models.py` — ORM models: `Video`, `TranscriptSegment`, `ScanJob`, `VideoSemanticIndex`

## Install

```bash
pip install .
```

In the Docker build, both `backend/Dockerfile` and `worker/Dockerfile` copy this directory to `/shared/` inside the image and install it with `pip install /shared/`.

## Adding a model

1. Add the class to `models.py`
2. `Base.metadata.create_all(bind=engine)` is called on startup in both services — new tables are created automatically
