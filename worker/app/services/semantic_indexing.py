import hashlib
import json
import os
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from memoryvault_shared import models

# Note: Increment the version when making changes that affect the geometry or embedding semantics, to trigger reindexing.
PIPELINE_VERSION = "v0"

DEFAULT_MODEL_NAME = os.getenv("SEMANTIC_EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")


def _build_source_text(video: models.Video) -> str:
    transcript = video.transcript_text if isinstance(video.transcript_text, str) else ""
    transcript = transcript.strip()
    if transcript:
        return transcript
    title = video.title if isinstance(video.title, str) else ""
    filename = video.filename if isinstance(video.filename, str) else ""
    return " ".join([title, filename]).strip()


def _source_hash(video: models.Video) -> str:
    transcript = video.transcript_text if isinstance(video.transcript_text, str) else ""
    title = video.title if isinstance(video.title, str) else ""
    filename = video.filename if isinstance(video.filename, str) else ""
    source = "|".join([transcript.strip(), title.strip(), filename.strip()])
    return hashlib.sha256(source.encode("utf-8")).hexdigest()


def _embed_texts(texts: list[str]) -> list[tuple[float, float, int, list[float]]]:
    import numpy as np
    from sentence_transformers import SentenceTransformer
    from sklearn.cluster import KMeans
    from sklearn.decomposition import PCA

    model = SentenceTransformer(DEFAULT_MODEL_NAME)
    embeddings_np = model.encode(texts, normalize_embeddings=True, convert_to_numpy=True)

    n_points = len(texts)
    if n_points == 1:
        coords_np = np.array([[0.0, 0.0]])
        labels = [0]
    else:
        pca = PCA(n_components=2, random_state=42)
        coords_np = pca.fit_transform(embeddings_np)

        if n_points < 4:
            labels = [0] * n_points
        else:
            k = min(max(2, int(n_points ** 0.5)), 8, n_points)
            kmeans = KMeans(n_clusters=k, random_state=42, n_init="auto")
            labels = kmeans.fit_predict(embeddings_np).tolist()

    vectors: list[tuple[float, float, int, list[float]]] = []
    for i in range(n_points):
        vectors.append((
            float(coords_np[i][0]),
            float(coords_np[i][1]),
            int(labels[i]),
            embeddings_np[i].tolist(),
        ))

    return vectors


def reindex_semantic_map(
    db: Session,
    mode: str = "incremental",
    limit: int | None = None,
) -> dict:
    videos = db.query(models.Video).order_by(models.Video.id.asc()).all()
    indexed_by_video_id = {
        row.video_id: row for row in db.query(models.VideoSemanticIndex).all()
    }

    candidates = []
    for video in videos:
        source_hash = _source_hash(video)
        existing = indexed_by_video_id.get(video.id)

        if mode == "full":
            candidates.append(video)
            continue

        changed = existing is None
        if not changed:
            raw_existing_hash = getattr(existing, "source_hash", "")
            existing_source_hash = raw_existing_hash if type(raw_existing_hash) is str else str(raw_existing_hash)
            changed = existing_source_hash != source_hash

        if changed:
            candidates.append(video)

    if limit is not None:
        candidates = candidates[: max(limit, 0)]

    now = datetime.now(timezone.utc)

    if not candidates:
        return {
            "mode": "full" if mode == "full" else "incremental",
            "total_videos_considered": len(videos),
            "candidates_indexed": 0,
            "points_written": 0,
            "model_name": DEFAULT_MODEL_NAME,
            "index_version": PIPELINE_VERSION,
            "fallback_used": False,
            "fallback_reason": None,
            "indexed_at": now.isoformat(),
        }

    active_videos = videos
    source_texts = [_build_source_text(video) for video in active_videos]
    vectors = _embed_texts(source_texts)

    written = 0

    for video, vector_bundle in zip(active_videos, vectors):
        map_x, map_y, cluster_id, embedding_vector = vector_bundle
        existing = indexed_by_video_id.get(video.id)
        source_hash = _source_hash(video)

        if existing is None:
            existing = models.VideoSemanticIndex(video_id=video.id, source_hash=source_hash)
            db.add(existing)

        setattr(existing, "map_x", float(map_x))
        setattr(existing, "map_y", float(map_y))
        setattr(existing, "cluster_id", int(cluster_id))
        setattr(existing, "cluster_label", f"Cluster {int(cluster_id)}")
        setattr(existing, "embedding_json", json.dumps(embedding_vector) if embedding_vector else None)
        setattr(existing, "embedding_dim", len(embedding_vector) if embedding_vector else None)
        setattr(existing, "embedding_model", DEFAULT_MODEL_NAME)
        setattr(existing, "summary_text", None)
        setattr(existing, "source_hash", source_hash)
        setattr(existing, "index_version", PIPELINE_VERSION)
        setattr(existing, "indexed_at", now)
        written += 1

    db.commit()

    return {
        "mode": "full" if mode == "full" else "incremental",
        "total_videos_considered": len(videos),
        "candidates_indexed": len(candidates),
        "points_written": written,
        "model_name": DEFAULT_MODEL_NAME,
        "index_version": PIPELINE_VERSION,
        "fallback_used": False,
        "fallback_reason": None,
        "indexed_at": now.isoformat(),
    }
