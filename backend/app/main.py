import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from app.database import Base, engine, get_db
from app import models, schemas
from app.services.semantic_indexing import get_semantic_map_status, reindex_semantic_map

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)

# Create database tables
Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.services.scanner import resume_incomplete_jobs
    resume_incomplete_jobs()
    yield


app = FastAPI(title="MemoryVault API", version="0.1.0", lifespan=lifespan)

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


@app.post("/videos/{video_id}/retranscribe", status_code=202)
def retranscribe_video(video_id: int, body: schemas.RetranscribeRequest, db: Session = Depends(get_db)):
    """Re-run Whisper on an existing video with a different language, replacing all transcript data."""
    video = db.query(models.Video).filter(models.Video.id == video_id).first()
    if video is None:
        raise HTTPException(status_code=404, detail="Video not found")
    if not os.path.isfile(str(video.path)):
        raise HTTPException(status_code=404, detail="Video file not found on disk")
    from app.services.scanner import enqueue_retranscribe
    enqueue_retranscribe(video_id, str(video.path), body.language)
    return {"message": "Re-transcription queued"}


@app.delete("/videos/{video_id}")
def delete_video(video_id: int, db: Session = Depends(get_db)):
    db_video = db.query(models.Video).filter(models.Video.id == video_id).first()
    if db_video is None:
        raise HTTPException(status_code=404, detail="Video not found")
    
    db.delete(db_video)
    db.commit()
    return {"message": "Video deleted successfully"}


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
    return get_semantic_map_status(db)


@app.post("/semantic-map/reindex", response_model=schemas.SemanticMapReindexResponse)
def post_semantic_map_reindex(request: schemas.SemanticMapReindexRequest, db: Session = Depends(get_db)):
    return reindex_semantic_map(db, mode=request.mode, limit=request.limit)


# --- Scan Endpoints ---

@app.post("/scan", status_code=202)
def trigger_scan():
    """Sort files from new/ into raw/ (and originals/ for MTS), then queue raw/ files for transcription."""
    from app.services.scanner import discover_and_enqueue
    enqueued = discover_and_enqueue()
    return {"enqueued": enqueued, "message": "Processing started in background"}


@app.get("/scan/status", response_model=schemas.ScanSummary)
def get_scan_status(db: Session = Depends(get_db)):
    from app.services.scanner import get_scan_summary
    return get_scan_summary(db)


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
def retry_scan_errors():
    """Requeue all error-status scan jobs."""
    from app.services.scanner import retry_failed_jobs
    count = retry_failed_jobs()
    return {"message": f"Requeued {count} failed jobs"}