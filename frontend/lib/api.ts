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

export async function retryScanErrors(): Promise<{ message: string }> {
    return apiFetch<{ message: string }>('/scan/retry', { method: 'POST' });
}

// --- Semantic Map Endpoints ---

export interface ReindexResponse {
    mode: string;
    processed: number;
    skipped: number;
    failed: number;
    total_time_seconds: number;
}

export async function triggerReindex(mode: 'full' | 'incremental' = 'full'): Promise<ReindexResponse> {
    return apiFetch<ReindexResponse>('/semantic-map/reindex', {
        method: 'POST',
        body: JSON.stringify({ mode }),
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
