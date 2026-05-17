import type { SemanticMapPoint } from './types';

const API_BASE_URL = process.env.API_URL || 'http://backend:8000';
const DEFAULT_SEMANTIC_MAP_ENDPOINT = process.env.SEMANTIC_MAP_ENDPOINT || '/semantic-map';

export type SemanticMapFetch = (
    input: string,
    init?: RequestInit
) => Promise<Response>;

interface GetSemanticMapPointsOptions {
    fetcher?: SemanticMapFetch;
    endpoint?: string;
    signal?: AbortSignal;
}

type RawSemanticMapPoint = {
    id?: string | number | null;
    x?: number | string | null;
    y?: number | string | null;
    title?: string | null;
    summary?: string | null;
    date?: string | null;
    durationSec?: number | string | null;
    duration_sec?: number | string | null;
    thumbnailUrl?: string | null;
    thumbnail_url?: string | null;
    videoUrl?: string | null;
    video_url?: string | null;
    clusterLabel?: string | null;
    cluster_label?: string | null;
};

function toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return null;
}

function toNonEmptyString(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : null;
}

function resolveApiUrl(pathOrUrl: string | null): string | null {
    if (!pathOrUrl) {
        return null;
    }

    if (/^https?:\/\//i.test(pathOrUrl)) {
        return pathOrUrl;
    }

    if (pathOrUrl.startsWith('/')) {
        return `/api${pathOrUrl}`;
    }

    return `/api/${pathOrUrl}`;
}

function adaptPoint(raw: RawSemanticMapPoint): SemanticMapPoint | null {
    const x = toNumber(raw.x);
    const y = toNumber(raw.y);
    const id = toNonEmptyString(raw.id == null ? null : String(raw.id));

    if (x == null || y == null || !id) {
        return null;
    }

    return {
        id,
        x,
        y,
        title: toNonEmptyString(raw.title) || `Video ${id}`,
        summary: toNonEmptyString(raw.summary) || '',
        date: toNonEmptyString(raw.date),
        durationSec: toNumber(raw.durationSec) ?? toNumber(raw.duration_sec),
        thumbnailUrl: resolveApiUrl(toNonEmptyString(raw.thumbnailUrl) || toNonEmptyString(raw.thumbnail_url)),
        videoUrl: resolveApiUrl(toNonEmptyString(raw.videoUrl) || toNonEmptyString(raw.video_url)),
        clusterLabel: toNonEmptyString(raw.clusterLabel) || toNonEmptyString(raw.cluster_label),
    };
}

export async function getSemanticMapPoints(
    options: GetSemanticMapPointsOptions = {}
): Promise<SemanticMapPoint[]> {
    const {
        fetcher = fetch,
        endpoint = DEFAULT_SEMANTIC_MAP_ENDPOINT,
        signal,
    } = options;

    const response = await fetcher(`${API_BASE_URL}${endpoint}`, {
        method: 'GET',
        headers: {
            Accept: 'application/json',
        },
        signal,
        cache: 'no-store',
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Semantic map request failed (${response.status}): ${errorText}`);
    }

    const payload = (await response.json()) as unknown;

    if (!Array.isArray(payload)) {
        throw new Error('Semantic map response must be an array of points.');
    }

    return payload
        .map((point) => adaptPoint(point as RawSemanticMapPoint))
        .filter((point): point is SemanticMapPoint => point !== null);
}
