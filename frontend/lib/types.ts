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
    thumbnail_path?: string | null;
}

export interface VideoUpdate {
    path?: string | null;
    filename?: string | null;
    title?: string | null;
    recorded_at?: string | null;
    duration_sec?: number | null;
    transcript_text?: string | null;
    thumbnail_path?: string | null;
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

export interface SemanticMapPoint {
    id: string;
    x: number;
    y: number;
    title: string;
    summary: string;
    date?: string | null;
    durationSec?: number | null;
    thumbnailUrl?: string | null;
    videoUrl?: string | null;
    clusterLabel?: string | null;
}

export interface ScanJob {
    id: number;
    source_path: string;
    raw_path: string | null;
    needs_remux: boolean;
    status: string;
    error_message: string | null;
    video_id: number | null;
    enqueued_at: string;
    started_at: string | null;
    finished_at: string | null;
}

export interface ScanSummary {
    total: number;
    pending: number;
    processing: number;
    done: number;
    duplicate: number;
    error: number;
}

export interface SemanticSearchResult {
    video_id: number;
    similarity: number;
    title: string;
    summary: string;
    date: string | null;
    duration_sec: number | null;
    thumbnail_url: string | null;
    video_url: string | null;
}

// --- RAG types ---

export interface RagCitation {
    chunk_id: number;
    video_id: number;
    video_title: string;
    recorded_at: string | null;
    start_ms: number;
    end_ms: number;
    snippet: string;
    score: number;
    thumbnail_url: string | null;
    video_url: string;
    collection: string;
    duration_sec: number | null;
}

export interface RagAnswer {
    answer: string;
    citations: RagCitation[];
    retrieved_chunk_count: number;
    model: string;
    embedding_model: string;
}

export interface RagStatus {
    total_videos: number;
    videos_with_chunks: number;
    videos_fully_embedded: number;
    total_chunks: number;
    embedded_chunks: number;
    pending_chunks: number;
    error_chunks: number;
    embedding_model: string | null;
}

export interface RagJobStatus {
    id: number;
    video_id: number;
    video_title: string | null;
    video_filename: string | null;
    status: string;
    error_message: string | null;
    chunked_at: string | null;
    embedded_at: string | null;
    created_at: string;
    updated_at: string | null;
}
