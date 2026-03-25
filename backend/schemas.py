from datetime import datetime
from pydantic import BaseModel

class VideoBase(BaseModel):
    path: str
    filename: str
    title: str | None = None
    recorded_at: str | None = None
    duration_sec: float | None = None
    transcript_text: str | None = None


class VideoCreate(VideoBase):
    pass


class VideoUpdate(BaseModel):
    path: str | None = None
    filename: str | None = None
    title: str | None = None
    recorded_at: str | None = None
    duration_sec: float | None = None
    transcript_text: str | None = None


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
