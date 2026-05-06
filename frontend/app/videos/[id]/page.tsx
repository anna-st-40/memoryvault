'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import VideoPlayer, { type VideoPlayerRef } from '@/components/VideoPlayer';
import TranscriptDisplay from '@/components/TranscriptDisplay';
import { getVideo, getVideoTranscriptSegments, updateVideo, retranscribeVideo } from '@/lib/api';
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
    const [retranscribeLang, setRetranscribeLang] = useState('en');
    const [retranscribeStatus, setRetranscribeStatus] = useState<string | null>(null);
    const [isRetranscribing, setIsRetranscribing] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
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

    const handleRetranscribe = async () => {
        setIsRetranscribing(true);
        setRetranscribeStatus(null);
        try {
            await retranscribeVideo(videoId, retranscribeLang);
            setRetranscribeStatus('Queued — check Jobs for progress');
            setTimeout(() => setRetranscribeStatus(null), 5000);
        } catch {
            setRetranscribeStatus('Failed to queue re-transcription');
            setTimeout(() => setRetranscribeStatus(null), 5000);
        } finally {
            setIsRetranscribing(false);
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
                <div className="mb-6 flex items-start justify-between gap-4">
                    <div className="min-w-0">
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

                    {/* Settings popover */}
                    <div className="relative shrink-0 pt-2">
                        <button
                            onClick={() => setIsSettingsOpen((o) => !o)}
                            className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                            title="Video settings"
                        >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </button>
                        {isSettingsOpen && (
                            <div className="absolute right-0 top-full z-10 mt-1 w-64 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                                <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">Re-transcribe</p>
                                <div className="flex gap-2">
                                    <select
                                        value={retranscribeLang}
                                        onChange={(e) => setRetranscribeLang(e.target.value)}
                                        disabled={isRetranscribing}
                                        className="flex-1 rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 disabled:opacity-50"
                                    >
                                        <option value="auto">auto-detect</option>
                                        <option value="en">English</option>
                                        <option value="fr">French</option>
                                        <option value="de">German</option>
                                        <option value="es">Spanish</option>
                                        <option value="pt">Portuguese</option>
                                        <option value="it">Italian</option>
                                        <option value="ru">Russian</option>
                                        <option value="ja">Japanese</option>
                                        <option value="zh">Chinese</option>
                                        <option value="ko">Korean</option>
                                    </select>
                                    <button
                                        onClick={handleRetranscribe}
                                        disabled={isRetranscribing}
                                        className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-200 disabled:opacity-50"
                                    >
                                        {isRetranscribing ? 'Queuing…' : 'Run'}
                                    </button>
                                </div>
                                {retranscribeStatus && (
                                    <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">{retranscribeStatus}</p>
                                )}
                            </div>
                        )}
                    </div>
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
