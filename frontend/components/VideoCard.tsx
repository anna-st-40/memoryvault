'use client';

import Link from 'next/link';
import type { Video } from '@/lib/types';

interface VideoCardProps {
    video: Video;
    searchQuery?: string;
}

function formatDuration(seconds: number | null): string {
    if (!seconds) return 'Unknown';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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

function getTranscriptExcerpt(transcript: string | null, query?: string): string {
    if (!transcript) return 'No transcript available';

    // If there's a search query, try to show context around the match
    if (query && query.length > 0) {
        const lowerTranscript = transcript.toLowerCase();
        const lowerQuery = query.toLowerCase();
        const index = lowerTranscript.indexOf(lowerQuery);

        if (index !== -1) {
            const start = Math.max(0, index - 50);
            const end = Math.min(transcript.length, index + query.length + 50);
            const excerpt = transcript.slice(start, end);
            return (start > 0 ? '...' : '') + excerpt + (end < transcript.length ? '...' : '');
        }
    }

    // Default: show first 120 characters
    return transcript.length > 120 ? transcript.slice(0, 120) + '...' : transcript;
}

function highlightQuery(text: string, query?: string): React.ReactNode {
    if (!query || query.length === 0) return text;

    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return parts.map((part, index) =>
        part.toLowerCase() === query.toLowerCase() ? (
            <mark key={index} className="bg-yellow-200 dark:bg-yellow-800">
                {part}
            </mark>
        ) : (
            part
        )
    );
}

export default function VideoCard({ video, searchQuery }: VideoCardProps) {
    const excerpt = getTranscriptExcerpt(video.transcript_text, searchQuery);
    const thumbnailUrl = video.id ? `/api/thumbnails/${video.id}.jpg` : null;

    return (
        <Link href={`/videos/${video.id}`}>
            <div className="group overflow-hidden rounded-lg border border-zinc-200 bg-white transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600">
                {/* Thumbnail */}
                <div className="relative aspect-video w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800">
                    {thumbnailUrl && video.thumbnail_path ? (
                        <img
                            src={thumbnailUrl}
                            alt={video.title ?? video.filename}
                            className="absolute inset-0 h-full w-full object-cover"
                        />
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <svg
                                className="h-10 w-10 text-zinc-300 dark:text-zinc-600"
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

                    {/* Duration badge */}
                    {video.duration_sec && (
                        <div className="absolute bottom-2 right-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
                            {formatDuration(video.duration_sec)}
                        </div>
                    )}
                </div>

                {/* Content */}
                <div className="p-4">
                    {/* Title */}
                    <h3 className="mb-1 line-clamp-1 text-sm font-medium text-zinc-900 dark:text-zinc-50">
                        {video.title ?? video.filename}
                    </h3>

                    {/* Date */}
                    <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">
                        {formatDate(video.recorded_at)}
                    </p>

                    {/* Transcript excerpt */}
                    <p className="line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
                        {highlightQuery(excerpt, searchQuery)}
                    </p>
                </div>
            </div>
        </Link>
    );
}
