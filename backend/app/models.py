from sqlalchemy import Column, Integer, String, DateTime, Float, ForeignKey
from sqlalchemy.sql import func

from app.database import Base

class Video(Base):
    __tablename__ = "videos"

    id = Column(Integer, primary_key=True, index=True)
    path = Column(String, nullable=False, unique=True)
    filename = Column(String, nullable=False)
    title = Column(String, nullable=True)
    recorded_at = Column(String, nullable=True)
    duration_sec = Column(Float, nullable=True)
    transcript_text = Column(String, nullable=True)
    thumbnail_path = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class TranscriptSegment(Base):
    __tablename__ = "transcript_segments"

    id = Column(Integer, primary_key=True, index=True)
    video_id = Column(Integer, ForeignKey("videos.id"), nullable=False)
    segment_index = Column(Integer, nullable=False)
    start_ms = Column(Integer, nullable=False)
    end_ms = Column(Integer, nullable=False)
    original_text = Column(String, nullable=False)
    corrected_text = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class VideoSemanticIndex(Base):
    __tablename__ = "video_semantic_index"

    id = Column(Integer, primary_key=True, index=True)
    video_id = Column(Integer, ForeignKey("videos.id"), nullable=False, unique=True, index=True)
    embedding_json = Column(String, nullable=True)
    embedding_model = Column(String, nullable=True)
    embedding_dim = Column(Integer, nullable=True)
    map_x = Column(Float, nullable=False, default=0.0)
    map_y = Column(Float, nullable=False, default=0.0)
    cluster_id = Column(Integer, nullable=True)
    cluster_label = Column(String, nullable=True)
    summary_text = Column(String, nullable=True)
    source_hash = Column(String, nullable=False, index=True)
    index_version = Column(String, nullable=True)
    indexed_at = Column(DateTime(timezone=True), server_default=func.now())
