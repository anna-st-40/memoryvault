import type { Metadata } from 'next';
import Header from '@/components/Header';
import SemanticMemoryMapClient from '@/components/map/SemanticMemoryMapClient';
import { getSemanticMapPoints } from '@/lib/semantic-map';

export const metadata: Metadata = {
    title: 'Semantic Memory Map | MemoryVault',
    description: 'Interactive semantic map of your personal archive videos.',
};

export const dynamic = 'force-dynamic';

export default async function SemanticMemoryMapPage() {
    const points = await getSemanticMapPoints();

    return (
        <div className="flex min-h-screen flex-col">
            <Header />

            <main className="mx-auto w-full max-w-screen-2xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
                <header className="mb-6">
                    <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                        Semantic Memory Map
                    </h1>
                    <p className="mt-2 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
                        Each dot is a video from your archive. Nearby points are contextually related.
                    </p>
                </header>

                <SemanticMemoryMapClient points={points} />
            </main>
        </div>
    );
}
