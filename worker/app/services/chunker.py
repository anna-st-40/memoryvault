import json
import logging

from sqlalchemy.orm import Session

from memoryvault_shared import models

logger = logging.getLogger(__name__)

CHUNK_TARGET_MS = 60_000   # aim for 60-second chunks
OVERLAP_MS = 15_000        # carry last 15s of previous chunk into next
MIN_WORDS = 10             # drop degenerate chunks below this word count


def _seg_text(seg: models.TranscriptSegment) -> str:
    return (seg.corrected_text or seg.original_text).strip()


def _emit_chunk(
    video_id: int,
    chunk_index: int,
    segments: list[models.TranscriptSegment],
) -> models.TranscriptChunk | None:
    text = " ".join(_seg_text(s) for s in segments if _seg_text(s))
    if len(text.split()) < MIN_WORDS:
        return None
    return models.TranscriptChunk(
        video_id=video_id,
        chunk_index=chunk_index,
        start_ms=segments[0].start_ms,
        end_ms=segments[-1].end_ms,
        text=text,
        segment_ids=json.dumps([s.id for s in segments]),
        embedding_status="pending",
    )


def chunk_video(video_id: int, db: Session) -> list[models.TranscriptChunk]:
    """
    Groups TranscriptSegments for video_id into ~60s windows with 15s overlap.
    Deletes existing TranscriptChunk rows for the video first (idempotent).
    Returns the list of committed TranscriptChunk rows.
    """
    db.query(models.TranscriptChunk).filter(
        models.TranscriptChunk.video_id == video_id
    ).delete()

    segments = (
        db.query(models.TranscriptSegment)
        .filter(models.TranscriptSegment.video_id == video_id)
        .order_by(models.TranscriptSegment.segment_index)
        .all()
    )

    if not segments:
        db.commit()
        return []

    chunks: list[models.TranscriptChunk] = []
    chunk_index = 0
    accumulator: list[models.TranscriptSegment] = []

    for seg in segments:
        accumulator.append(seg)
        span = accumulator[-1].end_ms - accumulator[0].start_ms

        if span >= CHUNK_TARGET_MS:
            chunk = _emit_chunk(video_id, chunk_index, accumulator)
            if chunk:
                db.add(chunk)
                chunks.append(chunk)
                chunk_index += 1

            # Seed next accumulator with segments from the overlap window
            cutoff_ms = accumulator[-1].end_ms - OVERLAP_MS
            accumulator = [s for s in accumulator if s.start_ms >= cutoff_ms]

    # Emit any remaining segments as a final chunk
    if accumulator:
        span = accumulator[-1].end_ms - accumulator[0].start_ms
        if span >= 10_000:
            chunk = _emit_chunk(video_id, chunk_index, accumulator)
            if chunk:
                db.add(chunk)
                chunks.append(chunk)
        elif chunks:
            # Merge tail into the last chunk to avoid tiny trailing chunks
            last = chunks[-1]
            tail_segs = json.loads(last.segment_ids) + [s.id for s in accumulator]
            last.segment_ids = json.dumps(tail_segs)
            last.end_ms = accumulator[-1].end_ms
            tail_text = " ".join(
                _seg_text(s) for s in accumulator if _seg_text(s)
            )
            if tail_text:
                last.text = last.text + " " + tail_text

    db.commit()
    for c in chunks:
        db.refresh(c)
    logger.info("video %d: created %d chunks", video_id, len(chunks))
    return chunks
