'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { SemanticMapPoint } from '@/lib/types';

interface SemanticMapDetailsPanelProps {
    selectedPoint: SemanticMapPoint | null;
}

function formatDate(value?: string | null): string {
    if (!value) {
        return 'Unknown date';
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return value;
    }

    return parsed.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

function formatDuration(seconds?: number | null): string {
    if (!seconds) {
        return 'Unknown';
    }

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function SemanticMapDetailsPanel({
    selectedPoint,
}: SemanticMapDetailsPanelProps) {
    const activePoint = selectedPoint;

    return (
        <aside className="h-full rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">

            {!activePoint && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    Select a video to see details.
                </p>
            )}

            {activePoint && (
                <div className="space-y-4">
                    {activePoint.thumbnailUrl && (
                        <div className="relative overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
                            <Image
                                src={activePoint.thumbnailUrl}
                                alt={`Thumbnail for ${activePoint.title}`}
                                width={640}
                                height={360}
                                loading="eager"
                                unoptimized
                                className="h-auto w-full"
                            />

                            <Link
                                href={`/videos/${activePoint.id}`}
                                className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded bg-black/60 text-white transition-colors hover:bg-black/75"
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="Open video"
                            >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M13.5 3H20a1 1 0 011 1v6.5m-8 0L21 3m-7 4H8a2 2 0 00-2 2v7a2 2 0 002 2h7a2 2 0 002-2v-6"
                                    />
                                </svg>
                            </Link>

                            {activePoint.durationSec && (
                                <div className="absolute bottom-2 right-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
                                    {formatDuration(activePoint.durationSec)}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="space-y-1">
                        <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                            {activePoint.title}
                        </h3>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            {formatDate(activePoint.date)}
                        </p>
                    </div>

                    <div className="space-y-1">
                        <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                            Summary
                        </p>
                        <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                            {activePoint.summary || 'No summary available.'}
                        </p>
                    </div>

                    <dl className="space-y-3 text-sm">
                        <div>
                            <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                Cluster
                            </dt>
                            <dd className="text-zinc-800 dark:text-zinc-200">
                                {activePoint.clusterLabel || 'Unlabeled'}
                            </dd>
                        </div>

                        <div>
                            <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                Point ID
                            </dt>
                            <dd className="font-mono text-xs text-zinc-700 dark:text-zinc-300">
                                {activePoint.id}
                            </dd>
                        </div>
                    </dl>

                </div>
            )}
        </aside>
    );
}
