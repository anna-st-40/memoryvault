import type { Metadata } from 'next';
import AskPanel from '@/components/AskPanel';

export const metadata: Metadata = {
    title: 'Ask Your Memories | MemoryVault',
    description: 'Ask questions about your personal video archive.',
};

export const dynamic = 'force-dynamic';

export default function AskPage() {
    return (
        <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 lg:px-8">
            <header className="mb-6">
                <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                    Ask Your Memories
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
                    Ask a question about anything in your video archive. Answers are grounded in your transcripts.
                </p>
            </header>
            <AskPanel />
        </main>
    );
}
