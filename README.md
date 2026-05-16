# MemoryVault

A self-hosted video archive with automatic transcription and a semantic memory map.

## Services

| Service | Directory | Port |
|---------|-----------|------|
| API | `backend/` | 8000 |
| Worker | `worker/` | — |
| Frontend | `frontend/` | 8765 |

## Quick start

```bash
cp .env.example .env
# Set MEDIA_DIR to your video folder in .env
docker compose up --build
```

Frontend: http://localhost:8765  
API: http://localhost:8000

## How it works

1. Drop video files into `$MEDIA_DIR/new/`
2. Hit **Scan** in the UI (or `POST /scan`) — the API creates job records
3. The worker picks them up, remuxes MTS files, transcribes with WhisperX, and writes results to the shared SQLite database
4. Use the semantic map to browse videos by content similarity

## Shared database

All services share a single SQLite file at `./database/app.db` (WAL mode, safe for concurrent reads + one writer).

## Configuration

### `.env`

Copy `.env.example` to `.env` and adjust as needed:

```bash
cp .env.example .env
```

| Variable | Service | Required | Default | Description |
|----------|---------|----------|---------|-------------|
| `MEDIA_DIR` | compose | yes | — | Path on the host to your video archive |
| `PUBLIC_API_URL` | frontend | no | `http://localhost:8000` | Backend URL used by the browser; set to `http://<host-ip>:8000` for remote access |
| `MEMORYVAULT_BASE` | both | no | `/data` | Container-side mount point for the video archive |
| `THUMBNAILS_DIR` | both | no | `/app/thumbnails` | Container-side path for thumbnails |
| `DATABASE_URL` | both | no | `sqlite:////app/database/app.db` | SQLAlchemy DB URL |
| `LOG_LEVEL` | both | no | `INFO` | Log verbosity (`DEBUG`, `INFO`, `WARNING`, `ERROR`) |

### Service-specific variables

These are set directly in `compose.yml` and rarely need changing:

| Variable | Service | Default | Description |
|----------|---------|---------|-------------|
| `CORS_ORIGINS` | backend | `http://localhost:3000,...` | Comma-separated allowed origins |
| `SEMANTIC_EMBEDDING_MODEL` | backend | `sentence-transformers/all-MiniLM-L6-v2` | Embedding model for the semantic map |
| `WORKER_POLL_INTERVAL` | worker | `5` | Seconds between DB polls |

## GPU acceleration

Change `TORCH_INDEX_URL` in `compose.yml` to `https://download.pytorch.org/whl/cu124` for CUDA 12.4.
