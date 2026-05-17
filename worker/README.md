# worker

Background processing service. Polls the database every 5 seconds for three types of pending jobs:

### 1. ScanJob — Video Ingestion & Transcription

For each pending `ScanJob`:
1. **Prepare** — remux MTS → MP4, move from `new/` to `raw/`, archive original to `originals/`
2. **Transcribe** — WhisperX large-v3 (CPU by default)
3. **Metadata** — extract duration and creation date via ffprobe
4. **DB insert** — create `Video` and `TranscriptSegment` records
5. **Thumbnail** — extract JPEG at 2.5s via ffmpeg

### 2. ReindexJob — Semantic Map Reindexing

For each pending `ReindexJob`:
- Generate sentence embeddings for all (or new) videos
- Cluster embeddings in 2D space using UMAP
- Populate `VideoSemanticIndex` for the semantic map visualization

### 3. RagJob — RAG Indexing

For each pending `RagJob`:
- **Chunking** — split video transcript into overlapping chunks
- **Embedding** — compute embeddings for each chunk for semantic search
- **Storage** — save chunks and embeddings to database for retrieval

On startup, any jobs left in `pending`/`processing` state (from a previous crash) are reset and reprocessed.

## Key files

```
app/
  main.py                 — polling loops for all three job types
  services/
    scanner.py            — ScanJob pipeline implementation
    semantic_indexing.py  — ReindexJob semantic map generation
    chunker.py            — transcript chunking for RAG
    rag_embedder.py       — embedding generation for RAG chunks
```