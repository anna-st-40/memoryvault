"""Background video scanner for MemoryVault.

Processes ScanJob records from the database: remux/sort if needed, then runs
the full pipeline (WhisperX transcription, thumbnail, DB insert).

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
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from memoryvault_shared import models
from memoryvault_shared.database import SessionLocal

logger = logging.getLogger(__name__)

# --- Config ---
_base = os.environ["MEMORYVAULT_BASE"]
NEW_DIR: str = os.path.join(_base, "new")
ORIGINALS_DIR: str = os.path.join(_base, "originals")
RAW_DIR: str = os.path.join(_base, "raw")
THUMBNAILS_DIR: str = os.environ["THUMBNAILS_DIR"]
_WHISPER_DEVICE = "cpu"
_WHISPER_COMPUTE_TYPE = "int8"

SCAN_EXTENSIONS: frozenset[str] = frozenset(
    {".mp4", ".mov", ".mts", ".mkv", ".avi", ".m4v", ".mpg", ".mpeg"}
)

# Cached WhisperX model — reused across jobs in the same worker process.
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
    """Return True if file size and mtime are unchanged after 5 seconds."""
    try:
        s1 = os.stat(path)
        if s1.st_size == 0:
            return False
        time.sleep(5)
        s2 = os.stat(path)
        return s1.st_size == s2.st_size and s1.st_mtime == s2.st_mtime
    except OSError:
        return False


def _transcribe(file_path: str, model_name: str = "large-v3") -> dict[str, Any]:
    """Transcribe a video with WhisperX, reusing the cached model."""
    import whisperx  # noqa: PLC0415 — deferred import, slow to load
    if model_name not in _whisper_cache:
        logger.info("Loading WhisperX model '%s'...", model_name)
        _whisper_cache[model_name] = whisperx.load_model(
            model_name, device=_WHISPER_DEVICE, compute_type=_WHISPER_COMPUTE_TYPE
        )
    logger.info("Transcribing %s ...", file_path.split("/")[-1])
    audio = whisperx.load_audio(file_path)
    kwargs: dict[str, Any] = {"batch_size": 16}
    result = _whisper_cache[model_name].transcribe(audio, **kwargs)
    for idx, seg in enumerate(result.get("segments", [])):
        seg.setdefault("id", idx)
    return result


def _trim_hallucinations(transcription: dict[str, Any], duration: float) -> dict[str, Any]:
    """Drop or clamp segments that start at or beyond the actual video duration."""
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
# Worker (called from the polling loop — creates its own DB session)
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

        # If the file was already moved to raw/ in a previous attempt, check stability there.
        stability_path = str(job.raw_path) if job.raw_path and os.path.exists(str(job.raw_path)) else source_path
        if not _is_stable(stability_path):
            _fail(db, job, "File failed stability check (size changed or file is empty)")
            return

        # --- Prepare stage (new/ files only) ---
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

        # --- Skip if already in DB ---
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
            transcription = _transcribe(raw_path)
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
        logger.info("Processed %s → Video id=%d", raw_path.split("/")[-1], video.id)

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
