'use client';

import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';

interface VideoPlayerProps {
    videoPath: string;
    currentTime: number;
    onTimeUpdate: (time: number) => void;
}

export interface VideoPlayerRef {
    togglePlayPause: () => void;
}

const VideoPlayer = forwardRef<VideoPlayerRef, VideoPlayerProps>(function VideoPlayer(
    {
        videoPath,
        currentTime,
        onTimeUpdate,
    },
    ref
) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const lastSeekRef = useRef<number>(0);
    const isSeekingRef = useRef<boolean>(false);
    const lastExternalTimeRef = useRef<number>(0);

    // Handle external time changes (from transcript segment clicks)
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        // Only seek if the difference is significant (more than 0.5 seconds)
        // and if the currentTime actually changed from external source
        const timeDiff = Math.abs(video.currentTime - currentTime);
        const isExternalChange = currentTime !== lastExternalTimeRef.current;

        if (timeDiff > 0.5 && isExternalChange && Date.now() - lastSeekRef.current > 500) {
            isSeekingRef.current = true;
            video.currentTime = currentTime;
            lastSeekRef.current = Date.now();
            lastExternalTimeRef.current = currentTime;
        }
    }, [currentTime]);

    const handleTimeUpdate = () => {
        const video = videoRef.current;
        if (video && !isSeekingRef.current) {
            onTimeUpdate(video.currentTime);
        }
    };

    const handleSeeked = () => {
        isSeekingRef.current = false;
        const video = videoRef.current;
        if (video) {
            onTimeUpdate(video.currentTime);
        }
    };

    useImperativeHandle(ref, () => ({
        togglePlayPause: () => {
            const video = videoRef.current;
            if (video) {
                if (video.paused) {
                    video.play();
                } else {
                    video.pause();
                }
            }
        },
    }));

    return (
        <div className="relative overflow-hidden rounded-lg border border-zinc-200 bg-black shadow-lg dark:border-zinc-800">
            <video
                ref={videoRef}
                controls
                className="w-full"
                onTimeUpdate={handleTimeUpdate}
                onSeeked={handleSeeked}
                onError={(e) => {
                    console.error('Video playback error:', e);
                }}
            >
                <source src={videoPath} type="video/mp4" />
                <source src={videoPath} type="video/quicktime" />
                <source src={videoPath} type="video/x-msvideo" />
                <source src={videoPath} type="video/x-matroska" />
                Your browser does not support the video tag.
            </video>
        </div>
    );
});

export default VideoPlayer;
