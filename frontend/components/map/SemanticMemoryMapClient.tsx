'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import type { EChartsOption } from 'echarts';
import type { SemanticMapPoint } from '@/lib/types';
import SemanticMapDetailsPanel from './SemanticMapDetailsPanel';

const ReactECharts = dynamic(() => import('echarts-for-react'), {
    ssr: false,
    loading: () => (
        <div className="flex h-full min-h-125 items-center justify-center rounded-xl border border-zinc-200 bg-white text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            Loading map...
        </div>
    ),
});

interface SemanticMemoryMapClientProps {
    points: SemanticMapPoint[];
}

interface EChartEventPoint {
    componentType?: string;
    dataIndex?: number;
    data?: unknown;
    event?: {
        event?: {
            clientX?: number;
            clientY?: number;
        };
    };
}

function colorFromCluster(clusterLabel?: string | null): string {
    if (!clusterLabel) {
        return '#7f8596';
    }

    let hash = 0;
    for (let i = 0; i < clusterLabel.length; i += 1) {
        hash = clusterLabel.charCodeAt(i) + ((hash << 5) - hash);
    }

    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 63%, 48%)`;
}

function getPointIdFromEvent(event: unknown, sourcePoints: SemanticMapPoint[]): string | null {
    const maybeEvent = event as EChartEventPoint;

    if (maybeEvent?.componentType !== 'series') {
        return null;
    }

    if (Array.isArray(maybeEvent?.data) && maybeEvent.data.length >= 3) {
        const maybeId = maybeEvent.data[2];
        if (typeof maybeId === 'string' || typeof maybeId === 'number') {
            return String(maybeId);
        }
    }

    if (
        maybeEvent?.data != null
        && typeof maybeEvent.data === 'object'
        && 'id' in maybeEvent.data
    ) {
        const maybeId = (maybeEvent.data as { id?: unknown }).id;
        if (typeof maybeId === 'string' || typeof maybeId === 'number') {
            return String(maybeId);
        }
    }

    if (typeof maybeEvent?.dataIndex === 'number') {
        const mapped = sourcePoints[maybeEvent.dataIndex];
        if (mapped?.id) {
            return mapped.id;
        }
    }

    return null;
}

function formatDate(value?: string | null): string {
    if (!value) {
        return 'Unknown date';
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return value;
    }

    return parsed.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

export default function SemanticMemoryMapClient({ points }: SemanticMemoryMapClientProps) {
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [hoverCardPosition, setHoverCardPosition] = useState<{ x: number; y: number } | null>(null);
    const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null);

    const filteredPoints = points;

    const selectedPoint = useMemo(() => {
        if (!selectedId) {
            return null;
        }

        return points.find((point) => point.id === selectedId) || null;
    }, [points, selectedId]);

    const hoveredPoint = useMemo(() => {
        if (!hoveredId) {
            return null;
        }

        return points.find((point) => point.id === hoveredId) || null;
    }, [points, hoveredId]);

    const chartOption = useMemo<EChartsOption>(() => {
        return {
            animationDuration: 220,
            animationDurationUpdate: 160,
            grid: {
                left: 8,
                right: 8,
                top: 8,
                bottom: 8,
            },
            xAxis: {
                type: 'value',
                show: false,
                scale: true,
            },
            yAxis: {
                type: 'value',
                show: false,
                scale: true,
            },
            tooltip: {
                show: false,
            },
            dataZoom: [
                {
                    type: 'inside',
                    xAxisIndex: 0,
                    yAxisIndex: 0,
                    zoomOnMouseWheel: true,
                    moveOnMouseMove: true,
                },
            ],
            series: [
                {
                    type: 'scatter',
                    data: filteredPoints.map((point) => {
                        const isSelected = point.id === selectedId;

                        return {
                            value: [point.x, point.y, point.id],
                            symbolSize: isSelected ? 18 : 10,
                            itemStyle: {
                                color: colorFromCluster(point.clusterLabel),
                                opacity: isSelected ? 1 : 0.84,
                                borderColor: '#f4f4f5',
                                borderWidth: isSelected ? 2.4 : 0.7,
                            },
                        };
                    }),
                    emphasis: {
                        scale: true,
                    },
                },
            ],
        };
    }, [filteredPoints, selectedId]);

    const chartEvents = useMemo(() => {
        return {
            mouseover: (event: unknown) => {
                const pointId = getPointIdFromEvent(event, filteredPoints);
                if (!pointId) {
                    return;
                }

                setHoveredId(pointId);

                const chartEvent = event as EChartEventPoint;
                const x = chartEvent.event?.event?.clientX;
                const y = chartEvent.event?.event?.clientY;

                if (typeof x === 'number' && typeof y === 'number') {
                    setHoverCardPosition({ x, y });
                    return;
                }

                if (mousePosition) {
                    setHoverCardPosition(mousePosition);
                }
            },
            mouseout: () => {
                setHoveredId(null);
                setHoverCardPosition(null);
            },
            click: (event: unknown) => {
                const pointId = getPointIdFromEvent(event, filteredPoints);
                if (!pointId) {
                    return;
                }

                setSelectedId(pointId);
            },
        };
    }, [filteredPoints, mousePosition]);

    const hasPoints = points.length > 0;
    const hasFilteredResults = filteredPoints.length > 0;

    return (
        <section className="space-y-4">

            {!hasPoints && (
                <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                    No semantic map points are available yet.
                </div>
            )}

            {hasPoints && !hasFilteredResults && (
                <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                    No points match your current filter.
                </div>
            )}

            {hasPoints && hasFilteredResults && (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
                    <div
                        className="relative min-h-135 rounded-xl border border-zinc-200 bg-white p-2 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                        onMouseMove={(event) => {
                            setMousePosition({ x: event.clientX, y: event.clientY });
                        }}
                    >
                        <ReactECharts
                            option={chartOption}
                            onEvents={chartEvents}
                            style={{ width: '100%', height: '100%' }}
                            notMerge
                            lazyUpdate
                            opts={{ renderer: 'canvas' }}
                        />

                        {hoveredPoint && hoverCardPosition && (
                            <div
                                className="pointer-events-none fixed z-50 w-56 overflow-hidden rounded-lg border border-zinc-200 bg-white/95 shadow-lg backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/95"
                                style={{
                                    left: hoverCardPosition.x + 16,
                                    top: hoverCardPosition.y + 16,
                                }}
                            >
                                {hoveredPoint.thumbnailUrl && (
                                    <Image
                                        src={hoveredPoint.thumbnailUrl}
                                        alt={hoveredPoint.title}
                                        width={224}
                                        height={128}
                                        loading="eager"
                                        unoptimized
                                        className="h-auto w-full"
                                    />
                                )}
                                <div className="px-3 py-2">
                                    <p className="line-clamp-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                        {hoveredPoint.title}
                                    </p>
                                    <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                                        {formatDate(hoveredPoint.date)}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    <SemanticMapDetailsPanel
                        selectedPoint={selectedPoint}
                    />
                </div>
            )}
        </section>
    );
}
