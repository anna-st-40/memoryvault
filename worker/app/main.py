import json
import logging
import os
import time
from datetime import datetime, timezone

from sqlalchemy import text
from memoryvault_shared.database import Base, engine, SessionLocal
from memoryvault_shared import models

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

POLL_INTERVAL = int(os.getenv("WORKER_POLL_INTERVAL", "5"))


def _startup_recovery() -> None:
    """Reset any pending/processing jobs left over from a previous worker crash."""
    db = SessionLocal()
    try:
        jobs = db.query(models.ScanJob).filter(
            models.ScanJob.status.in_(["pending", "processing"])
        ).all()
        for job in jobs:
            job.status = "pending"
            job.started_at = None
            job.finished_at = None
        db.commit()
        if jobs:
            logger.info("Startup: reset %d incomplete scan job(s) to pending", len(jobs))

        reindex_jobs = db.query(models.ReindexJob).filter(
            models.ReindexJob.status.in_(["pending", "processing"])
        ).all()
        for job in reindex_jobs:
            job.status = "pending"
            job.started_at = None
            job.finished_at = None
        db.commit()
        if reindex_jobs:
            logger.info("Startup: reset %d incomplete reindex job(s) to pending", len(reindex_jobs))

        rag_jobs = db.query(models.RagJob).filter(
            models.RagJob.status.in_(["chunking", "embedding"])
        ).all()
        for job in rag_jobs:
            job.status = "pending"
            job.chunked_at = None
            job.embedded_at = None
        db.commit()
        if rag_jobs:
            logger.info("Startup: reset %d incomplete RAG job(s) to pending", len(rag_jobs))
    finally:
        db.close()


def _process_pending_jobs() -> int:
    from app.services.scanner import process_job

    db = SessionLocal()
    try:
        job_ids = [
            r[0] for r in db.query(models.ScanJob.id)
            .filter(models.ScanJob.status == "pending")
            .order_by(models.ScanJob.id.asc())
            .all()
        ]
    finally:
        db.close()

    for job_id in job_ids:
        process_job(job_id)

    return len(job_ids)


def _process_pending_reindex_jobs() -> int:
    from app.services.semantic_indexing import reindex_semantic_map

    db = SessionLocal()
    try:
        job_ids = [
            r[0] for r in db.query(models.ReindexJob.id)
            .filter(models.ReindexJob.status == "pending")
            .order_by(models.ReindexJob.id.asc())
            .all()
        ]
    finally:
        db.close()

    for job_id in job_ids:
        db = SessionLocal()
        try:
            job = db.query(models.ReindexJob).filter(models.ReindexJob.id == job_id).first()
            if job is None:
                continue

            job.status = "processing"
            job.started_at = datetime.now(timezone.utc)
            db.commit()

            mode = str(job.mode)
            limit = int(job.limit) if job.limit is not None else None

            try:
                result = reindex_semantic_map(db, mode=mode, limit=limit)
                job.status = "done"
                job.result_json = json.dumps(result)
                logger.info(
                    "Reindex job %d done: %d/%d videos indexed",
                    job_id, result["candidates_indexed"], result["total_videos_considered"],
                )
            except Exception as exc:
                job.status = "error"
                job.error_message = str(exc)
                logger.error("Reindex job %d failed: %s", job_id, exc)

            job.finished_at = datetime.now(timezone.utc)
            db.commit()
        except Exception:
            logger.exception("Unexpected error processing reindex job %d", job_id)
            db.rollback()
        finally:
            db.close()

    return len(job_ids)


def _process_pending_rag_jobs() -> int:
    from app.services.chunker import chunk_video
    from app.services.rag_embedder import embed_chunks_for_video

    db = SessionLocal()
    try:
        job_ids = [
            r[0] for r in db.query(models.RagJob.id)
            .filter(models.RagJob.status == "pending")
            .order_by(models.RagJob.id.asc())
            .all()
        ]
    finally:
        db.close()

    for job_id in job_ids:
        db = SessionLocal()
        try:
            job = db.query(models.RagJob).filter(models.RagJob.id == job_id).first()
            if job is None:
                continue

            video_id = job.video_id
            job.status = "chunking"
            db.commit()

            chunk_video(video_id, db)
            job.chunked_at = datetime.now(timezone.utc)
            job.status = "embedding"
            db.commit()

            embed_chunks_for_video(video_id, db)
            job.embedded_at = datetime.now(timezone.utc)
            job.status = "done"
            job.error_message = None
            db.commit()
            logger.info("RAG job %d done (video %d)", job_id, video_id)
        except Exception as exc:
            logger.exception("RAG job %d failed: %s", job_id, exc)
            db.rollback()
            try:
                job = db.query(models.RagJob).filter(models.RagJob.id == job_id).first()
                if job:
                    job.status = "error"
                    job.error_message = str(exc)
                    db.commit()
            except Exception:
                pass
        finally:
            db.close()

    return len(job_ids)


if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)

    logger.info("Worker started. Poll interval: %ds", POLL_INTERVAL)
    _startup_recovery()

    while True:
        try:
            scan_count = _process_pending_jobs()
            if scan_count:
                logger.info("Processed %d scan job(s)", scan_count)
        except Exception:
            logger.exception("Unexpected error in scan job loop")

        try:
            reindex_count = _process_pending_reindex_jobs()
            if reindex_count:
                logger.info("Processed %d reindex job(s)", reindex_count)
        except Exception:
            logger.exception("Unexpected error in reindex job loop")

        try:
            rag_count = _process_pending_rag_jobs()
            if rag_count:
                logger.info("Processed %d RAG job(s)", rag_count)
        except Exception:
            logger.exception("Unexpected error in RAG job loop")

        time.sleep(POLL_INTERVAL)
