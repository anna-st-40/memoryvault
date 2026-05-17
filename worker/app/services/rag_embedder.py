import json
import logging
import os
from datetime import datetime, timezone

import numpy as np
from sqlalchemy.orm import Session

from memoryvault_shared import models

logger = logging.getLogger(__name__)

EMBEDDING_MODEL = os.getenv(
    "EMBEDDING_MODEL",
    "microsoft/harrier-oss-v1-0.6b",
)

_MODEL_CACHE: dict = {}


def _get_model(model_name: str):
    if model_name not in _MODEL_CACHE:
        from sentence_transformers import SentenceTransformer  # noqa: PLC0415
        logger.info("Loading RAG embedding model '%s'...", model_name)
        _MODEL_CACHE[model_name] = SentenceTransformer(
            model_name, model_kwargs={"dtype": "auto"}
        )
    return _MODEL_CACHE[model_name]


def embed_chunks_for_video(video_id: int, db: Session) -> dict[str, int]:
    """
    Embeds all TranscriptChunk rows with embedding_status='pending' for video_id.
    Returns {"embedded": n, "errors": m}.
    """
    model_name = EMBEDDING_MODEL
    model = _get_model(model_name)

    chunks = (
        db.query(models.TranscriptChunk)
        .filter(
            models.TranscriptChunk.video_id == video_id,
            models.TranscriptChunk.embedding_status == "pending",
        )
        .all()
    )

    if not chunks:
        return {"embedded": 0, "errors": 0}

    texts = [c.text for c in chunks]
    try:
        vectors: np.ndarray = model.encode(
            texts, batch_size=32, normalize_embeddings=True, show_progress_bar=False
        )
    except Exception as exc:
        logger.exception("Batch encode failed for video %d: %s", video_id, exc)
        for chunk in chunks:
            chunk.embedding_status = "error"
        db.commit()
        return {"embedded": 0, "errors": len(chunks)}

    embedded = 0
    errors = 0
    for chunk, vec in zip(chunks, vectors):
        try:
            chunk.embedding_json = json.dumps(vec.tolist())
            chunk.embedding_model = model_name
            chunk.embedding_dim = len(vec)
            chunk.embedding_status = "done"
            chunk.embedded_at = datetime.now(timezone.utc)
            embedded += 1
        except Exception as exc:
            logger.exception("Failed to store embedding for chunk %d: %s", chunk.id, exc)
            chunk.embedding_status = "error"
            errors += 1

    db.commit()
    logger.info("video %d: embedded %d chunks (%d errors)", video_id, embedded, errors)
    return {"embedded": embedded, "errors": errors}
