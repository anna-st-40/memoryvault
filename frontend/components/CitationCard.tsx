'use client';

import Link from 'next/link';
import type { RagCitation } from '@/lib/types';

interface CitationCardProps {
    citation: RagCitation;
    index: number;
}

function formatDate(dateString: string | null): string {
    if (!dateString) return 'Unknown date';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    } catch {
        return dateString;
    }
}

function msToHms(ms: number): string {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    }
    return `${m}:${sec.toString().padStart(2, '0')}`;
}

function secToHms(sec: number): string {
    return msToHms(Math.round(sec) * 1000);
}

function truncateSnippet(text: string, max = 200): string {
    if (text.length <= max) return text;
    return text.slice(0, max).trimEnd() + '…';
}

export default function CitationCard({ citation, index }: CitationCardProps) {
    const thumbnailUrl = citation.thumbnail_url
        ? `/api${citation.thumbnail_url}`
        : null;
    const startTime = msToHms(citation.start_ms);
    const endTime = msToHms(citation.end_ms);
    const duration = citation.duration_sec != null ? secToHms(citation.duration_sec) : null;
    const matchPct = Math.round(citation.score * 100);

    return (
        <Link href={citation.video_url}>
            <div className="group flex gap-3 overflow-hidden rounded-lg border border-zinc-200 bg-white p-3 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600">
                {/* Thumbnail */}
                <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
                    {thumbnailUrl ? (
                        <img
                            src={thumbnailUrl}
                            alt={citation.video_title}
                            className="absolute inset-0 h-full w-full object-cover"
                        />
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <svg
                                className="h-6 w-6 text-zinc-300 dark:text-zinc-600"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={1.5}
                                    d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                                />
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={1.5}
                                    d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            </svg>
                        </div>
                    )}
                    {duration && (
                        <div className="absolute bottom-1 right-1 rounded bg-black/60 px-1 py-0.5 text-[10px] text-white">
                            {duration}
                        </div>
                    )}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex items-start justify-between gap-2">
                        <span className="line-clamp-1 text-sm font-medium text-zinc-900 group-hover:text-zinc-700 dark:text-zinc-50 dark:group-hover:text-zinc-200">
                            {index}. {citation.video_title}
                        </span>
                        <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                            {matchPct}% match
                        </span>
                    </div>

                    <p className="mb-1 text-xs text-zinc-400 dark:text-zinc-500">
                        {formatDate(citation.recorded_at)} · {startTime}–{endTime}
                    </p>

                    <p className="line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
                        {truncateSnippet(citation.snippet)}
                    </p>
                </div>
            </div>
        </Link>
    );
}
