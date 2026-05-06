"""Background video scanner for MemoryVault.

Discovers new video files in the new/ and raw/ directories, then runs
the full processing pipeline (sort/remux if needed, Whisper transcription,
thumbnail, DB insert) in a single-threaded ThreadPoolExecutor so it doesn't
block the API.

Directory roles:
  new/        Drop zone. Files here are sorted on next scan:
                - MTS  → remuxed MP4 goes to raw/, original MTS to originals/
                - other → moved directly to raw/
  raw/        Processed video files ready for transcription.
  originals/  Archive of original MTS files (never scanned for transcription).
"""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app import models
from app.database import SessionLocal

logger = logging.getLogger(__name__)

# --- Config ---
_base = os.getenv("MEMORYVAULT_BASE", "/data")
NEW_DIR: str = os.path.join(_base, "new")
ORIGINALS_DIR: str = os.path.join(_base, "originals")
RAW_DIR: str = os.path.join(_base, "raw")
THUMBNAILS_DIR: str = os.getenv("THUMBNAILS_DIR", "/app/thumbnails")
WHISPER_LANGUAGE: str = os.getenv("WHISPER_LANGUAGE", "en")

SCAN_EXTENSIONS: frozenset[str] = frozenset(
    {".mp4", ".mov", ".mts", ".mkv", ".avi", ".m4v", ".mpg", ".mpeg"}
)

# Single worker — Whisper turbo is ~3GB RAM; one video at a time is appropriate.
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="scanner")

# Cached Whisper model. No lock needed because max_workers=1.
_whisper_cache: dict[str, Any] = {}

_MONTH_MAP = {
    "January": "01", "February": "02", "March": "03", "April": "04",
    "May": "05", "June": "06", "July": "07", "August": "08",
    "September": "09", "October": "10", "November": "11", "December": "12",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_filename_date(filename: str) -> str | None:
    """Extract ISO date from filenames like '2020-4April-13.MTS'. Returns '2020-04-13'."""
    match = re.match(r"(\d{4})[-_](\d+)(\w+)-(\d+)", filename)
    if not match:
        return None
    year, _, month_name, date_num = match.groups()
    month = _MONTH_MAP.get(month_name)
    if not month:
        return None
    return f"{year}-{month}-{date_num.zfill(2)}"


def _parse_filename_title(filename: str) -> str | None:
    """Extract an optional title after the date portion of a filename."""
    stem = Path(filename).stem
    if " " not in stem:
        return None
    candidate = stem.split(" ", 1)[1].strip()
    if not candidate or candidate.isdigit():
        return None
    return candidate


def _get_file_creation_time(path: Path) -> float:
    stat = path.stat()
    return getattr(stat, "st_birthtime", stat.st_mtime)


def _is_stable(path: str) -> bool:
    """
    Verify that a file isn't currently being written to.
    Return True if file size and mtime are unchanged after 5 seconds.
    """
    try:
        s1 = os.stat(path)
        if s1.st_size == 0:
            return False
        time.sleep(5)
        s2 = os.stat(path)
        return s1.st_size == s2.st_size and s1.st_mtime == s2.st_mtime
    except OSError:
        return False


def _transcribe(file_path: str, model_name: str = "turbo", language: str = "en") -> dict[str, Any]:
    """Transcribe a video with Whisper, reusing the cached model."""
    import whisper  # noqa: PLC0415 — deferred import, slow to load
    if model_name not in _whisper_cache:
        logger.info("Loading Whisper model '%s'...", model_name)
        _whisper_cache[model_name] = whisper.load_model(model_name)
    logger.info("Transcribing %s (language=%s) ...", file_path, language)
    return _whisper_cache[model_name].transcribe(
        file_path, verbose=False, language=language, compression_ratio_threshold=2.0
    )


def _trim_hallucinations(transcription: dict[str, Any], duration: float) -> dict[str, Any]:
    """Drop or clamp Whisper segments that start at or beyond the actual video duration."""
    segments = [
        {**seg, "end": min(seg["end"], duration)}
        for seg in transcription.get("segments", [])
        if seg["start"] < duration
    ]
    return {**transcription, "segments": segments, "text": "".join(seg["text"] for seg in segments)}


def _get_video_metadata(video_path: str) -> dict[str, Any]:
    """Extract duration and creation time via ffprobe."""
    result: dict[str, Any] = {"duration": None, "metadata_time": None}
    try:
        dur = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", video_path],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        if dur.stdout.strip():
            result["duration"] = float(dur.stdout.strip())

        meta = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format_tags:stream_tags",
             "-of", "json", video_path],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        if meta.stdout:
            data = json.loads(meta.stdout)
            creation_time: str | None = None
            for key in ["creation_time", "date", "DATE", "com.apple.quicktime.creationdate"]:
                creation_time = data.get("format", {}).get("tags", {}).get(key)
                if creation_time:
                    break
            if not creation_time:
                for stream in data.get("streams", []):
                    for key in ["creation_time", "date", "DATE"]:
                        creation_time = stream.get("tags", {}).get(key)
                        if creation_time:
                            break
                    if creation_time:
                        break
            if creation_time:
                try:
                    result["metadata_time"] = datetime.fromisoformat(
                        creation_time.replace("Z", "+00:00")
                    )
                except ValueError:
                    try:
                        result["metadata_time"] = datetime.strptime(
                            creation_time, "%Y-%m-%d %H:%M:%S"
                        )
                    except ValueError:
                        pass
    except Exception as exc:
        logger.warning("Could not get metadata for %s: %s", video_path, exc)

    if result["metadata_time"] is None:
        try:
            result["metadata_time"] = datetime.fromtimestamp(
                Path(video_path).stat().st_mtime
            )
        except OSError:
            pass

    return result


