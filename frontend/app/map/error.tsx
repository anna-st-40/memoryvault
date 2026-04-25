'use client';

interface MapErrorProps {
    error: Error & { digest?: string };
    reset: () => void;
}

export default function MapError({ error, reset }: MapErrorProps) {
    return (
        <main className="mx-auto w-full max-w-screen-2xl px-4 py-8 sm:px-6 lg:px-8">
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
                <p className="font-semibold">Unable to load semantic map data.</p>
                <p className="mt-1 opacity-90">{error.message}</p>
                <button
                    onClick={reset}
                    className="mt-3 inline-flex rounded-md border border-amber-400 px-3 py-2 font-medium hover:border-amber-500 dark:border-amber-600 dark:hover:border-amber-500"
                >
                    Try again
                </button>
            </div>
        </main>
    );
}
