'use client';

import type { Video } from '@/lib/types';
import VideoCard from './VideoCard';

interface TimelineViewProps {
    videos: Video[];
    searchQuery?: string;
}

interface GroupedVideos {
    [key: string]: Video[];
}

function groupVideosByDate(videos: Video[]): GroupedVideos {
    const grouped: GroupedVideos = {};

    videos.forEach((video) => {
        if (!video.recorded_at) {
            const key = 'Unknown Date';
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(video);
            return;
        }

        try {
            const date = new Date(video.recorded_at);
            const key = date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            });
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(video);
        } catch {
            const key = 'Unknown Date';
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(video);
        }
    });

    return grouped;
}

function sortGroupedVideos(grouped: GroupedVideos): [string, Video[]][] {
    return Object.entries(grouped).sort(([dateA], [dateB]) => {
        if (dateA === 'Unknown Date') return 1;
        if (dateB === 'Unknown Date') return -1;

        try {
            return new Date(dateB).getTime() - new Date(dateA).getTime();
        } catch {
            return 0;
        }
    });
}

export default function TimelineView({ videos, searchQuery }: TimelineViewProps) {
    const groupedVideos = groupVideosByDate(videos);
    const sortedGroups = sortGroupedVideos(groupedVideos);

    return (
        <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-0 top-0 hidden h-full w-px bg-zinc-200 md:left-12.5 md:block dark:bg-zinc-800" />

            {/* Timeline groups */}
            <div className="space-y-12">
                {sortedGroups.map(([date, groupVideos]) => (
                    <div key={date} className="relative">
                        {/* Date marker */}
                        <div className="mb-6 flex items-center gap-4">
                            {/* Timeline dot */}
                            <div className="hidden h-25 w-25 shrink-0 items-center justify-center md:flex">
                                <div className="h-3 w-3 rounded-full border-2 border-zinc-400 bg-white dark:border-zinc-500 dark:bg-zinc-950" />
                            </div>

                            {/* Date label */}
                            <div>
                                <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                                    {date}
                                </h2>
                                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                                    {groupVideos.length} {groupVideos.length === 1 ? 'video' : 'videos'}
                                </p>
                            </div>
                        </div>

                        {/* Videos grid for this date */}
                        <div className="grid gap-4 sm:grid-cols-2 md:ml-37.5 lg:grid-cols-3">
                            {groupVideos.map((video) => (
                                <VideoCard key={video.id} video={video} searchQuery={searchQuery} />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