def _get_recorded_at(video_path: str) -> str | None:
    """Derive recorded_at string from filename date + metadata time."""
    filename_date = _parse_filename_date(Path(video_path).name)
    if not filename_date:
        return None
    metadata_time = _get_video_metadata(video_path).get("metadata_time")
    if metadata_time and metadata_time.strftime("%Y-%m-%d") == filename_date:
        return metadata_time.isoformat()
    return filename_date


def _remux_mts(src: Path, dst: Path) -> None:
    """Remux MTS → MP4 using ffmpeg, preserving original timestamps."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    stat = src.stat()
    atime, mtime = stat.st_atime, stat.st_mtime
    birthtime = _get_file_creation_time(src)

    subprocess.run(
        ["ffmpeg", "-i", str(src), "-c:v", "copy", "-c:a", "aac", str(dst)],
        check=True, capture_output=True,
    )
    os.utime(dst, (atime, mtime))
    try:
        touch_fmt = datetime.fromtimestamp(birthtime).strftime("%Y%m%d%H%M.%S")
        subprocess.run(["touch", "-mt", touch_fmt, str(dst)], check=True)
    except Exception as exc:
        logger.warning("Could not restore creation time for %s: %s", dst, exc)


def _generate_thumbnail(video_path: Path, output_path: Path, ts: float = 2.5) -> None:
    """Extract a JPEG thumbnail from the video at timestamp ts."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-y", "-ss", str(ts), "-i", str(video_path),
         "-vframes", "1", "-vf", "scale=640:360", "-q:v", "2", str(output_path)],
        check=True, capture_output=True,
    )


def _compute_raw_target(source_path: str) -> str:
    """Return the raw/ destination path for a file from new/."""
    p = Path(source_path)
    date_str = _parse_filename_date(p.name)
    year = date_str[:4] if date_str else "unknown"
    target_name = p.stem + ".mp4" if p.suffix.lower() == ".mts" else p.name
    return os.path.join(RAW_DIR, year, target_name)


def _compute_originals_target(source_path: str) -> str:
    """Return the originals/ archive path for an MTS file from new/."""
    p = Path(source_path)
    date_str = _parse_filename_date(p.name)
    year = date_str[:4] if date_str else "unknown"
    return os.path.join(ORIGINALS_DIR, year, p.name)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def discover_and_enqueue() -> int:
    """Walk new/ and raw/, create ScanJob rows for new files, submit to executor.

    Files in new/ are sorted first (MTS → remux to raw/ + archive to originals/,
    others → move to raw/) before transcription.  Files already in raw/ are
    transcribed directly.  originals/ is never scanned.

    Returns the count of newly enqueued jobs.
    """
    db: Session = SessionLocal()
    try:
        known_sources = {r[0] for r in db.query(models.ScanJob.source_path).all()}
        known_video_paths = {r[0] for r in db.query(models.Video.path).all()}

        new_jobs: list[models.ScanJob] = []

        # Scan new/ — files here need to be sorted into raw/ (and originals/ for MTS).
        if os.path.isdir(NEW_DIR):
            for dirpath, _, filenames in os.walk(NEW_DIR):
                for fname in filenames:
                    if fname.startswith("._"):
                        continue
                    if Path(fname).suffix.lower() not in SCAN_EXTENSIONS:
                        continue
                    full_path = os.path.join(dirpath, fname)
                    if full_path in known_sources:
                        continue
                    new_jobs.append(models.ScanJob(
                        source_path=full_path,
                        raw_path=None,
                        needs_remux=1,
                        status="pending",
                    ))

        # Scan raw/ for files that are already in place and just need transcription.
        if os.path.isdir(RAW_DIR):
            for dirpath, _, filenames in os.walk(RAW_DIR):
                for fname in filenames:
                    if fname.startswith("._"):
                        continue
                    if Path(fname).suffix.lower() not in SCAN_EXTENSIONS:
                        continue
                    full_path = os.path.join(dirpath, fname)
                    if full_path in known_sources or full_path in known_video_paths:
                        continue
                    new_jobs.append(models.ScanJob(
                        source_path=full_path,
                        raw_path=full_path,
                        needs_remux=0,
                        status="pending",
                    ))

        for job in new_jobs:
            db.add(job)
        db.flush()  # populate job.id before submitting

        for job in new_jobs:
            _executor.submit(_process_job, job.id)

        db.commit()
        logger.info("Enqueued %d new scan jobs", len(new_jobs))
        return len(new_jobs)
    except Exception:
        logger.exception("Error during discovery")
        db.rollback()
        return 0
    finally:
        db.close()


