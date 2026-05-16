'use client';

import { useState } from 'react';
import Link from 'next/link';
import { semanticSearch } from '@/lib/api';
import type { SemanticSearchResult } from '@/lib/types';

function formatDate(value: string | null): string {
    if (!value) return 'Unknown date';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

function formatDuration(seconds: number | null): string {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function SearchPage() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SemanticSearchResult[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searched, setSearched] = useState(false);

    const handleSearch = async () => {
        const trimmed = query.trim();
        if (!trimmed) return;

        setLoading(true);
        setError(null);
        setSearched(true);

        try {
            const data = await semanticSearch(trimmed, 10);
            setResults(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Search failed. Please try again.');
            setResults(null);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSearch();
        }
    };

    return (
        <div className="flex flex-1 flex-col">
            <div className="sticky top-0 z-10 flex h-14 shrink-0 items-center border-b border-zinc-200 bg-white px-6 dark:border-zinc-800 dark:bg-zinc-950">
                <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Semantic Search</h1>
            </div>

            <div className="flex flex-col gap-6 p-6">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Describe a memory, topic, or moment..."
                        className="h-9 flex-1 rounded border border-zinc-200 bg-zinc-50 px-3 text-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:bg-white focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500 dark:focus:bg-zinc-800"
                    />
                    <button
                        onClick={handleSearch}
                        disabled={loading || !query.trim()}
                        className="flex items-center gap-1.5 rounded bg-zinc-900 px-4 py-1.5 text-sm text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                    >
                        {loading && (
                            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                        )}
                        {loading ? 'Searching...' : 'Search'}
                    </button>
                </div>

                {error && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-400">
                        {error}
                    </div>
                )}

                {loading && (
                    <div className="flex items-center justify-center py-16">
                        <svg className="h-6 w-6 animate-spin text-zinc-400" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                    </div>
                )}

                {!searched && !loading && (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <svg className="mb-4 h-10 w-10 text-zinc-300 dark:text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">
                            Type a query above to search your video archive semantically.
                        </p>
                    </div>
                )}

                {searched && !loading && !error && results !== null && results.length === 0 && (
                    <div className="flex items-center justify-center py-16">
                        <p className="text-sm text-zinc-400 dark:text-zinc-500">No matching videos found.</p>
                    </div>
                )}

                {!loading && results !== null && results.length > 0 && (
                    <div className="flex flex-col gap-3">
                        {results.map((result) => {
                            const thumbnailSrc = result.thumbnail_url ? `/api${result.thumbnail_url}` : null;
                            const excerpt = result.summary ? result.summary.slice(0, 200) : '';

                            return (
                                <Link
                                    key={result.video_id}
                                    href={`/videos/${result.video_id}`}
                                    className="flex gap-4 rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
                                >
                                    <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-800">
                                        {thumbnailSrc ? (
                                            <img
                                                src={thumbnailSrc}
                                                alt={result.title}
                                                className="absolute inset-0 h-full w-full object-cover"
                                            />
                                        ) : (
                                            <div className="flex h-full w-full items-center justify-center">
                                                <svg className="h-6 w-6 text-zinc-300 dark:text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            </div>
                                        )}
                                        {result.duration_sec && (
                                            <div className="absolute bottom-1 right-1 rounded bg-black/60 px-1 py-0.5 text-xs text-white">
                                                {formatDuration(result.duration_sec)}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                                        <div className="flex items-center gap-2">
                                            <h3 className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                                                {result.title}
                                            </h3>
                                            <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                                                {Math.max(0, Math.round(result.similarity * 100))}%
                                            </span>
                                        </div>
                                        <p className="text-xs text-zinc-400 dark:text-zinc-500">
                                            {formatDate(result.date)}
                                        </p>
                                        {excerpt && (
                                            <p className="line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
                                                {excerpt}
                                            </p>
                                        )}
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
