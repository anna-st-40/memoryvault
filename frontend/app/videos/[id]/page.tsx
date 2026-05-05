'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import VideoPlayer, { type VideoPlayerRef } from '@/components/VideoPlayer';
import TranscriptDisplay from '@/components/TranscriptDisplay';
import { getVideo, getVideoTranscriptSegments, updateVideo } from '@/lib/api';
import type { Video, TranscriptSegment } from '@/lib/types';

export default function VideoDetailPage() {
    const params = useParams();
    const videoId = Number(params.id);

    const [video, setVideo] = useState<Video | null>(null);
    const [segments, setSegments] = useState<TranscriptSegment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editedTitle, setEditedTitle] = useState('');
    const [isSavingTitle, setIsSavingTitle] = useState(false);
    const videoPlayerRef = useRef<VideoPlayerRef>(null);
    const titleInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        async function fetchVideoData() {
            try {
                setLoading(true);
                const [videoData, segmentsData] = await Promise.all([
                    getVideo(videoId),
                    getVideoTranscriptSegments(videoId),
                ]);
                setVideo(videoData);
                setSegments(segmentsData);
                setError(null);
            } catch (err) {
                console.error('Failed to fetch video data:', err);
                setError('Failed to load video. Please try again.');
            } finally {
                setLoading(false);
            }
        }

        if (videoId) {
            fetchVideoData();
        }
    }, [videoId]);

    // Handle global spacebar to control video playback
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Only handle spacebar if not in an input/textarea
            if (e.key === ' ' &&
                !(e.target instanceof HTMLInputElement) &&
                !(e.target instanceof HTMLTextAreaElement)) {
                e.preventDefault();
                e.stopPropagation();
                videoPlayerRef.current?.togglePlayPause();
            }
        };

        // Use capture phase to intercept before video element gets the event
        document.addEventListener('keydown', handleKeyDown, true);
        return () => {
            document.removeEventListener('keydown', handleKeyDown, true);
        };
    }, []);

    const handleSegmentClick = (startMs: number) => {
        // Add a small offset (100ms) to ensure we land inside the segment
        // rather than exactly at the boundary where floating point issues can occur
        setCurrentTime((startMs + 100) / 1000);
    };

    const startEditingTitle = () => {
        if (!video) return;
        setEditedTitle(video.title ?? video.filename);
        setIsEditingTitle(true);
    };

    const cancelEditingTitle = () => {
        setIsEditingTitle(false);
        setEditedTitle('');
    };

    const saveTitle = async () => {
        if (!video || !editedTitle.trim() || editedTitle === video.title) {
            cancelEditingTitle();
            return;
        }

        try {
            setIsSavingTitle(true);
            const updatedVideo = await updateVideo(videoId, { title: editedTitle.trim() });
            setVideo(updatedVideo);
            setIsEditingTitle(false);
            setEditedTitle('');
        } catch (err) {
            console.error('Failed to update video title:', err);
            alert('Failed to update title. Please try again.');
        } finally {
            setIsSavingTitle(false);
        }
    };

    // Save title on Enter, cancel on Escape
    const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveTitle();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelEditingTitle();
        }
    };

    // Focus input when entering edit mode for title
    useEffect(() => {
        if (isEditingTitle && titleInputRef.current) {
            titleInputRef.current.focus();
            titleInputRef.current.select();
        }
    }, [isEditingTitle]);

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-white dark:bg-zinc-950">
                <p className="text-sm text-zinc-400">Loading...</p>
            </div>
        );
    }

    if (error || !video) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-white dark:bg-zinc-950">
                <div className="max-w-md text-center">
                    <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">{error ?? 'Video not found.'}</p>
                    <Link
                        href="/"
                        className="inline-block rounded border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500"
                    >
                        Back to Home
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-white dark:bg-zinc-950">
            {/* Header/Navigation */}
            <div className="border-b border-zinc-200 dark:border-zinc-800">
                <div className="container mx-auto max-w-screen-2xl px-4 py-3 sm:px-6 lg:px-8">
                    <Link
                        href="/"
                        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
                    >
                        <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15 19l-7-7 7-7"
                            />
                        </svg>
                        All videos
                    </Link>
                </div>
            </div>

            {/* Main content */}
            <div className="container mx-auto max-w-screen-2xl px-4 py-8 sm:px-6 lg:px-8">
                <div className="mb-6">
                    {isEditingTitle ? (
                        <div className="mb-1 flex items-center gap-2">
                            <input
                                ref={titleInputRef}
                                type="text"
                                value={editedTitle}
                                onChange={(e) => setEditedTitle(e.target.value)}
                                onKeyDown={handleTitleKeyDown}
                                onBlur={saveTitle}
                                disabled={isSavingTitle}
                                className="flex-1 rounded border border-zinc-300 bg-white px-3 py-1.5 text-xl font-semibold text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-blue-400"
                            />
                            {isSavingTitle && (
                                <span className="text-sm text-zinc-400">Saving...</span>
                            )}
                        </div>
                    ) : (
                        <h1
                            onClick={startEditingTitle}
                            className="mb-1 cursor-pointer rounded px-3 py-1.5 text-xl font-semibold text-zinc-900 transition-colors hover:bg-zinc-100 dark:text-zinc-50 dark:hover:bg-zinc-900"
                            title="Click to edit title"
                        >
                            {video.title ?? video.filename}
                        </h1>
                    )}
                    {video.recorded_at && (
                        <p className="px-3 text-sm text-zinc-400 dark:text-zinc-500">
                            {new Date(video.recorded_at).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                            })}
                        </p>
                    )}
                </div>

                <div className="flex gap-8">
                    {/* Video player */}
                    <div className="flex-1 space-y-4">
                        <VideoPlayer
                            ref={videoPlayerRef}
                            videoPath={`/api/videos/${video.id}/stream`}
                            currentTime={currentTime}
                            onTimeUpdate={setCurrentTime}
                        />
                    </div>

                    {/* Transcript display */}
                    <div className="w-105 shrink-0 sticky top-4 self-start">
                        <TranscriptDisplay
                            segments={segments}
                            currentTime={currentTime}
                            onSegmentClick={handleSegmentClick}
                            onSegmentUpdate={(updatedSegment: TranscriptSegment) => {
                                setSegments(
                                    segments.map((s) =>
                                        s.id === updatedSegment.id ? updatedSegment : s
                                    )
                                );
                            }}
                            onSegmentDelete={(segmentId: number) => {
                                setSegments(segments.filter((s) => s.id !== segmentId));
                            }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
