# backend

FastAPI service. Handles all HTTP endpoints for video management, transcription jobs, semantic search, and RAG (Retrieval-Augmented Generation).

Does **not** run transcription or file processing. It writes `ScanJob` and `RagJob` records to the database; the worker picks them up.

## Key files

```
app/
  main.py                  — all HTTP endpoints (videos, transcripts, semantic map, RAG, scan jobs)
  schemas.py               — Pydantic request/response models
  config.py                — shared config (RAW_DIR, parse_filename_title)
  services/
    llm_client.py          — Ollama integration for LLM queries
    rag_retriever.py       — semantic search with sentence embeddings
    rag_service.py         — RAG pipeline (embedding → retrieval → LLM answer)
```

Models and database engine live in `../shared/`.

