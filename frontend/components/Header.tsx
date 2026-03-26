'use client';

import { useState } from 'react';

interface HeaderProps {
    onSearch?: (query: string) => void;
    onViewChange?: (view: 'grid' | 'timeline') => void;
    currentView?: 'grid' | 'timeline';
}

export default function Header({ onSearch, onViewChange, currentView = 'grid' }: HeaderProps) {
    const [searchQuery, setSearchQuery] = useState('');

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
                        <button
                            onClick={() => onViewChange?.('grid')}
                            className={`flex h-7 items-center gap-1.5 rounded px-3 text-xs font-medium transition-colors ${currentView === 'grid'
                                ? 'bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900'
                                : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50'
                                }`}
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
                        </button>
                        <button
                            onClick={() => onViewChange?.('timeline')}
                            className={`flex h-7 items-center gap-1.5 rounded px-3 text-xs font-medium transition-colors ${currentView === 'timeline'
                                ? 'bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900'
                                : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50'
                                }`}
                            aria-label="Timeline view"
                        >
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            </svg>
                            <span className="hidden sm:inline">Timeline</span>
                        </button>
                    </div>
                </div>
            </div>
        </header>
    );
}