def resume_incomplete_jobs() -> int:
    """On startup, resubmit any jobs that never finished.

    - pending:    never started (e.g. server restarted before the executor picked them up)
    - processing: interrupted mid-run; reset to pending so _process_job starts clean
    """
    db: Session = SessionLocal()
    try:
        jobs = db.query(models.ScanJob).filter(
            models.ScanJob.status.in_(["pending", "processing"])
        ).all()
        for job in jobs:
            job.status = "pending"
            job.started_at = None
            job.finished_at = None
        db.commit()
        job_ids = [job.id for job in jobs]
    finally:
        db.close()

    for job_id in job_ids:
        _executor.submit(_process_job, job_id)

    if job_ids:
        logger.info("Resumed %d incomplete job(s) from previous session", len(job_ids))
    return len(job_ids)


def retry_failed_jobs() -> int:
    """Reset all error-status jobs to pending and resubmit to the executor."""
    db: Session = SessionLocal()
    try:
        jobs = db.query(models.ScanJob).filter(
            models.ScanJob.status == "error"
        ).all()
        for job in jobs:
            job.status = "pending"
            job.error_message = None
            job.started_at = None
            job.finished_at = None
        db.commit()
        job_ids = [job.id for job in jobs]
    finally:
        db.close()

    for job_id in job_ids:
        _executor.submit(_process_job, job_id)

    return len(job_ids)


def get_scan_summary(db: Session) -> dict[str, int]:
    """Return job counts grouped by status."""
    statuses = [r[0] for r in db.query(models.ScanJob.status).all()]
    counts = Counter(statuses)
    return {
        "total": len(statuses),
        "pending": counts.get("pending", 0),
        "processing": counts.get("processing", 0),
        "done": counts.get("done", 0),
        "error": counts.get("error", 0),
    }


# ---------------------------------------------------------------------------
# Worker (runs in executor thread — must create its own DB session)
# ---------------------------------------------------------------------------

