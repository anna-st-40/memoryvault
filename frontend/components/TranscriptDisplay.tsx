'use client';

import { useState, useRef, useEffect } from 'react';
import type { TranscriptSegment } from '@/lib/types';
import { updateTranscriptSegment, deleteTranscriptSegment } from '@/lib/api';

interface TranscriptDisplayProps {
    segments: TranscriptSegment[];
    currentTime: number;
    onSegmentClick: (startMs: number) => void;
    onSegmentUpdate: (segment: TranscriptSegment) => void;
    onSegmentDelete: (segmentId: number) => void;
}

interface TranscriptSegmentItemProps {
    segment: TranscriptSegment;
    isActive: boolean;
    onClick: () => void;
    onUpdate: (segment: TranscriptSegment) => void;
    onDelete: () => void;
}

function TranscriptSegmentItem({
    segment,
    isActive,
    onClick,
    onUpdate,
    onDelete,
}: TranscriptSegmentItemProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editedText, setEditedText] = useState(
        segment.corrected_text || segment.original_text
    );
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const itemRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isEditing && textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.select();
        }
    }, [isEditing]);

    // Auto-scroll to active segment
    useEffect(() => {
        if (isActive && itemRef.current) {
            itemRef.current.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
            });
        }
    }, [isActive]);

    const handleSave = async () => {
        if (editedText === (segment.corrected_text || segment.original_text)) {
            setIsEditing(false);
            return;
        }

        setIsSaving(true);
        try {
            const updatedSegment = await updateTranscriptSegment(segment.id, {
                corrected_text: editedText,
            });
            onUpdate(updatedSegment);
            setIsEditing(false);
        } catch (error) {
            console.error('Failed to update segment:', error);
            alert('Failed to save changes. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        setEditedText(segment.corrected_text || segment.original_text);
        setIsEditing(false);
    };

    const handleDelete = async () => {
        if (!confirm('Delete this segment? This cannot be undone.')) return;
        setIsDeleting(true);
        try {
            await deleteTranscriptSegment(segment.id);
            onDelete();
        } catch (error) {
            console.error('Failed to delete segment:', error);
            alert('Failed to delete segment. Please try again.');
            setIsDeleting(false);
        }
    };

    const displayText = segment.corrected_text || segment.original_text;
    const hasCorrection = segment.corrected_text !== null;

    const formatTime = (ms: number) => {
        const seconds = Math.floor(ms / 1000);
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handleClick = () => {
        onClick();
        // Remove focus from the clicked element to prevent spacebar from scrolling
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
    };

    return (
        <div
            ref={itemRef}
            className="group relative flex gap-3 py-1.5"
        >
            {/* Timestamp */}
            <button
                onClick={handleClick}
                onMouseDown={(e) => e.preventDefault()}
                className={`shrink-0 w-12 text-left text-sm ${isActive
                    ? 'font-medium text-zinc-900 dark:text-zinc-50'
                    : 'text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300'
                    }`}
            >
                {formatTime(segment.start_ms)}
            </button>

            {/* Text content */}
            {isEditing ? (
                <div className="flex-1 space-y-2">
                    <textarea
                        ref={textareaRef}
                        value={editedText}
                        onChange={(e) => setEditedText(e.target.value)}
                        className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:focus:border-zinc-500"
                        rows={3}
                    />
                    <div className="flex gap-2">
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="rounded border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                        >
                            {isSaving ? 'Saving...' : 'Save'}
                        </button>
                        <button
                            onClick={handleCancel}
                            disabled={isSaving}
                            className="rounded border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex items-start gap-2">
                    <p
                        className={`flex-1 cursor-pointer text-sm leading-relaxed ${isActive
                            ? 'font-medium text-zinc-900 dark:text-zinc-50'
                            : 'text-zinc-500 dark:text-zinc-400'
                            }`}
                        onClick={handleClick}
                        onMouseDown={(e) => e.preventDefault()}
                    >
                        {displayText}
                    </p>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {hasCorrection && (
                            <span className="text-[10px] text-green-600 dark:text-green-500">✓</span>
                        )}
                        <button
                            onClick={() => setIsEditing(true)}
                            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                            title="Edit transcript"
                        >
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                />
                            </svg>
                        </button>
                        <button
                            onClick={handleDelete}
                            disabled={isDeleting}
                            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-red-500 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-red-400"
                            title="Delete segment"
                        >
                            {isDeleting ? (
                                <svg className="h-3.5 w-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12a8 8 0 018-8v8H4z" />
                                </svg>
                            ) : (
                                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                    />
                                </svg>
                            )}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function TranscriptDisplay({
    segments,
    currentTime,
    onSegmentClick,
    onSegmentUpdate,
    onSegmentDelete,
}: TranscriptDisplayProps) {
    const currentTimeMs = currentTime * 1000;

    // Find the active segment based on current time
    const activeSegmentId = segments.find(
        (segment) =>
            currentTimeMs >= segment.start_ms && currentTimeMs <= segment.end_ms
    )?.id;

    if (segments.length === 0) {
        return (
            <div className="rounded border border-zinc-200 p-8 text-center dark:border-zinc-800">
                <p className="text-sm text-zinc-400 dark:text-zinc-500">
                    No transcript available.
                </p>
            </div>
        );
    }

    return (
        <div className="flex h-[calc(100vh-12rem)] flex-col rounded border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            {/* Header */}
            <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
                <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    Transcript
                </h2>
            </div>

            {/* Segments list */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
                <div className="space-y-0.5">
                    {segments.map((segment) => (
                        <TranscriptSegmentItem
                            key={segment.id}
                            segment={segment}
                            isActive={segment.id === activeSegmentId}
                            onClick={() => onSegmentClick(segment.start_ms)}
                            onUpdate={onSegmentUpdate}
                            onDelete={() => onSegmentDelete(segment.id)}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
