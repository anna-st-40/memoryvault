'use client';

import { useEffect, useState, useMemo } from 'react';
import Header from '@/components/Header';
import VideoCard from '@/components/VideoCard';
import TimelineView from '@/components/TimelineView';
import { getVideos } from '@/lib/api';
import type { Video } from '@/lib/types';

export default function Home() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentView, setCurrentView] = useState<'grid' | 'timeline'>('grid');

  useEffect(() => {
    async function fetchVideos() {
      try {
        setLoading(true);
        const data = await getVideos({ limit: 100 });
        setVideos(data);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch videos:', err);
        setError('Failed to load videos. Please make sure the backend is running.');
      } finally {
        setLoading(false);
      }
    }

    fetchVideos();
  }, []);

  // Filter videos based on search query
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

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleViewChange = (view: 'grid' | 'timeline') => {
    setCurrentView(view);
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        onSearch={handleSearch}
        onViewChange={handleViewChange}
        currentView={currentView}
      />

      <main className="flex-1">
        <div className="container mx-auto max-w-screen-2xl px-4 py-8 sm:px-6 lg:px-8">
          {/* Loading state */}
          {loading && (
            <div className="flex min-h-100 items-center justify-center">
              <p className="text-sm text-zinc-400">Loading...</p>
            </div>
          )}

          {/* Error state */}
          {error && !loading && (
            <div className="flex min-h-100 items-center justify-center">
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
          {!loading && !error && filteredVideos.length === 0 && (
            <div className="flex min-h-100 items-center justify-center">
              <div className="max-w-md text-center">
                <p className="text-sm text-zinc-400 dark:text-zinc-500">
                  {searchQuery
                    ? `No videos match "${searchQuery}".`
                    : 'No video diaries yet.'}
                </p>
              </div>
            </div>
          )}

          {/* Video grid or timeline */}
          {!loading && !error && filteredVideos.length > 0 && (
            <>
              {/* Results count */}
              <div className="mb-6">
                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                  {filteredVideos.length} {filteredVideos.length === 1 ? 'video' : 'videos'}
                  {searchQuery && ` matching "${searchQuery}"`}
                </p>
              </div>

              {/* Grid view */}
              {currentView === 'grid' && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {filteredVideos.map((video) => (
                    <VideoCard key={video.id} video={video} searchQuery={searchQuery} />
                  ))}
                </div>
              )}

              {/* Timeline view */}
              {currentView === 'timeline' && (
                <TimelineView videos={filteredVideos} searchQuery={searchQuery} />
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