def _process_job(job_id: int) -> None:
    db: Session = SessionLocal()
    try:
        job = db.query(models.ScanJob).filter(models.ScanJob.id == job_id).first()
        if job is None:
            return

        job.status = "processing"
        job.started_at = datetime.now(timezone.utc)
        db.commit()

        source_path = str(job.source_path)

        if not _is_stable(source_path):
            _fail(db, job, "File failed stability check (size changed or file is empty)")
            return

        # --- Prepare stage (new/ files only) ---
        # Sort the file from new/ into its final location(s):
        #   MTS  → remux MP4 to raw/, move original MTS to originals/
        #   other → move directly to raw/
        if job.needs_remux:
            target_raw = _compute_raw_target(source_path)
            ext = Path(source_path).suffix.lower()

            try:
                if ext == ".mts":
                    if not os.path.exists(target_raw):
                        _remux_mts(Path(source_path), Path(target_raw))
                        logger.info("Remuxed %s → %s", source_path, target_raw)
                    else:
                        logger.info("Raw target already exists, skipping remux: %s", target_raw)

                    # Archive the original MTS (idempotent — skip if already moved)
                    originals_target = _compute_originals_target(source_path)
                    if not os.path.exists(originals_target) and os.path.exists(source_path):
                        Path(originals_target).parent.mkdir(parents=True, exist_ok=True)
                        shutil.move(source_path, originals_target)
                        logger.info("Archived original %s → %s", source_path, originals_target)
                else:
                    if not os.path.exists(target_raw):
                        Path(target_raw).parent.mkdir(parents=True, exist_ok=True)
                        shutil.move(source_path, target_raw)
                        logger.info("Moved %s → %s", source_path, target_raw)
                    else:
                        logger.info("Raw target already exists, skipping move: %s", target_raw)
            except Exception as exc:
                _fail(db, job, f"Prepare stage failed: {exc}")
                return

            job.raw_path = target_raw
            db.commit()

        raw_path = str(job.raw_path)

        # --- Skip if already in DB (e.g. raw/ scan ran first in same batch) ---
        existing = db.query(models.Video).filter(models.Video.path == raw_path).first()
        if existing is not None:
            logger.info("Video already in DB, skipping transcription: %s", raw_path)
            job.status = "done"
            job.video_id = existing.id
            job.finished_at = datetime.now(timezone.utc)
            db.commit()
            return

        # --- Transcription ---
        try:
            transcription = _transcribe(raw_path, language=WHISPER_LANGUAGE)
        except Exception as exc:
            _fail(db, job, f"Transcription failed: {exc}")
            return

        metadata = _get_video_metadata(raw_path)
        duration = metadata.get("duration")
        if duration is not None:
            transcription = _trim_hallucinations(transcription, duration)
        recorded_at = _get_recorded_at(raw_path)
        title = _parse_filename_title(Path(raw_path).name)

        # --- Create Video record ---
        try:
            video = models.Video(
                path=raw_path,
                filename=Path(raw_path).name,
                title=title,
                recorded_at=recorded_at,
                duration_sec=metadata.get("duration"),
                transcript_text=transcription.get("text", ""),
                thumbnail_path=None,
            )
            db.add(video)
            db.commit()
            db.refresh(video)
        except Exception as exc:
            db.rollback()
            _fail(db, job, f"DB insert failed: {exc}")
            return

        # --- Thumbnail ---
        thumbnail_path = Path(THUMBNAILS_DIR) / f"{video.id}.jpg"
        try:
            _generate_thumbnail(Path(raw_path), thumbnail_path)
            video.thumbnail_path = str(thumbnail_path)
            db.commit()
        except Exception as exc:
            logger.warning("Thumbnail failed for %s: %s", raw_path, exc)

        # --- Transcript segments ---
        try:
            for seg in transcription.get("segments", []):
                db.add(models.TranscriptSegment(
                    video_id=video.id,
                    segment_index=int(seg["id"]),
                    start_ms=int(seg["start"] * 1000),
                    end_ms=int(seg["end"] * 1000),
                    original_text=str(seg["text"]),
                ))
            db.commit()
        except Exception as exc:
            logger.warning("Segment insert failed for video %d: %s", video.id, exc)

        job.status = "done"
        job.video_id = video.id
        job.finished_at = datetime.now(timezone.utc)
        db.commit()
        logger.info("Processed %s → Video id=%d", raw_path, video.id)

    except Exception:
        logger.exception("Unexpected error processing job %d", job_id)
        db.rollback()
        try:
            job = db.query(models.ScanJob).filter(models.ScanJob.id == job_id).first()
            if job:
                _fail(db, job, "Unexpected internal error")
        except Exception:
            pass
    finally:
        db.close()


def _fail(db: Session, job: models.ScanJob, message: str) -> None:
    job.status = "error"
    job.error_message = message
    job.finished_at = datetime.now(timezone.utc)
    db.commit()
    logger.error("Job %d failed: %s", job.id, message)


# ---------------------------------------------------------------------------
# Re-transcription (replaces transcript for an existing video)
# ---------------------------------------------------------------------------

def enqueue_retranscribe(video_id: int, path: str, language: str) -> None:
    _executor.submit(_retranscribe_job, video_id, path, language)


def _retranscribe_job(video_id: int, path: str, language: str) -> None:
    db: Session = SessionLocal()
    try:
        logger.info("Re-transcribing video id=%d with language=%s", video_id, language)
        transcription = _transcribe(path, language=language)

        metadata = _get_video_metadata(path)
        duration = metadata.get("duration")
        if duration is not None:
            transcription = _trim_hallucinations(transcription, duration)

        video = db.query(models.Video).filter(models.Video.id == video_id).first()
        if video is None:
            logger.error("Re-transcribe: video id=%d not found in DB", video_id)
            return

        # Replace transcript text
        video.transcript_text = transcription.get("text", "")

        # Replace all segments
        db.query(models.TranscriptSegment).filter(
            models.TranscriptSegment.video_id == video_id
        ).delete()

        for seg in transcription.get("segments", []):
            db.add(models.TranscriptSegment(
                video_id=video_id,
                segment_index=int(seg["id"]),
                start_ms=int(seg["start"] * 1000),
                end_ms=int(seg["end"] * 1000),
                original_text=str(seg["text"]),
            ))

        db.commit()
        logger.info("Re-transcription complete for video id=%d", video_id)
    except Exception:
        logger.exception("Re-transcription failed for video id=%d", video_id)
        db.rollback()
    finally:
        db.close()
