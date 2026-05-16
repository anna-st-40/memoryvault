'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { triggerScan, triggerReindex } from '@/lib/api';

type ScanState = 'idle' | 'loading' | 'success' | 'error';

function GridIcon() {
    return (
        <svg className="h-4.5 w-4.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
    );
}

function MapIcon() {
    return (
        <svg className="h-4.5 w-4.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.553-.832L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m-6 3l6-3" />
        </svg>
    );
}

function JobsIcon() {
    return (
        <svg className="h-4.5 w-4.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
    );
}

function SearchIcon() {
    return (
        <svg className="h-4.5 w-4.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
    );
}

function GearIcon() {
    return (
        <svg className="h-4.5 w-4.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
    );
}

interface NavItemProps {
    href: string;
    active: boolean;
    collapsed: boolean;
    label: string;
    icon: React.ReactNode;
}

function NavItem({ href, active, collapsed, label, icon }: NavItemProps) {
    return (
        <Link
            href={href}
            title={collapsed ? label : undefined}
            className={`flex items-center gap-2.5 rounded px-2 py-2 text-sm transition-colors ${active
                ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50'
                : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50'
                } ${collapsed ? 'justify-center' : ''}`}
        >
            {icon}
            {!collapsed && <span className="truncate">{label}</span>}
        </Link>
    );
}

export default function Sidebar() {
    const [collapsed, setCollapsed] = useState(true);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [panelPos, setPanelPos] = useState({ bottom: 0, left: 0 });
    const [scanState, setScanState] = useState<ScanState>('idle');
    const [scanMessage, setScanMessage] = useState('');
    const [reindexState, setReindexState] = useState<ScanState>('idle');
    const [reindexMessage, setReindexMessage] = useState('');
    const pathname = usePathname();
    const settingsButtonRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!settingsOpen) return;
        function handleClick(e: MouseEvent) {
            if (
                panelRef.current &&
                !panelRef.current.contains(e.target as Node) &&
                settingsButtonRef.current &&
                !settingsButtonRef.current.contains(e.target as Node)
            ) {
                setSettingsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [settingsOpen]);

    const openSettings = () => {
        if (settingsOpen) {
            setSettingsOpen(false);
            return;
        }
        if (settingsButtonRef.current) {
            const rect = settingsButtonRef.current.getBoundingClientRect();
            setPanelPos({
                bottom: window.innerHeight - rect.bottom,
                left: rect.right + 8,
            });
        }
        setSettingsOpen(true);
    };

    const handleReindex = async () => {
        setReindexState('loading');
        setReindexMessage('');
        try {
            await triggerReindex('full');
            setReindexState('success');
            setReindexMessage('Reindex started in the background.');
        } catch {
            setReindexState('error');
            setReindexMessage('Reindex failed. Check the backend logs.');
        } finally {
            setTimeout(() => {
                setReindexState('idle');
                setReindexMessage('');
                setSettingsOpen(false);
            }, 3000);
        }
    };

    const handleRescan = async () => {
        setScanState('loading');
        setScanMessage('');
        try {
            const result = await triggerScan();
            setScanState('success');
            setScanMessage(
                result.enqueued === 0
                    ? 'No new videos found.'
                    : `${result.enqueued} video${result.enqueued === 1 ? '' : 's'} queued for processing.`
            );
        } catch {
            setScanState('error');
            setScanMessage('Scan failed. Check the backend logs.');
        } finally {
            setTimeout(() => {
                setScanState('idle');
                setScanMessage('');
                setSettingsOpen(false);
            }, 3000);
        }
    };

    const settingsPanel = settingsOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
                ref={panelRef}
                style={{ bottom: panelPos.bottom, left: panelPos.left }}
                className="fixed z-50 w-56 rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-950"
            >
                <div className="p-1">
                    <button
                        onClick={handleRescan}
                        disabled={scanState === 'loading'}
                        className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-900"
                    >
                        {scanState === 'loading' ? (
                            <svg className="h-4 w-4 shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                        ) : (
                            <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        )}
                        {scanState === 'loading' ? 'Checking...' : 'Check for new videos'}
                    </button>

                    {scanMessage && (
                        <p className={`px-3 pb-2 text-xs ${scanState === 'error' ? 'text-red-500' : 'text-zinc-500 dark:text-zinc-400'}`}>
                            {scanMessage}
                        </p>
                    )}

                    <button
                        onClick={handleReindex}
                        disabled={reindexState === 'loading'}
                        className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-900"
                    >
                        {reindexState === 'loading' ? (
                            <svg className="h-4 w-4 shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                        ) : (
                            <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
                            </svg>
                        )}
                        {reindexState === 'loading' ? 'Indexing...' : 'Re-index semantic map'}
                    </button>

                    {reindexMessage && (
                        <p className={`px-3 pb-2 text-xs ${reindexState === 'error' ? 'text-red-500' : 'text-zinc-500 dark:text-zinc-400'}`}>
                            {reindexMessage}
                        </p>
                    )}
                </div>
            </div>,
            document.body
        )
        : null;

    return (
        <>
            <aside
                className={`relative flex h-screen shrink-0 flex-col overflow-hidden border-r border-zinc-200 bg-white transition-[width] duration-200 ease-in-out dark:border-zinc-800 dark:bg-zinc-950 ${collapsed ? 'w-14' : 'w-48'
                    }`}
            >
                {/* Logo + toggle */}
                <div className={`flex h-14 shrink-0 items-center border-b border-zinc-200 dark:border-zinc-800 ${collapsed ? 'justify-center' : 'justify-between px-3'}`}>
                    {!collapsed && (
                        <span className="truncate text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                            MemoryVault
                        </span>
                    )}
                    <button
                        onClick={() => {
                            setCollapsed((c) => !c);
                            if (!collapsed) setSettingsOpen(false);
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded text-zinc-400 transition-colors hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-zinc-50"
                        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        <svg
                            className={`h-4 w-4 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                </div>

                {/* Nav */}
                <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
                    <NavItem href="/" active={pathname === '/'} collapsed={collapsed} label="Grid" icon={<GridIcon />} />
                    <NavItem href="/map" active={pathname.startsWith('/map')} collapsed={collapsed} label="Map" icon={<MapIcon />} />
                    <NavItem href="/search" active={pathname.startsWith('/search')} collapsed={collapsed} label="Search" icon={<SearchIcon />} />
                    <div className="flex-1" />
                    <NavItem href="/jobs" active={pathname.startsWith('/jobs')} collapsed={collapsed} label="Jobs" icon={<JobsIcon />} />
                </nav>

                {/* Settings trigger */}
                <div className="shrink-0 border-t border-zinc-200 p-2 dark:border-zinc-800">
                    <button
                        ref={settingsButtonRef}
                        onClick={openSettings}
                        title={collapsed ? 'Settings' : undefined}
                        className={`flex w-full items-center gap-2.5 rounded px-2 py-2 text-sm transition-colors ${settingsOpen
                            ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50'
                            : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50'
                            } ${collapsed ? 'justify-center' : ''}`}
                    >
                        <GearIcon />
                        {!collapsed && <span className="truncate">Settings</span>}
                    </button>
                </div>
            </aside>

            {settingsPanel}
        </>
    );
}
