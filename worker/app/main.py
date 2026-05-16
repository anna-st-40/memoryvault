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
    finally:
        db.close()


def _process_pending_jobs() -> int:
    from app.services.scanner import _process_job

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
        _process_job(job_id)

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

        time.sleep(POLL_INTERVAL)
