/**
 * TypeScript types matching backend schemas
 * Based on backend/schemas.py and backend/models.py
 */

export interface Video {
    id: number;
    path: string;
    filename: string;
    title: string | null;
    recorded_at: string | null;
    duration_sec: number | null;
    transcript_text: string | null;
    thumbnail_path: string | null;
    created_at: string;
    updated_at: string | null;
}

export interface VideoCreate {
    path: string;
    filename: string;
    title?: string | null;
    recorded_at?: string | null;
    duration_sec?: number | null;
    transcript_text?: string | null;
}

export interface VideoUpdate {
    path?: string | null;
    filename?: string | null;
    title?: string | null;
    recorded_at?: string | null;
    duration_sec?: number | null;
    transcript_text?: string | null;
}

export interface TranscriptSegment {
    id: number;
    video_id: number;
    segment_index: number;
    start_ms: number;
    end_ms: number;
    original_text: string;
    corrected_text: string | null;
    created_at: string;
    updated_at: string | null;
}

export interface TranscriptSegmentCreate {
    video_id: number;
    segment_index: number;
    start_ms: number;
    end_ms: number;
    original_text: string;
    corrected_text?: string | null;
}

export interface TranscriptSegmentPatch {
    corrected_text?: string | null;
    start_ms?: number | null;
    end_ms?: number | null;
}
