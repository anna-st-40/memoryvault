'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

interface HeaderProps {
    onSearch?: (query: string) => void;
}

export default function Header({ onSearch }: HeaderProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const pathname = usePathname();
    const isMapPage = pathname.startsWith('/map');

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const query = e.target.value;
        setSearchQuery(query);
        onSearch?.(query);
    };

    return (
        <header className="sticky top-0 z-50 w-full border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <div className="container mx-auto flex h-14 max-w-screen-2xl items-center justify-between px-4 sm:px-6 lg:px-8">
                {/* Logotype */}
                <div className="flex items-center gap-3">
                    <h1 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                        MemoryVault
                    </h1>
                </div>

                {/* Search bar */}
                <div className="flex flex-1 items-center justify-center px-4 sm:px-8">
                    <div className="w-full max-w-xl">
                        <div className="relative">
                            <svg
                                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                                />
                            </svg>
                            <input
                                type="text"
                                placeholder="Search transcripts..."
                                value={searchQuery}
                                onChange={handleSearchChange}
                                className="h-9 w-full rounded border border-zinc-200 bg-zinc-50 pl-9 pr-4 text-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:bg-white focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500 dark:focus:bg-zinc-800"
                            />
                        </div>
                    </div>
                </div>

                {/* View toggle */}
                <div className="flex items-center gap-2">
                    <div className="flex rounded border border-zinc-200 p-0.5 dark:border-zinc-800">
                        {isMapPage ? (
                            <Link
                                href="/"
                                className="flex h-7 items-center gap-1.5 rounded px-3 text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
                                aria-label="Grid view"
                            >
                                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                                    />
                                </svg>
                                <span className="hidden sm:inline">Grid</span>
                            </Link>
                        ) : (
                            <span
                                className="flex h-7 items-center gap-1.5 rounded bg-zinc-900 px-3 text-xs font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
                                aria-label="Grid view"
                            >
                                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                                    />
                                </svg>
                                <span className="hidden sm:inline">Grid</span>
                            </span>
                        )}

                        {isMapPage ? (
                            <span
                                className="flex h-7 items-center gap-1.5 rounded bg-zinc-900 px-3 text-xs font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
                                aria-label="Map view"
                            >
                                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.553-.832L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m-6 3l6-3"
                                    />
                                </svg>
                                <span className="hidden sm:inline">Map</span>
                            </span>
                        ) : (
                            <Link
                                href="/map"
                                className="flex h-7 items-center gap-1.5 rounded px-3 text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
                                aria-label="Map view"
                            >
                                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.553-.832L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m-6 3l6-3"
                                    />
                                </svg>
                                <span className="hidden sm:inline">Map</span>
                            </Link>
                        )}
                    </div>
                </div>
            </div>
        </header>
    );
}
