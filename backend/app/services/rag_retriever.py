import json
import logging
import os
from dataclasses import dataclass

import numpy as np
from sqlalchemy.orm import Session

from memoryvault_shared import models

logger = logging.getLogger(__name__)

EMBEDDING_MODEL = os.getenv(
    "EMBEDDING_MODEL",
    "microsoft/harrier-oss-v1-0.6b",
)

# Harrier requires a task instruction on the query side; documents need no prefix
_HARRIER_QUERY_PREFIX = "Instruct: Retrieve semantically similar text\nQuery: "

_MODEL_CACHE: dict = {}


def _get_model(model_name: str):
    if model_name not in _MODEL_CACHE:
        from sentence_transformers import SentenceTransformer  # noqa: PLC0415
        logger.info("Loading RAG embedding model '%s'...", model_name)
        _MODEL_CACHE[model_name] = SentenceTransformer(
            model_name, model_kwargs={"dtype": "auto"}
        )
    return _MODEL_CACHE[model_name]


class ModelMismatchError(RuntimeError):
    """Raised when stored embeddings were built with a different model."""


@dataclass
class RagChunk:
    chunk_id: int
    video_id: int
    video_title: str
    recorded_at: str | None
    start_ms: int
    end_ms: int
    text: str
    score: float
    collection: str
    thumbnail_url: str | None
    duration_sec: float | None


def retrieve(
    query: str,
    db: Session,
    top_k: int = 5,
    collection: str = "transcript_chunks",
) -> list[RagChunk]:
    """
    Embeds the query and returns top_k RagChunk objects sorted by cosine
    similarity descending.  Returns [] when no embedded chunks exist.
    Raises ModelMismatchError when stored embeddings use a different model.
    """
    if collection != "transcript_chunks":
        logger.warning("Unknown collection '%s', returning empty results", collection)
        return []

    current_model = EMBEDDING_MODEL

    rows = (
        db.query(models.TranscriptChunk, models.Video)
        .join(models.Video, models.TranscriptChunk.video_id == models.Video.id)
        .filter(models.TranscriptChunk.embedding_status == "done")
        .all()
    )

    if not rows:
        return []

    # Validate model consistency (spot-check the first row)
    first_chunk: models.TranscriptChunk = rows[0][0]
    if first_chunk.embedding_model and first_chunk.embedding_model != current_model:
        raise ModelMismatchError(
            f"Stored embeddings use '{first_chunk.embedding_model}' but "
            f"EMBEDDING_MODEL is '{current_model}'. "
            "Re-run POST /rag/index to regenerate embeddings."
        )

    # Build chunk matrix
    chunk_objs = []
    vectors = []
    for chunk, video in rows:
        try:
            vec = json.loads(chunk.embedding_json)
            vectors.append(vec)
            chunk_objs.append((chunk, video))
        except Exception:
            continue

    if not vectors:
        return []

    chunk_matrix = np.array(vectors, dtype=np.float32)

    # Embed the query (L2-normalised to match stored vectors)
    query_text = _HARRIER_QUERY_PREFIX + query
    model = _get_model(current_model)
    query_vec = model.encode(
        [query_text], normalize_embeddings=True, show_progress_bar=False
    )[0].astype(np.float32)

    scores = chunk_matrix @ query_vec  # cosine similarity (both normalised)

    k = min(top_k, len(scores))
    top_indices = np.argsort(scores)[::-1][:k]

    results: list[RagChunk] = []
    for idx in top_indices:
        chunk, video = chunk_objs[idx]
        thumbnail_url = (
            f"/thumbnails/{video.id}.jpg" if video.thumbnail_path else None
        )
        results.append(RagChunk(
            chunk_id=chunk.id,
            video_id=video.id,
            video_title=video.title or video.filename,
            recorded_at=video.recorded_at,
            start_ms=chunk.start_ms,
            end_ms=chunk.end_ms,
            text=chunk.text,
            score=float(scores[idx]),
            collection=collection,
            thumbnail_url=thumbnail_url,
            duration_sec=video.duration_sec,
        ))

    return results
