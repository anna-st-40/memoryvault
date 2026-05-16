import logging
import os
from pathlib import Path
import subprocess
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from collections import Counter

from memoryvault_shared.database import Base, engine, get_db
from memoryvault_shared import models
from app import schemas

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="MemoryVault API", version="0.1.0")

# Configure CORS
# In production (Docker), requests come through nginx
# In development, allow localhost origins
cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files for thumbnails
thumbnails_dir = os.getenv("THUMBNAILS_DIR", str(Path(__file__).resolve().parent.parent / "thumbnails"))
os.makedirs(thumbnails_dir, exist_ok=True)
app.mount("/thumbnails", StaticFiles(directory=thumbnails_dir), name="thumbnails")


def _build_title(video: models.Video) -> str:
    title = (video.title if isinstance(video.title, str) else None)
    filename = (video.filename if isinstance(video.filename, str) else None)
    video_id = getattr(video, "id", None)
    return (title or filename or f"Video {video_id}").strip()


def _build_summary(video: models.Video, max_len: int = 220) -> str:
    transcript = video.transcript_text if isinstance(video.transcript_text, str) else ""
    text = transcript.strip().replace("\n", " ")
    if not text:
        return ""
    if len(text) <= max_len:
        return text
    return f"{text[:max_len].rstrip()}..."


def _build_thumbnail_url(video: models.Video) -> str | None:
    raw_thumbnail_path = getattr(video, "thumbnail_path", None)
    thumbnail_path = raw_thumbnail_path.strip() if type(raw_thumbnail_path) is str else None
    if not thumbnail_path:
        return None
    basename = os.path.basename(thumbnail_path)
    if not basename:
        return None
    return f"/thumbnails/{basename}"


def _to_semantic_map_point_from_index(
    video: models.Video,
    index_row: models.VideoSemanticIndex,
) -> schemas.SemanticMapPoint:
    video_id = getattr(video, "id", "")
    map_x_raw = getattr(index_row, "map_x", 0.0)
    map_y_raw = getattr(index_row, "map_y", 0.0)
    map_x = float(map_x_raw) if isinstance(map_x_raw, (int, float)) else 0.0
    map_y = float(map_y_raw) if isinstance(map_y_raw, (int, float)) else 0.0
    summary_text = index_row.summary_text if isinstance(index_row.summary_text, str) else None
    recorded_at = video.recorded_at if isinstance(video.recorded_at, str) else None
    duration_sec = float(video.duration_sec) if isinstance(video.duration_sec, (int, float)) else None
    cluster_label = index_row.cluster_label if isinstance(index_row.cluster_label, str) else None

    return schemas.SemanticMapPoint(
        id=str(video_id),
        x=map_x,
        y=map_y,
        title=_build_title(video),
        summary=(summary_text or _build_summary(video)),
        date=recorded_at,
        duration_sec=duration_sec,
        thumbnail_url=_build_thumbnail_url(video),
        video_url=f"/videos/{video_id}/stream",
        cluster_label=cluster_label,
    )

# --- Video Endpoints ---

@app.post("/videos/", response_model=schemas.Video)
def create_video(video: schemas.VideoCreate, db: Session = Depends(get_db)):
    db_video = models.Video(**video.model_dump())
    db.add(db_video)
    db.commit()
    db.refresh(db_video)
    return db_video


@app.get("/videos/", response_model=list[schemas.Video])
def read_videos(skip: int = 0, limit: int | None = None, db: Session = Depends(get_db)):
    videos = db.query(models.Video).order_by(models.Video.recorded_at.desc()).offset(skip).limit(limit).all()
    return videos


@app.get("/videos/{video_id}", response_model=schemas.Video)
def read_video(video_id: int, db: Session = Depends(get_db)):
    video = db.query(models.Video).filter(models.Video.id == video_id).first()
    if video is None:
        raise HTTPException(status_code=404, detail="Video not found")
    return video


@app.patch("/videos/{video_id}", response_model=schemas.Video)
def update_video(video_id: int, video: schemas.VideoPatch, db: Session = Depends(get_db)):
    db_video = db.query(models.Video).filter(models.Video.id == video_id).first()
    if db_video is None:
        raise HTTPException(status_code=404, detail="Video not found")
    
    update_data = video.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_video, key, value)
    
    db.commit()
    db.refresh(db_video)
    return db_video


@app.get("/videos/{video_id}/stream")
def stream_video(video_id: int, db: Session = Depends(get_db)):
    video = db.query(models.Video).filter(models.Video.id == video_id).first()
    if video is None:
        raise HTTPException(status_code=404, detail="Video not found")
    if not os.path.isfile(str(video.path)):
        raise HTTPException(status_code=404, detail="Video file not found on disk")
    return FileResponse(str(video.path), media_type="video/mp4")





