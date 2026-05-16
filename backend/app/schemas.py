from datetime import datetime
from pydantic import BaseModel
from typing import Literal

class VideoBase(BaseModel):
    path: str
    filename: str
    title: str | None = None
    recorded_at: str | None = None
    duration_sec: float | None = None
    transcript_text: str | None = None
    thumbnail_path: str | None = None


class VideoCreate(VideoBase):
    pass


class VideoPatch(BaseModel):
    path: str | None = None
    filename: str | None = None
    title: str | None = None
    recorded_at: str | None = None
    duration_sec: float | None = None
    transcript_text: str | None = None
    thumbnail_path: str | None = None


class Video(VideoBase):
    id: int
    created_at: datetime
    updated_at: datetime | None = None

    class Config:
        from_attributes = True


class TranscriptSegmentBase(BaseModel):
    video_id: int
    segment_index: int
    start_ms: int
    end_ms: int
    original_text: str
    corrected_text: str | None = None


class TranscriptSegmentCreate(TranscriptSegmentBase):
    pass


class TranscriptSegmentPatch(BaseModel):
    corrected_text: str | None = None
    start_ms: int | None = None
    end_ms: int | None = None


class TranscriptSegment(TranscriptSegmentBase):
    id: int
    created_at: datetime
    updated_at: datetime | None = None

    class Config:
        from_attributes = True


class SemanticMapPoint(BaseModel):
    id: str
    x: float
    y: float
    title: str
    summary: str
    date: str | None = None
    duration_sec: float | None = None
    thumbnail_url: str | None = None
    video_url: str | None = None
    cluster_label: str | None = None


class SemanticMapReindexRequest(BaseModel):
    mode: Literal["full", "incremental"] = "incremental"
    limit: int | None = None


class SemanticMapReindexResponse(BaseModel):
    mode: Literal["full", "incremental"]
    total_videos_considered: int
    candidates_indexed: int
    points_written: int
    model_name: str
    index_version: str
    fallback_used: bool
    fallback_reason: str | None = None
    indexed_at: datetime


class SemanticMapStatus(BaseModel):
    total_videos: int
    indexed_videos: int
    missing_videos: int
    latest_indexed_at: datetime | None = None
    model_name: str | None = None
    index_version: str | None = None


class ScanJobStatus(BaseModel):
    id: int
    source_path: str
    raw_path: str | None = None
    needs_remux: bool
    status: str
    error_message: str | None = None
    video_id: int | None = None
    enqueued_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None

    class Config:
        from_attributes = True


class ScanSummary(BaseModel):
    total: int
    pending: int
    processing: int
    done: int
    error: int


class ConcatenateRequest(BaseModel):
    video_ids: list[int]
    output_filename: str
    title: str | None = None


class ReindexJobStatus(BaseModel):
    id: int
    mode: str
    limit: int | None = None
    status: str
    error_message: str | None = None
    result_json: str | None = None
    enqueued_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None

    class Config:
        from_attributes = True
