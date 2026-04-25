export default function MapLoading() {
    return (
        <main className="mx-auto w-full max-w-screen-2xl px-4 py-8 sm:px-6 lg:px-8">
            <header className="mb-6">
                <div className="h-8 w-56 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                <div className="mt-3 h-4 w-full max-w-2xl animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
            </header>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
                <div className="min-h-135 animate-pulse rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900" />
                <aside className="min-h-135 animate-pulse rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900" />
            </div>
        </main>
    );
}
