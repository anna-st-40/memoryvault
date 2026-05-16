# worker

Background processing service. Polls the database every 5 seconds for pending `ScanJob` records and runs the full pipeline on each:

1. **Prepare** — remux MTS → MP4, move from `new/` to `raw/`, archive original to `originals/`
2. **Transcribe** — WhisperX large-v3 (CPU by default)
3. **Metadata** — extract duration and creation date via ffprobe
4. **DB insert** — create `Video` and `TranscriptSegment` records
5. **Thumbnail** — extract JPEG at 2.5s via ffmpeg

On startup, any jobs left in `pending` or `processing` state (from a previous crash) are reset and reprocessed.

## Key files

```
app/
  main.py             — polling loop entrypoint
  services/
    scanner.py        — pipeline implementation
```

## Environment variables

See the root README for shared variables (`DATABASE_URL`, `MEMORYVAULT_BASE`, `THUMBNAILS_DIR`).

Worker-specific:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `WORKER_POLL_INTERVAL` | no | `5` | Seconds between DB polls |
| `WHISPER_LANGUAGE` | no | (auto-detect) | BCP-47 language code for transcription, e.g. `en` |

## Run locally (without Docker)

Install dependencies once:

```bash
pip install -e ../shared/
pip install -e .
```

Then run with all required env vars set:

```bash
DATABASE_URL=sqlite:////absolute/path/to/database/app.db \
MEMORYVAULT_BASE=/path/to/your/videos \
THUMBNAILS_DIR=/path/to/thumbnails \
python -m app.main
```

Or use the **Start Worker** task in `.vscode/tasks.json`, which pre-fills these paths for the local `test_volume` layout.
