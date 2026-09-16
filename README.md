# MemoryVault

A self-hosted video archive with automatic transcription and a semantic memory map.

**🎥 [Watch devlogs on YouTube](https://www.youtube.com/playlist?list=PLMxvlZgcDLSk)**

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

| Variable | Service | Default | Description |
|----------|---------|---------|-------------|
| `MEDIA_DIR` | compose | — | **Required.** Path on the host to your video archive |
| `MEMORYVAULT_BASE` | both | `/data` | Container-side mount point for the video archive |
| `THUMBNAILS_DIR` | both | `/app/thumbnails` | Container-side path for thumbnails |
| `DATABASE_URL` | both | `sqlite:////app/database/app.db` | SQLAlchemy DB URL |
| `LOG_LEVEL` | both | `INFO` | Log verbosity (`DEBUG`, `INFO`, `WARNING`, `ERROR`) |
| `OLLAMA_URL` | backend | — | Base URL of your Ollama instance (e.g. `http://192.168.1.10:11434`) |
| `OLLAMA_MODEL` | backend | `qwen3:8b` | Ollama model name to use |
| `OLLAMA_TIMEOUT_SEC` | backend | `120` | Request timeout in seconds |
| `EMBEDDING_MODEL` | backend | `microsoft/harrier-oss-v1-0.6b` | Embedding model for semantic search |

### Ollama

MemoryVault uses Ollama for LLM-powered features. Set `OLLAMA_URL` in `.env` to point at any reachable Ollama instance — a machine on your local network, a remote server, or a local process:

```bash
# Remote machine on the LAN
OLLAMA_URL=http://192.168.1.10:11434

# Ollama running directly on the host (not in Docker)
OLLAMA_URL=http://host.docker.internal:11434
```

Make sure the model named in `OLLAMA_MODEL` has already been pulled on that machine (`ollama pull qwen3:8b`).

### Service-specific variables

These are set directly in `compose.yml` and rarely need changing:

| Variable | Service | Default | Description |
|----------|---------|---------|-------------|
| `CORS_ORIGINS` | backend | `http://localhost:3000,...` | Comma-separated allowed origins |
| `WORKER_POLL_INTERVAL` | worker | `5` | Seconds between DB polls for picking up background jobs |

## GPU acceleration

Change `TORCH_INDEX_URL` in `compose.yml` to `https://download.pytorch.org/whl/cu124` for CUDA 12.4.