@app.delete("/videos/{video_id}")
def delete_video(video_id: int, db: Session = Depends(get_db)):
    db_video = db.query(models.Video).filter(models.Video.id == video_id).first()
    if db_video is None:
        raise HTTPException(status_code=404, detail="Video not found")

    db.delete(db_video)
    db.commit()
    return {"message": "Video deleted successfully"}


@app.post("/videos/concatenate", response_model=schemas.Video)
def concatenate_videos(req: schemas.ConcatenateRequest, db: Session = Depends(get_db)):
    """Concatenate multiple videos into one using ffmpeg concat demuxer."""
    import shutil
    import tempfile
    from pathlib import Path
    from app.config import parse_filename_title, RAW_DIR

    if len(req.video_ids) < 2:
        raise HTTPException(status_code=400, detail="At least 2 video IDs are required")

    videos = db.query(models.Video).filter(models.Video.id.in_(req.video_ids)).all()
    if len(videos) != len(req.video_ids):
        found_ids = {v.id for v in videos}
        missing = [vid for vid in req.video_ids if vid not in found_ids]
        raise HTTPException(status_code=404, detail=f"Videos not found: {missing}")

    for v in videos:
        if not os.path.isfile(str(v.path)):
            raise HTTPException(status_code=400, detail=f"File not found on disk for video {v.id}: {v.path}")

    video_by_id = {v.id: v for v in videos}
    ordered = [video_by_id[vid] for vid in req.video_ids]
    first_video = ordered[0]
    last_video = ordered[-1]

    year = str(last_video.recorded_at)[:4] if last_video.recorded_at else "unknown"
    output_path = os.path.join(RAW_DIR, year, req.output_filename)

    if os.path.exists(output_path):
        raise HTTPException(status_code=409, detail=f"Output file already exists: {output_path}")

    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    try:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as tf:
            list_path = tf.name
            for v in ordered:
                tf.write(f"file '{v.path}'\n")

        result = subprocess.run(
            ["ffmpeg", "-f", "concat", "-safe", "0", "-i", list_path, "-c", "copy", output_path],
            capture_output=True, text=True,
        )
        os.unlink(list_path)
        if result.returncode != 0:
            if os.path.exists(output_path):
                os.remove(output_path)
            raise HTTPException(status_code=500, detail=f"ffmpeg failed: {result.stderr[-2000:]}")
    except HTTPException:
        raise
    except Exception as exc:
        if os.path.exists(output_path):
            os.remove(output_path)
        raise HTTPException(status_code=500, detail=f"Concatenation error: {exc}") from exc

    all_segments: list[tuple[models.Video, list[models.TranscriptSegment]]] = []
    for v in ordered:
        segs = (
            db.query(models.TranscriptSegment)
            .filter(models.TranscriptSegment.video_id == v.id)
            .order_by(models.TranscriptSegment.segment_index)
            .all()
        )
        all_segments.append((v, segs))

    combined_transcript = "".join(
        seg.corrected_text or seg.original_text
        for _, segs in all_segments
        for seg in segs
    )

    total_duration: float | None = None
    if all(v.duration_sec is not None for v in ordered):
        total_duration = sum(float(v.duration_sec) for v in ordered)  # type: ignore[arg-type]

    new_video = models.Video(
        path=output_path,
        filename=req.output_filename,
        title=req.title if req.title is not None else parse_filename_title(req.output_filename),
        recorded_at=last_video.recorded_at,
        duration_sec=total_duration,
        transcript_text=combined_transcript,
        thumbnail_path=None,
    )
    db.add(new_video)
    db.flush()

    thumbnail_src = Path(thumbnails_dir) / f"{first_video.id}.jpg"
    if thumbnail_src.is_file():
        thumbnail_dst = Path(thumbnails_dir) / f"{new_video.id}.jpg"
        try:
            shutil.copy2(str(thumbnail_src), str(thumbnail_dst))
            new_video.thumbnail_path = str(thumbnail_dst)
        except Exception as exc:
            logging.warning("Could not copy thumbnail for new video %d: %s", new_video.id, exc)

    db.commit()
    db.refresh(new_video)

    seg_index = 0
    offset_ms = 0
    for v, segs in all_segments:
        for seg in segs:
            db.add(models.TranscriptSegment(
                video_id=new_video.id,
                segment_index=seg_index,
                start_ms=seg.start_ms + offset_ms,
                end_ms=seg.end_ms + offset_ms,
                original_text=seg.original_text,
                corrected_text=seg.corrected_text,
            ))
            seg_index += 1
        offset_ms += round((v.duration_sec or 0) * 1000)
    db.commit()

    for v in ordered:
        vid_id = v.id
        vid_path = str(v.path)
        thumb_path = str(v.thumbnail_path) if v.thumbnail_path else None

        db.query(models.TranscriptSegment).filter(models.TranscriptSegment.video_id == vid_id).delete()
        db.query(models.VideoSemanticIndex).filter(models.VideoSemanticIndex.video_id == vid_id).delete()
        db.query(models.ScanJob).filter(models.ScanJob.video_id == vid_id).update({"video_id": None})
        db.delete(v)
        db.commit()

        try:
            os.remove(vid_path)
        except OSError as exc:
            logging.warning("Could not delete video file %s: %s", vid_path, exc)

        if thumb_path and os.path.isfile(thumb_path):
            try:
                os.remove(thumb_path)
            except OSError as exc:
                logging.warning("Could not delete thumbnail %s: %s", thumb_path, exc)

    db.refresh(new_video)
    return new_video


