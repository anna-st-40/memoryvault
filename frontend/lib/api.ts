/**
 * API client for MemoryVault backend
 * Typed fetch wrappers for all backend endpoints
 */

import type {
    Video,
    VideoCreate,
    VideoUpdate,
    TranscriptSegment,
    TranscriptSegmentCreate,
    TranscriptSegmentPatch,
    ScanJob,
    ScanSummary,
    SemanticSearchResult,
    RagAnswer,
    RagStatus,
    RagJobStatus,
} from './types';

const API_BASE_URL = '/api';

/**
 * Generic fetch wrapper with error handling
 */
async function apiFetch<T>(
    endpoint: string,
    options?: RequestInit
): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;

    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options?.headers,
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error (${response.status}): ${errorText}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`API fetch error for ${endpoint}:`, error);
        throw error;
    }
}

// --- Video Endpoints ---

export async function getVideos(params?: {
    skip?: number;
    limit?: number;
}): Promise<Video[]> {
    const queryParams = new URLSearchParams();
    if (params?.skip !== undefined) queryParams.set('skip', String(params.skip));
    if (params?.limit !== undefined) queryParams.set('limit', String(params.limit));

    const query = queryParams.toString();
    return apiFetch<Video[]>(`/videos/${query ? `?${query}` : ''}`);
}

export async function getVideo(videoId: number): Promise<Video> {
    return apiFetch<Video>(`/videos/${videoId}`);
}

export async function createVideo(video: VideoCreate): Promise<Video> {
    return apiFetch<Video>('/videos/', {
        method: 'POST',
        body: JSON.stringify(video),
    });
}

export async function updateVideo(
    videoId: number,
    video: VideoUpdate
): Promise<Video> {
    return apiFetch<Video>(`/videos/${videoId}`, {
        method: 'PATCH',
        body: JSON.stringify(video),
    });
}

export async function deleteVideo(videoId: number): Promise<{ message: string }> {
    return apiFetch<{ message: string }>(`/videos/${videoId}`, {
        method: 'DELETE',
    });
}

export async function retranscribeVideo(
    videoId: number
): Promise<{ message: string }> {
    return apiFetch<{ message: string }>(`/videos/${videoId}/retranscribe`, {
        method: 'POST',
    });
}

export async function concatenateVideos(
    videoIds: number[],
    outputFilename: string,
    title?: string,
): Promise<Video> {
    return apiFetch<Video>('/videos/concatenate', {
        method: 'POST',
        body: JSON.stringify({ video_ids: videoIds, output_filename: outputFilename, title: title || null }),
    });
}

export async function getVideoTranscriptSegments(
    videoId: number
): Promise<TranscriptSegment[]> {
    return apiFetch<TranscriptSegment[]>(`/videos/${videoId}/transcript-segments/`);
}

// --- Scan Endpoints ---

export async function triggerScan(): Promise<{ enqueued: number; message: string }> {
    return apiFetch<{ enqueued: number; message: string }>('/scan', { method: 'POST' });
}

export async function getScanStatus(): Promise<ScanSummary> {
    return apiFetch<ScanSummary>('/scan/status');
}

export async function getScanJobs(params?: { status?: string; limit?: number }): Promise<ScanJob[]> {
    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.set('status', params.status);
    if (params?.limit !== undefined) queryParams.set('limit', String(params.limit));
    const query = queryParams.toString();
    return apiFetch<ScanJob[]>(`/scan/jobs${query ? `?${query}` : ''}`);
}

export async function deleteScanJob(jobId: number): Promise<{ message: string }> {
    return apiFetch<{ message: string }>(`/scan/jobs/${jobId}`, { method: 'DELETE' });
}

export async function retryScanErrors(): Promise<{ message: string }> {
    return apiFetch<{ message: string }>('/scan/retry', { method: 'POST' });
}

// --- Semantic Map Endpoints ---

export interface ReindexJobStatus {
    id: number;
    mode: string;
    limit: number | null;
    status: string;
    error_message: string | null;
    result_json: string | null;
    enqueued_at: string;
    started_at: string | null;
    finished_at: string | null;
}

export async function triggerReindex(mode: 'full' | 'incremental' = 'full'): Promise<ReindexJobStatus> {
    return apiFetch<ReindexJobStatus>('/semantic-map/reindex', {
        method: 'POST',
        body: JSON.stringify({ mode }),
    });
}

export async function getReindexJobs(): Promise<ReindexJobStatus[]> {
    return apiFetch<ReindexJobStatus[]>('/semantic-map/reindex/jobs');
}

export async function semanticSearch(query: string, limit = 10): Promise<SemanticSearchResult[]> {
    return apiFetch<SemanticSearchResult[]>('/semantic-map/search', {
        method: 'POST',
        body: JSON.stringify({ query, limit }),
    });
}

// --- Transcript Segment Endpoints ---

export async function getTranscriptSegments(params?: {
    skip?: number;
    limit?: number;
}): Promise<TranscriptSegment[]> {
    const queryParams = new URLSearchParams();
    if (params?.skip !== undefined) queryParams.set('skip', String(params.skip));
    if (params?.limit !== undefined) queryParams.set('limit', String(params.limit));

    const query = queryParams.toString();
    return apiFetch<TranscriptSegment[]>(`/transcript-segments/${query ? `?${query}` : ''}`);
}

export async function getTranscriptSegment(
    segmentId: number
): Promise<TranscriptSegment> {
    return apiFetch<TranscriptSegment>(`/transcript-segments/${segmentId}`);
}

export async function createTranscriptSegment(
    segment: TranscriptSegmentCreate
): Promise<TranscriptSegment> {
    return apiFetch<TranscriptSegment>('/transcript-segments/', {
        method: 'POST',
        body: JSON.stringify(segment),
    });
}

export async function updateTranscriptSegment(
    segmentId: number,
    patch: TranscriptSegmentPatch
): Promise<TranscriptSegment> {
    return apiFetch<TranscriptSegment>(`/transcript-segments/${segmentId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
    });
}

export async function deleteTranscriptSegment(
    segmentId: number
): Promise<{ message: string }> {
    return apiFetch<{ message: string }>(`/transcript-segments/${segmentId}`, {
        method: 'DELETE',
    });
}

// --- RAG Endpoints ---

export async function askMemories(
    query: string,
    top_k: number = 5
): Promise<RagAnswer> {
    return apiFetch<RagAnswer>('/rag/ask', {
        method: 'POST',
        body: JSON.stringify({ query, top_k }),
    });
}

export async function getRagStatus(): Promise<RagStatus> {
    return apiFetch<RagStatus>('/rag/status');
}

export async function triggerRagIndex(
    videoId?: number
): Promise<{ enqueued: number; message: string }> {
    return apiFetch<{ enqueued: number; message: string }>('/rag/index', {
        method: 'POST',
        body: JSON.stringify(videoId !== undefined ? { video_id: videoId } : {}),
    });
}

export async function getRagJobs(params?: { status?: string; limit?: number }): Promise<RagJobStatus[]> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.limit != null) query.set('limit', String(params.limit));
    const qs = query.size ? '?' + query : '';
    return apiFetch<import('./types').RagJobStatus[]>(`/rag/jobs${qs}`);
}
