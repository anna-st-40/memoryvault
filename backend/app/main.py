import os
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from app.database import Base, engine, get_db
from app import models, schemas
from app.services.semantic_index import get_semantic_map_status, reindex_semantic_map

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
thumbnails_dir = os.path.join(os.path.dirname(__file__), "..", "..", "thumbnails")
os.makedirs(thumbnails_dir, exist_ok=True)
app.mount("/thumbnails", StaticFiles(directory=thumbnails_dir), name="thumbnails")

# --- Video Endpoints ---

@app.post("/videos/", response_model=schemas.Video)
def create_video(video: schemas.VideoCreate, db: Session = Depends(get_db)):
    db_video = models.Video(**video.model_dump())
    db.add(db_video)
    db.commit()
    db.refresh(db_video)
    return db_video


@app.get("/videos/", response_model=list[schemas.Video])
def read_videos(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
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


@app.patch("/transcript-segments/{segment_id}", response_model=schemas.TranscriptSegment)
def patch_transcript_segment(segment_id: int, segment: schemas.TranscriptSegmentPatch, db: Session = Depends(get_db)):
    db_segment = db.query(models.TranscriptSegment).filter(models.TranscriptSegment.id == segment_id).first()
    if db_segment is None:
        raise HTTPException(status_code=404, detail="Transcript segment not found")
    
    update_data = segment.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_segment, key, value)
    
    db.commit()
    db.refresh(db_segment)
    return db_segment


@app.delete("/transcript-segments/{segment_id}")
def delete_transcript_segment(segment_id: int, db: Session = Depends(get_db)):
    db_segment = db.query(models.TranscriptSegment).filter(models.TranscriptSegment.id == segment_id).first()
    if db_segment is None:
        raise HTTPException(status_code=404, detail="Transcript segment not found")
    
    db.delete(db_segment)
    db.commit()
    return {"message": "Transcript segment deleted successfully"}