# --- Transcript Segment Endpoints ---

@app.post("/transcript-segments/", response_model=schemas.TranscriptSegment)
def create_transcript_segment(segment: schemas.TranscriptSegmentCreate, db: Session = Depends(get_db)):
    db_segment = models.TranscriptSegment(**segment.model_dump())
    db.add(db_segment)
    db.commit()
    db.refresh(db_segment)
    return db_segment


@app.get("/transcript-segments/", response_model=list[schemas.TranscriptSegment])
def read_transcript_segments(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    segments = db.query(models.TranscriptSegment).offset(skip).limit(limit).all()
    return segments


@app.get("/transcript-segments/{segment_id}", response_model=schemas.TranscriptSegment)
def read_transcript_segment(segment_id: int, db: Session = Depends(get_db)):
    segment = db.query(models.TranscriptSegment).filter(models.TranscriptSegment.id == segment_id).first()
    if segment is None:
        raise HTTPException(status_code=404, detail="Transcript segment not found")
    return segment


@app.get("/videos/{video_id}/transcript-segments/", response_model=list[schemas.TranscriptSegment])
def read_video_transcript_segments(video_id: int, db: Session = Depends(get_db)):
    segments = db.query(models.TranscriptSegment).filter(models.TranscriptSegment.video_id == video_id).order_by(models.TranscriptSegment.segment_index).all()
    return segments


def _rebuild_transcript(video_id: int, db: Session) -> None:
    segments = (
        db.query(models.TranscriptSegment)
        .filter(models.TranscriptSegment.video_id == video_id)
        .order_by(models.TranscriptSegment.segment_index)
        .all()
    )
    transcript = "".join(seg.corrected_text or seg.original_text for seg in segments)
    db_video = db.query(models.Video).filter(models.Video.id == video_id).first()
    if db_video is not None:
        db_video.transcript_text = transcript
        db.commit()


@app.patch("/transcript-segments/{segment_id}", response_model=schemas.TranscriptSegment)
def patch_transcript_segment(segment_id: int, segment: schemas.TranscriptSegmentPatch, db: Session = Depends(get_db)):
    db_segment = db.query(models.TranscriptSegment).filter(models.TranscriptSegment.id == segment_id).first()
    if db_segment is None:
        raise HTTPException(status_code=404, detail="Transcript segment not found")

    update_data = segment.model_dump(exclude_unset=True)
    if "corrected_text" in update_data and isinstance(update_data["corrected_text"], str):
        if update_data["corrected_text"] and not update_data["corrected_text"].startswith(" "):
            update_data["corrected_text"] = " " + update_data["corrected_text"]

    for key, value in update_data.items():
        setattr(db_segment, key, value)

    db.commit()
    db.refresh(db_segment)
    _rebuild_transcript(db_segment.video_id, db)
    return db_segment


@app.delete("/transcript-segments/{segment_id}")
def delete_transcript_segment(segment_id: int, db: Session = Depends(get_db)):
    db_segment = db.query(models.TranscriptSegment).filter(models.TranscriptSegment.id == segment_id).first()
    if db_segment is None:
        raise HTTPException(status_code=404, detail="Transcript segment not found")

    video_id = db_segment.video_id
    db.delete(db_segment)
    db.commit()
    _rebuild_transcript(video_id, db)
    return {"message": "Transcript segment deleted successfully"}

# --- Semantic Map Endpoints ---

@app.get("/semantic-map", response_model=list[schemas.SemanticMapPoint])
def read_semantic_map_points(db: Session = Depends(get_db)):
    videos = db.query(models.Video).order_by(models.Video.recorded_at.desc()).all()
    indexed_rows = db.query(models.VideoSemanticIndex).all()
    indexed_by_video_id = {row.video_id: row for row in indexed_rows}

    missing = [video.id for video in videos if video.id not in indexed_by_video_id]
    if missing:
        raise HTTPException(
            status_code=409,
            detail=f"Semantic index is incomplete for {len(missing)} video(s). Run POST /semantic-map/reindex.",
        )

    points: list[schemas.SemanticMapPoint] = []
    for video in videos:
        index_row = indexed_by_video_id.get(video.id)
        if index_row is None:
            continue
        points.append(_to_semantic_map_point_from_index(video, index_row))

    return points


@app.get("/semantic-map/status", response_model=schemas.SemanticMapStatus)
def read_semantic_map_status(db: Session = Depends(get_db)):
    from datetime import datetime, timezone
    total_videos = db.query(models.Video).count()
    indexed_rows = db.query(models.VideoSemanticIndex).all()
    indexed_videos = len(indexed_rows)

    latest_indexed_at = None
    model_name = None
    index_version = None
    if indexed_rows:
        latest = max(
            indexed_rows,
            key=lambda row: row.indexed_at or datetime.fromtimestamp(0, tz=timezone.utc),
        )
        latest_indexed_at = latest.indexed_at if isinstance(latest.indexed_at, datetime) else None
        model_name = latest.embedding_model if isinstance(latest.embedding_model, str) else None
        index_version = latest.index_version if isinstance(latest.index_version, str) else None

    return schemas.SemanticMapStatus(
        total_videos=total_videos,
        indexed_videos=indexed_videos,
        missing_videos=max(total_videos - indexed_videos, 0),
        latest_indexed_at=latest_indexed_at,
        model_name=model_name,
        index_version=index_version,
    )


@app.post("/semantic-map/reindex", response_model=schemas.ReindexJobStatus, status_code=202)
def post_semantic_map_reindex(request: schemas.SemanticMapReindexRequest, db: Session = Depends(get_db)):
    job = models.ReindexJob(mode=request.mode, limit=request.limit)
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


@app.get("/semantic-map/reindex/jobs", response_model=list[schemas.ReindexJobStatus])
def list_reindex_jobs(skip: int = 0, limit: int = 20, db: Session = Depends(get_db)):
    return (
        db.query(models.ReindexJob)
        .order_by(models.ReindexJob.enqueued_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


# --- Scan Endpoints ---

@app.post("/scan", status_code=202)
def trigger_scan(db: Session = Depends(get_db)):
    """Walk new/ and raw/, create ScanJob records for new files. The worker picks them up."""
    from app.config import RAW_DIR
    SCAN_EXTENSIONS = frozenset({".mp4", ".mov", ".mts", ".mkv", ".avi", ".m4v", ".mpg", ".mpeg"})
    NEW_DIR = os.path.join(os.getenv("MEMORYVAULT_BASE", "/data"), "new")

    known_sources = {r[0] for r in db.query(models.ScanJob.source_path).all()}
    known_video_paths = {r[0] for r in db.query(models.Video.path).all()}
    new_jobs = []

    for scan_dir, needs_remux, raw_path_fn in [
        (NEW_DIR, 1, lambda p: None),
        (RAW_DIR, 0, lambda p: p),
    ]:
        if not os.path.isdir(scan_dir):
            continue
        for dirpath, _, filenames in os.walk(scan_dir):
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
                    raw_path=raw_path_fn(full_path),
                    needs_remux=needs_remux,
                    status="pending",
                ))

    for job in new_jobs:
        db.add(job)
    db.commit()
    return {"enqueued": len(new_jobs), "message": "Jobs queued; worker will pick them up"}


@app.get("/scan/status", response_model=schemas.ScanSummary)
def get_scan_status(db: Session = Depends(get_db)):
    statuses = [r[0] for r in db.query(models.ScanJob.status).all()]
    counts = Counter(statuses)
    return schemas.ScanSummary(
        total=len(statuses),
        pending=counts.get("pending", 0),
        processing=counts.get("processing", 0),
        done=counts.get("done", 0),
        error=counts.get("error", 0),
    )


@app.get("/scan/jobs", response_model=list[schemas.ScanJobStatus])
def list_scan_jobs(
    status: str | None = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    query = db.query(models.ScanJob)
    if status:
        query = query.filter(models.ScanJob.status == status)
    return query.order_by(models.ScanJob.enqueued_at.desc()).offset(skip).limit(limit).all()


@app.post("/scan/retry", status_code=202)
def retry_scan_errors(db: Session = Depends(get_db)):
    """Reset all error-status scan jobs to pending; the worker will pick them up."""
    jobs = db.query(models.ScanJob).filter(models.ScanJob.status == "error").all()
    for job in jobs:
        job.status = "pending"
        job.error_message = None
        job.started_at = None
        job.finished_at = None
    db.commit()
    return {"message": f"Requeued {len(jobs)} failed jobs"}