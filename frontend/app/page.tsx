'use client';

import { useEffect, useState, useMemo } from 'react';
import VideoCard from '@/components/VideoCard';
import { getVideos, triggerScan, concatenateVideos } from '@/lib/api';
import type { Video } from '@/lib/types';

function formatDate(dateString: string | null): string {
    if (!dateString) return 'Unknown date';
    try {
        const date = new Date(dateString);
        const d = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        const t = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        return `${d}, ${t}`;
    } catch {
        return dateString;
    }
}

function sharedPrefix(names: string[]): string {
    if (!names.length) return '';
    let prefix = names[0].replace(/\.[^.]+$/, '');
    for (const name of names.slice(1)) {
        const stem = name.replace(/\.[^.]+$/, '');
        while (prefix.length > 0 && stem.indexOf(prefix) !== 0)
            prefix = prefix.slice(0, -1);
    }
    return prefix.replace(/[-_\s]+$/, '') || names[0].replace(/\.[^.]+$/, '');
}

export default function Home() {
    const [videos, setVideos] = useState<Video[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [backendDown, setBackendDown] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [scanning, setScanning] = useState(false);
    const [scanMessage, setScanMessage] = useState<string | null>(null);

    const [editMode, setEditMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [showJoinModal, setShowJoinModal] = useState(false);
    const [joinFilename, setJoinFilename] = useState('');
    const [joinTitle, setJoinTitle] = useState('');
    const [isJoining, setIsJoining] = useState(false);
    const [joinError, setJoinError] = useState<string | null>(null);

    async function fetchVideos() {
        try {
            setLoading(true);
            const data = await getVideos();
            setVideos(data);
            setError(null);
            setBackendDown(false);
        } catch (err) {
            console.error('Failed to fetch videos:', err);
            if (err instanceof TypeError) {
                setBackendDown(true);
                setError(null);
            } else {
                setBackendDown(false);
                setError('Failed to load videos.');
            }
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        fetchVideos();
    }, []);

    async function handleScan() {
        try {
            setScanning(true);
            setScanMessage(null);
            const result = await triggerScan();
            setScanMessage(
                result.enqueued > 0
                    ? `Found ${result.enqueued} video${result.enqueued === 1 ? '' : 's'} to process. Refresh in a moment.`
                    : 'No new videos found in the volume.'
            );
        } catch (err) {
            console.error('Scan failed:', err);
            setScanMessage('Scan failed. Please check the backend logs.');
        } finally {
            setScanning(false);
        }
    }

    function exitEditMode() {
        setEditMode(false);
        setSelectedIds(new Set());
    }

    function toggleSelect(id: number) {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    const joinOrderedVideos = useMemo(() => {
        const selectionOrder = [...selectedIds];
        return [...videos]
            .filter(v => selectedIds.has(v.id))
            .sort((a, b) => {
                if (!a.recorded_at && !b.recorded_at)
                    return selectionOrder.indexOf(a.id) - selectionOrder.indexOf(b.id);
                if (!a.recorded_at) return 1;
                if (!b.recorded_at) return -1;
                const dateCmp = a.recorded_at.localeCompare(b.recorded_at);
                if (dateCmp !== 0) return dateCmp;
                return selectionOrder.indexOf(a.id) - selectionOrder.indexOf(b.id);
            });
    }, [videos, selectedIds]);

    function openJoinModal() {
        const prefix = sharedPrefix(joinOrderedVideos.map(v => v.filename));
        setJoinFilename(prefix ? prefix + '_joined.mp4' : 'joined.mp4');
        setJoinTitle('');
        setJoinError(null);
        setShowJoinModal(true);
    }

    async function handleJoin() {
        setIsJoining(true);
        setJoinError(null);
        try {
            await concatenateVideos(joinOrderedVideos.map(v => v.id), joinFilename, joinTitle || undefined);
            setShowJoinModal(false);
            exitEditMode();
            await fetchVideos();
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Join failed';
            setJoinError(msg);
        } finally {
            setIsJoining(false);
        }
    }

    const filteredVideos = useMemo(() => {
        if (!searchQuery.trim()) return videos;

        const query = searchQuery.toLowerCase();
        return videos.filter((video) => {
            const searchableText = [
                video.filename,
                video.transcript_text,
                video.recorded_at,
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();

            return searchableText.includes(query);
        });
    }, [videos, searchQuery]);

    return (
        <div className="flex flex-col">
            {/* Search bar + toolbar */}
            <div className="sticky top-0 z-10 bg-white dark:bg-zinc-950">
                <div className="flex h-14 items-center gap-3 px-4 pt-2 sm:px-6 lg:px-8">
                    <div className="w-full max-w-xl">
                        <div className="relative">
                            <svg
                                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                                />
                            </svg>
                            <input
                                type="text"
                                placeholder="Search transcripts..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="h-9 w-full rounded border border-zinc-200 bg-zinc-50 pl-9 pr-4 text-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:bg-white focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500 dark:focus:bg-zinc-800"
                            />
                        </div>
                    </div>

                    <div className="ml-auto flex shrink-0 items-center gap-2">
                        {editMode && selectedIds.size >= 2 && (
                            <button
                                onClick={openJoinModal}
                                className="rounded border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-700 hover:border-zinc-700 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                            >
                                Join {selectedIds.size} videos
                            </button>
                        )}
                        {editMode ? (
                            <button
                                onClick={exitEditMode}
                                className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500"
                            >
                                Done
                            </button>
                        ) : (
                            <button
                                onClick={() => setEditMode(true)}
                                className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500"
                            >
                                Edit
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <main className="flex-1">
                <div className="px-4 py-4 sm:px-6 lg:px-8">
                    {loading && (
                        <div className="flex min-h-64 items-center justify-center">
                            <p className="text-sm text-zinc-400">Loading...</p>
                        </div>
                    )}

                    {backendDown && !loading && (
                        <div className="flex min-h-64 items-center justify-center">
                            <div className="max-w-md text-center">
                                <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
                                    Failed to load videos. Please make sure the backend is running.
                                </p>
                                <button
                                    onClick={() => window.location.reload()}
                                    className="rounded border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500"
                                >
                                    Retry
                                </button>
                            </div>
                        </div>
                    )}

                    {error && !loading && (
                        <div className="flex min-h-64 items-center justify-center">
                            <div className="max-w-md text-center">
                                <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">{error}</p>
                                <button
                                    onClick={() => window.location.reload()}
                                    className="rounded border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500"
                                >
                                    Retry
                                </button>
                            </div>
                        </div>
                    )}

                    {!loading && !error && !backendDown && filteredVideos.length === 0 && (
                        <div className="flex min-h-64 items-center justify-center">
                            <div className="max-w-md text-center">
                                {searchQuery ? (
                                    <p className="text-sm text-zinc-400 dark:text-zinc-500">
                                        No videos match &ldquo;{searchQuery}&rdquo;.
                                    </p>
                                ) : (
                                    <>
                                        <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
                                            No videos in the database yet.
                                        </p>
                                        <button
                                            onClick={handleScan}
                                            disabled={scanning}
                                            className="rounded border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:border-zinc-400 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500"
                                        >
                                            {scanning ? 'Scanning…' : 'Fetch videos from volume'}
                                        </button>
                                        {scanMessage && (
                                            <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-500">{scanMessage}</p>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    {!loading && !error && filteredVideos.length > 0 && (
                        <>
                            <div className="mb-6">
                                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                                    {filteredVideos.length} {filteredVideos.length === 1 ? 'video' : 'videos'}
                                    {searchQuery && ` matching "${searchQuery}"`}
                                    {editMode && selectedIds.size > 0 && ` · ${selectedIds.size} selected`}
                                </p>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                {filteredVideos.map((video) => (
                                    <VideoCard
                                        key={video.id}
                                        video={video}
                                        searchQuery={searchQuery}
                                        editMode={editMode}
                                        selected={selectedIds.has(video.id)}
                                        onToggleSelect={() => toggleSelect(video.id)}
                                    />
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </main>

            {/* Join modal */}
            {showJoinModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
                        <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-700">
                            <h2 className="text-base font-medium text-zinc-900 dark:text-zinc-50">Join Videos</h2>
                        </div>

                        <div className="px-6 py-4">
                            <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
                                Videos will be joined in this order:
                            </p>
                            <ol className="mb-5 space-y-1.5">
                                {joinOrderedVideos.map((v, i) => (
                                    <li key={v.id} className="flex items-start gap-2 text-sm">
                                        <span className="shrink-0 text-zinc-400">{i + 1}.</span>
                                        <span className="min-w-0">
                                            <span className="block truncate text-zinc-800 dark:text-zinc-200">{v.title ?? v.filename}</span>
                                            <span className="text-xs text-zinc-400">{formatDate(v.recorded_at)}</span>
                                        </span>
                                    </li>
                                ))}
                            </ol>

                            <div className="space-y-3">
                                <label className="block">
                                    <span className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                                        New filename
                                    </span>
                                    <input
                                        type="text"
                                        value={joinFilename}
                                        onChange={(e) => setJoinFilename(e.target.value)}
                                        className="h-9 w-full rounded border border-zinc-200 bg-zinc-50 px-3 text-sm focus:border-zinc-400 focus:bg-white focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:focus:border-zinc-500 dark:focus:bg-zinc-700"
                                        disabled={isJoining}
                                    />
                                </label>
                                <label className="block">
                                    <span className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                                        Title <span className="font-normal text-zinc-400">(optional)</span>
                                    </span>
                                    <input
                                        type="text"
                                        value={joinTitle}
                                        onChange={(e) => setJoinTitle(e.target.value)}
                                        className="h-9 w-full rounded border border-zinc-200 bg-zinc-50 px-3 text-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:bg-white focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500 dark:focus:bg-zinc-700"
                                        disabled={isJoining}
                                    />
                                </label>
                            </div>

                            {joinError && (
                                <p className="mt-3 text-xs text-red-600 dark:text-red-400">{joinError}</p>
                            )}
                        </div>

                        <div className="flex justify-end gap-2 border-t border-zinc-200 px-6 py-4 dark:border-zinc-700">
                            <button
                                onClick={() => setShowJoinModal(false)}
                                disabled={isJoining}
                                className="rounded border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:border-zinc-400 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleJoin}
                                disabled={isJoining || !joinFilename.trim()}
                                className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                                {isJoining ? 'Joining…' : 'Join'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
