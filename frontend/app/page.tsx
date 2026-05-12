'use client';

import { useEffect, useState, useMemo } from 'react';
import VideoCard from '@/components/VideoCard';
import { getVideos, triggerScan } from '@/lib/api';
import type { Video } from '@/lib/types';

export default function Home() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [backendDown, setBackendDown] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  useEffect(() => {
    async function fetchVideos() {
      try {
        setLoading(true);
        const data = await getVideos();
        setVideos(data);
        setError(null);
        setBackendDown(false);
      } catch (err) {
        console.error('Failed to fetch videos:', err);
        if (err instanceof TypeError) {
          setBackendDown(true);
          setError(null);
        } else {
          setBackendDown(false);
          setError('Failed to load videos.');
        }
      } finally {
        setLoading(false);
      }
    }

    fetchVideos();
  }, []);

  async function handleScan() {
    try {
      setScanning(true);
      setScanMessage(null);
      const result = await triggerScan();
      setScanMessage(
        result.enqueued > 0
          ? `Found ${result.enqueued} video${result.enqueued === 1 ? '' : 's'} to process. Refresh in a moment.`
          : 'No new videos found in the volume.'
      );
    } catch (err) {
      console.error('Scan failed:', err);
      setScanMessage('Scan failed. Please check the backend logs.');
    } finally {
      setScanning(false);
    }
  }

  const filteredVideos = useMemo(() => {
    if (!searchQuery.trim()) return videos;

    const query = searchQuery.toLowerCase();
    return videos.filter((video) => {
      const searchableText = [
        video.filename,
        video.transcript_text,
        video.recorded_at,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [videos, searchQuery]);

  return (
    <div className="flex flex-col">
      {/* Search bar */}
      <div className="sticky top-0 z-10 bg-white dark:bg-zinc-950">
        <div className="flex h-14 items-center px-4 pt-2 sm:px-6 lg:px-8">
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
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 w-full rounded border border-zinc-200 bg-zinc-50 pl-9 pr-4 text-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:bg-white focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500 dark:focus:bg-zinc-800"
              />
            </div>
          </div>
        </div>
      </div>

      <main className="flex-1">
        <div className="px-4 py-4 sm:px-6 lg:px-8">
          {/* Loading state */}
          {loading && (
            <div className="flex min-h-64 items-center justify-center">
              <p className="text-sm text-zinc-400">Loading...</p>
            </div>
          )}

          {/* Backend down error */}
          {backendDown && !loading && (
            <div className="flex min-h-64 items-center justify-center">
              <div className="max-w-md text-center">
                <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
                  Failed to load videos. Please make sure the backend is running.
                </p>
                <button
                  onClick={() => window.location.reload()}
                  className="rounded border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {/* API error state */}
          {error && !loading && (
            <div className="flex min-h-64 items-center justify-center">
              <div className="max-w-md text-center">
                <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">{error}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="rounded border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && !backendDown && filteredVideos.length === 0 && (
            <div className="flex min-h-64 items-center justify-center">
              <div className="max-w-md text-center">
                {searchQuery ? (
                  <p className="text-sm text-zinc-400 dark:text-zinc-500">
                    No videos match &ldquo;{searchQuery}&rdquo;.
                  </p>
                ) : (
                  <>
                    <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
                      No videos in the database yet.
                    </p>
                    <button
                      onClick={handleScan}
                      disabled={scanning}
                      className="rounded border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:border-zinc-400 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500"
                    >
                      {scanning ? 'Scanning…' : 'Fetch videos from volume'}
                    </button>
                    {scanMessage && (
                      <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-500">{scanMessage}</p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Video grid */}
          {!loading && !error && filteredVideos.length > 0 && (
            <>
              {/* Results count */}
              <div className="mb-6">
                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                  {filteredVideos.length} {filteredVideos.length === 1 ? 'video' : 'videos'}
                  {searchQuery && ` matching "${searchQuery}"`}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredVideos.map((video) => (
                  <VideoCard key={video.id} video={video} searchQuery={searchQuery} />
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
