'use client';

import { useState } from 'react';
import { askMemories } from '@/lib/api';
import type { RagAnswer } from '@/lib/types';
import CitationCard from './CitationCard';

export default function AskPanel() {
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [answer, setAnswer] = useState<RagAnswer | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const q = query.trim();
        if (!q || loading) return;

        setLoading(true);
        setError(null);
        setAnswer(null);

        try {
            const result = await askMemories(q);
            setAnswer(result);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes('503')) {
                setError(
                    'The local AI model is unavailable. Make sure Ollama is running and the model is pulled.'
                );
            } else if (msg.includes('409')) {
                setError(
                    'Embedding model mismatch — re-index your memories first via the sidebar.'
                );
            } else {
                setError(msg);
            }
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="flex flex-col gap-6">
            {/* Input */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Ask something about your memories…"
                    className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:ring-zinc-400"
                    disabled={loading}
                />
                <button
                    type="submit"
                    disabled={loading || !query.trim()}
                    className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                    {loading ? (
                        <>
                            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                            </svg>
                            Thinking…
                        </>
                    ) : (
                        'Ask'
                    )}
                </button>
            </form>

            {/* Error */}
            {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
                    <p className="whitespace-pre-wrap text-sm text-red-700 dark:text-red-300">{error}</p>
                </div>
            )}

            {/* Answer */}
            {answer && (
                <div className="flex flex-col gap-5">
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900">
                        <p className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
                            {answer.answer}
                        </p>
                        {answer.retrieved_chunk_count > 0 && (
                            <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-500">
                                Searched {answer.retrieved_chunk_count} memory excerpt
                                {answer.retrieved_chunk_count !== 1 ? 's' : ''} · {answer.model}
                            </p>
                        )}
                    </div>

                    {answer.citations.length > 0 && (
                        <div>
                            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                                Sources
                            </h2>
                            <div className="flex flex-col gap-2">
                                {answer.citations.map((citation, i) => (
                                    <CitationCard
                                        key={citation.chunk_id}
                                        citation={citation}
                                        index={i + 1}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Empty state */}
            {!answer && !error && !loading && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <svg
                        className="mb-4 h-10 w-10 text-zinc-300 dark:text-zinc-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                        />
                    </svg>
                    <p className="text-sm text-zinc-400 dark:text-zinc-500">
                        Ask a question to search your memories
                    </p>
                    <p className="mt-1 text-xs text-zinc-300 dark:text-zinc-600">
                        Answers are grounded in your video transcripts
                    </p>
                </div>
            )}
        </div>
    );
}
