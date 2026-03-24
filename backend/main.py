from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session

from database import Base, engine, get_db
import models
import schemas

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="MemoryVault API", version="0.1.0")


@app.get("/")
def read_root():
    return {"message": "Welcome to MemoryVault API"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}


# CRUD endpoints for videos
@app.post("/videos/", response_model=schemas.Video)
def create_video(video: schemas.VideoCreate, db: Session = Depends(get_db)):
    db_video = models.Video(**video.model_dump())
    db.add(db_video)
    db.commit()
    db.refresh(db_video)
    return db_video


@app.get("/videos/", response_model=list[schemas.Video])
def read_videos(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    videos = db.query(models.Video).offset(skip).limit(limit).all()
    return videos


@app.get("/videos/{video_id}", response_model=schemas.Video)
def read_video(video_id: int, db: Session = Depends(get_db)):
    video = db.query(models.Video).filter(models.Video.id == video_id).first()
    if video is None:
        raise HTTPException(status_code=404, detail="Video not found")
    return video


@app.put("/videos/{video_id}", response_model=schemas.Video)
def update_video(video_id: int, video: schemas.VideoUpdate, db: Session = Depends(get_db)):
    db_video = db.query(models.Video).filter(models.Video.id == video_id).first()
    if db_video is None:
        raise HTTPException(status_code=404, detail="Video not found")
    
    update_data = video.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_video, key, value)
    
    db.commit()
    db.refresh(db_video)
    return db_video


@app.delete("/videos/{video_id}")
def delete_video(video_id: int, db: Session = Depends(get_db)):
    db_video = db.query(models.Video).filter(models.Video.id == video_id).first()
    if db_video is None:
        raise HTTPException(status_code=404, detail="Video not found")
    
    db.delete(db_video)
    db.commit()
    return {"message": "Video deleted successfully"}


# CRUD endpoints for transcript segments
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
