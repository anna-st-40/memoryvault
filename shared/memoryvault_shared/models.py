from sqlalchemy import Column, Integer, String, DateTime, Float, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func

from memoryvault_shared.database import Base


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
    file_hash = Column(String, nullable=True, unique=True, index=True)
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


class ScanJob(Base):
    __tablename__ = "scan_jobs"

    id = Column(Integer, primary_key=True, index=True)
    source_path = Column(String, nullable=False, unique=True, index=True)
    raw_path = Column(String, nullable=True)
    needs_remux = Column(Integer, nullable=False, default=0)
    status = Column(String, nullable=False, default="pending")
    error_message = Column(String, nullable=True)
    video_id = Column(Integer, ForeignKey("videos.id"), nullable=True)
    file_hash = Column(String, nullable=True, index=True)
    enqueued_at = Column(DateTime(timezone=True), server_default=func.now())
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)


class KnownFileHash(Base):
    __tablename__ = "known_file_hashes"

    id = Column(Integer, primary_key=True, index=True)
    file_hash = Column(String, nullable=False, unique=True, index=True)
    video_id = Column(Integer, nullable=True)
    absorbed_into_video_id = Column(Integer, nullable=True)
    recorded_at = Column(DateTime(timezone=True), server_default=func.now())


class ReindexJob(Base):
    __tablename__ = "reindex_jobs"

    id = Column(Integer, primary_key=True, index=True)
    mode = Column(String, nullable=False, default="incremental")
    limit = Column(Integer, nullable=True)
    status = Column(String, nullable=False, default="pending")
    error_message = Column(String, nullable=True)
    result_json = Column(String, nullable=True)
    enqueued_at = Column(DateTime(timezone=True), server_default=func.now())
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)


class TranscriptChunk(Base):
    __tablename__ = "transcript_chunks"

    id = Column(Integer, primary_key=True, index=True)
    video_id = Column(Integer, ForeignKey("videos.id"), nullable=False, index=True)
    chunk_index = Column(Integer, nullable=False)
    start_ms = Column(Integer, nullable=False)
    end_ms = Column(Integer, nullable=False)
    text = Column(String, nullable=False)
    segment_ids = Column(String, nullable=False)       # JSON array of TranscriptSegment.id values
    embedding_json = Column(String, nullable=True)     # JSON float list, null until embedded
    embedding_model = Column(String, nullable=True)
    embedding_dim = Column(Integer, nullable=True)
    embedding_status = Column(String, nullable=False, default="pending")  # pending|done|error
    embedded_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (UniqueConstraint("video_id", "chunk_index", name="uq_chunk_video_index"),)


class RagJob(Base):
    __tablename__ = "rag_jobs"

    id = Column(Integer, primary_key=True, index=True)
    video_id = Column(Integer, ForeignKey("videos.id"), unique=True, index=True, nullable=False)
    status = Column(String, nullable=False, default="pending")  # pending|chunking|embedding|done|error
    error_message = Column(String, nullable=True)
    chunked_at = Column(DateTime(timezone=True), nullable=True)
    embedded_at = Column(DateTime(timezone=True), nullable=True)
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
