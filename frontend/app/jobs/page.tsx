'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { getScanJobs, getScanStatus, retryScanErrors, deleteScanJob } from '@/lib/api';
import type { ScanJob, ScanSummary } from '@/lib/types';

type Filter = 'all' | 'active' | 'error';

function statusBadge(status: string) {
    const base = 'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium';
    switch (status) {
        case 'pending':
            return <span className={`${base} bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400`}>pending</span>;
        case 'processing':
            return <span className={`${base} bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300`}>processing</span>;
        case 'done':
            return <span className={`${base} bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300`}>done</span>;
        case 'duplicate':
            return <span className={`${base} bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300`}>duplicate</span>;
        case 'error':
            return <span className={`${base} bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300`}>error</span>;
        default:
            return <span className={`${base} bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400`}>{status}</span>;
    }
}

function formatTime(iso: string | null): string {
    if (!iso) return '—';
    // Treat naive datetime strings as UTC so toLocaleString converts to local time
    const utc = /[Z+]|-\d{2}:\d{2}$/.test(iso) ? iso : iso + 'Z';
    return new Date(utc).toLocaleString(undefined, {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function formatDuration(startedAt: string | null, finishedAt: string | null): string {
    if (!startedAt || !finishedAt) return '—';
    const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
    if (ms < 1000) return `${ms}ms`;
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function basename(path: string): string {
    return path.split('/').pop() ?? path;
}

export default function JobsPage() {
    const [jobs, setJobs] = useState<ScanJob[]>([]);
    const [summary, setSummary] = useState<ScanSummary | null>(null);
    const [filter, setFilter] = useState<Filter>('active');
    const [loading, setLoading] = useState(true);
    const [retryState, setRetryState] = useState<'idle' | 'loading' | 'done'>('idle');
    const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const statusParam = filter === 'active' ? 'processing' : filter === 'error' ? 'error' : undefined;
            const [jobsData, summaryData] = await Promise.all([
                getScanJobs({ status: statusParam, limit: 50 }),
                getScanStatus(),
            ]);
            setJobs(jobsData);
            setSummary(summaryData);
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => { load(); }, [load]);

    const handleDelete = async (jobId: number) => {
        setDeletingIds(prev => new Set(prev).add(jobId));
        try {
            await deleteScanJob(jobId);
            setJobs(prev => prev.filter(j => j.id !== jobId));
            setSummary(prev => prev ? { ...prev, total: prev.total - 1 } : prev);
        } finally {
            setDeletingIds(prev => { const s = new Set(prev); s.delete(jobId); return s; });
        }
    };

    const handleRetry = async () => {
        setRetryState('loading');
        try {
            await retryScanErrors();
            setRetryState('done');
            await load();
        } finally {
            setTimeout(() => setRetryState('idle'), 2000);
        }
    };

    return (
        <div className="flex flex-1 flex-col">
            {/* Header */}
            <div className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 px-6 dark:border-zinc-800 dark:bg-zinc-950">
                <h1 className="text-sm font-semibold text-zinc-900">Background Jobs</h1>
                <div className="flex items-center gap-2">
                    {summary && summary.error > 0 && (
                        <button
                            onClick={handleRetry}
                            disabled={retryState === 'loading'}
                            className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/20"
                        >
                            {retryState === 'loading' ? (
                                <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                            ) : (
                                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                            )}
                            {retryState === 'done' ? 'Requeued' : 'Retry errors'}
                        </button>
                    )}
                    <button
                        onClick={load}
                        disabled={loading}
                        className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
                    >
                        <svg className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Refresh
                    </button>
                </div>
            </div>

            <div className="flex flex-col gap-4 p-6">
                {/* Summary cards */}
                {summary && (
                    <div className="grid grid-cols-5 gap-3">
                        {[
                            { label: 'Pending', value: summary.pending, color: 'text-zinc-600 dark:text-zinc-400' },
                            { label: 'Processing', value: summary.processing, color: 'text-blue-600 dark:text-blue-400' },
                            { label: 'Done', value: summary.done, color: 'text-green-600 dark:text-green-400' },
                            { label: 'Duplicates', value: summary.duplicate, color: 'text-amber-600 dark:text-amber-400' },
                            { label: 'Errors', value: summary.error, color: 'text-red-600 dark:text-red-400' },
                        ].map(({ label, value, color }) => (
                            <div key={label} className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                                <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
                                <p className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</p>
                            </div>
                        ))}
                    </div>
                )}

                {/* Filter strip */}
                <div className="flex gap-1">
                    {(['active', 'all', 'error'] as Filter[]).map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`rounded px-3 py-1.5 text-xs font-medium transition-colors capitalize ${
                                filter === f
                                    ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50'
                                    : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200'
                            }`}
                        >
                            {f}
                        </button>
                    ))}
                </div>

                {/* Job table */}
                {loading ? (
                    <div className="flex flex-1 items-center justify-center">
                        <svg className="h-5 w-5 animate-spin text-zinc-400" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                    </div>
                ) : jobs.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center">
                        <p className="text-sm text-zinc-400 dark:text-zinc-500">
                            {filter === 'all'
                                ? 'No scan jobs yet — trigger a scan from Settings.'
                                : `No ${filter} jobs.`}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                                    <th className="px-4 py-2.5 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400">File</th>
                                    <th className="px-4 py-2.5 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400">Status</th>
                                    <th className="px-4 py-2.5 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400">Enqueued</th>
                                    <th className="px-4 py-2.5 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400">Duration</th>
                                    <th className="px-4 py-2.5" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                {jobs.map((job) => (
                                    <Fragment key={job.id}>
                                        <tr className="bg-white dark:bg-zinc-950">
                                            <td className="max-w-xs px-4 py-3">
                                                <span className="block truncate font-medium text-zinc-900 dark:text-zinc-50" title={job.source_path}>
                                                    {basename(job.source_path)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">{statusBadge(job.status)}</td>
                                            <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">{formatTime(job.enqueued_at)}</td>
                                            <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">{formatDuration(job.started_at, job.finished_at)}</td>
                                            <td className="px-4 py-3">
                                                <button
                                                    onClick={() => handleDelete(job.id)}
                                                    disabled={job.status === 'processing' || deletingIds.has(job.id)}
                                                    className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-red-500 disabled:opacity-30 dark:hover:bg-zinc-800 dark:hover:text-red-400"
                                                    title="Delete job"
                                                >
                                                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            </td>
                                        </tr>
                                        {job.status === 'error' && job.error_message && (
                                            <tr className="bg-red-50 dark:bg-red-950/20">
                                                <td colSpan={5} className="px-4 py-2">
                                                    <p className="text-xs text-red-600 dark:text-red-400">{job.error_message}</p>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
