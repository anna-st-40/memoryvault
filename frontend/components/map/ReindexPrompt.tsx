'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { triggerReindex, getReindexJobs } from '@/lib/api';

async function waitForJob(jobId: number): Promise<void> {
    const MAX_POLLS = 150;
    for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const jobs = await getReindexJobs();
        const job = jobs.find((j) => j.id === jobId);
        if (!job) throw new Error('Reindex job not found');
        if (job.status === 'done') return;
        if (job.status === 'error') throw new Error(job.error_message ?? 'Re-index failed');
    }
    throw new Error('Re-index timed out');
}

export default function ReindexPrompt() {
    const router = useRouter();
    const [reindexing, setReindexing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleReindex() {
        setReindexing(true);
        setError(null);
        try {
            const job = await triggerReindex('incremental');
            await waitForJob(job.id);
            router.refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Re-index failed.');
            setReindexing(false);
        }
    }

    return (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
            <p className="font-semibold">Semantic index is incomplete.</p>
            <p className="mt-1 opacity-90">
                One or more videos haven&apos;t been indexed yet. Re-index to build the map.
            </p>
            {error && (
                <p className="mt-2 text-red-700 dark:text-red-400">{error}</p>
            )}
            <button
                onClick={handleReindex}
                disabled={reindexing}
                className="mt-3 inline-flex rounded-md border border-amber-400 px-3 py-2 font-medium hover:border-amber-500 disabled:opacity-50 dark:border-amber-600 dark:hover:border-amber-500"
            >
                {reindexing ? 'Re-indexing…' : 'Re-index'}
            </button>
        </div>
    );
}
