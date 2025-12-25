import { useEffect, useState, useRef } from 'react';
import pb from '../lib/pocketbase';
import { translations, Language } from '../lib/translations';
import { getColor } from '../lib/colors'; // Импортируем getColor

interface DailyComparisonChartProps {
    lang: Language;
    refreshTrigger: number;
}

export default function DailyComparisonChart({ lang, refreshTrigger }: DailyComparisonChartProps) {
    const t = translations[lang];
    const [chartData, setChartData] = useState<{ day: number, current: number, prev: number }[]>([]);
    const [loading, setLoading] = useState(false);
    const [maxValue, setMaxValue] = useState(10);
    
    // Interaction State
    const [hoveredDay, setHoveredDay] = useState<number | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchData();
    }, [refreshTrigger]);

    const fetchData = async () => {
        const user = pb.authStore.record;
        if (!user) return;

        setLoading(true);
        try {
            const now = new Date();
            const startCur = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
            const endCur = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

            const startPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
            const endPrev = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

            const recordsCur = await pb.collection('tasks').getFullList({
                filter: `user = "${user.id}" && file_date >= "${startCur.toISOString()}" && file_date <= "${endCur.toISOString()}"`,
                requestKey: null,
                fields: 'data,file_date' 
            });

            const recordsPrev = await pb.collection('tasks').getFullList({
                filter: `user = "${user.id}" && file_date >= "${startPrev.toISOString()}" && file_date <= "${endPrev.toISOString()}"`,
                requestKey: null,
                fields: 'data,file_date'
            });

            const aggregate = (records: any[]) => {
                const map = new Map<number, number>();
                records.forEach(r => {
                    const d = new Date(r.file_date);
                    const day = d.getDate();
                    if (Array.isArray(r.data)) {
                        r.data.forEach((task: any) => {
                            const hours = Number(task.time_spent);
                            if (!isNaN(hours)) {
                                map.set(day, (map.get(day) || 0) + hours);
                            }
                        });
                    }
                });
                return map;
            };

            const curMap = aggregate(recordsCur);
            const prevMap = aggregate(recordsPrev);

            const data = [];
            let max = 0;
            for (let i = 1; i <= 31; i++) {
                const c = curMap.get(i) || 0;
                const p = prevMap.get(i) || 0;
                if (c > max) max = c;
                if (p > max) max = p;
                data.push({ day: i, current: c, prev: p });
            }

            setChartData(data);
            setMaxValue(Math.max(max, 5));

        } catch (err) {
            console.error("Chart data fetch error:", err);
        } finally {
            setLoading(false);
        }
    };

    // SVG Constants
    const width = 1000;
    const height = 250;
    const padding = 30;
    const graphWidth = width - padding * 2;
    const graphHeight = height - padding * 2;

    const getX = (day: number) => padding + ((day - 1) / 30) * graphWidth;
    const getY = (val: number) => height - padding - (val / (maxValue * 1.1)) * graphHeight;

    const makePath = (type: 'current' | 'prev') => {
        return chartData.map((d, i) => {
            const x = getX(d.day);
            const y = getY(type === 'current' ? d.current : d.prev);
            return `${i === 0 ? 'M' : 'L'} ${x},${y}`;
        }).join(' ');
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const clientX = e.clientX - rect.left;
        
        // Convert clientX to SVG X
        // The SVG scales to fit the container width, so we need the ratio
        const scaleX = width / rect.width; // Ratio between SVG coord system and rendered pixels
        const svgX = clientX * scaleX;

        // Calculate nearest day index
        // x = padding + (index / 30) * graphWidth
        // index = (x - padding) / graphWidth * 30
        const rawIndex = ((svgX - padding) / graphWidth) * 30;
        let index = Math.round(rawIndex);

        // Clamp
        if (index < 0) index = 0;
        if (index > 30) index = 30;

        setHoveredDay(index + 1); // Days are 1-based
    };

    const handleMouseLeave = () => {
        setHoveredDay(null);
    };

    // Prepare Hover Data
    const activeData = hoveredDay ? chartData[hoveredDay - 1] : null;

    return (
        <div className="dashboard-card">
             <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
                <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                    <div style={{padding: '6px', background: '#f3f4f6', borderRadius: '6px', color: '#4b5563'}}>
                         <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /></svg>
                    </div>
                    <h3 style={{margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)'}}>{t.statsChartTitle}</h3>
                </div>

                {/* Legend */}
                <div style={{display: 'flex', gap: '1rem', fontSize: '0.75rem', fontWeight: 500}}>
                    <div style={{display: 'flex', alignItems: 'center', gap: '4px'}}>
                        <span style={{width: '10px', height: '10px', borderRadius: '2px', background: getColor('primary')}}></span>
                        {t.legendCurrent}
                    </div>
                    <div style={{display: 'flex', alignItems: 'center', gap: '4px'}}>
                        <span style={{width: '10px', height: '10px', borderRadius: '2px', background: getColor('warning')}}></span>
                        {t.legendPrev}
                    </div>
                </div>
            </div>

            <div 
                ref={containerRef}
                style={{width: '100%', height: '300px', minHeight: '180px', position: 'relative', cursor: 'crosshair'}}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
            >
                {loading ? (
                     <div style={{position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'var(--text-muted)'}}>
                        {t.loading}
                    </div>
                ) : (
                    <>
                        {/* Tooltip HTML Overlay */}
                        {activeData && (
                            <div style={{
                                position: 'absolute',
                                left: `${(getX(activeData.day) / width) * 100}%`,
                                top: '0', 
                                transform: `translateX(${activeData.day > 25 ? '-110%' : '10%'})`, // Move tooltip left if near right edge
                                background: 'rgba(255, 255, 255, 0.95)',
                                border: '1px solid var(--border)',
                                padding: '8px 12px',
                                borderRadius: '8px',
                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                                pointerEvents: 'none',
                                zIndex: 10,
                                fontSize: '0.8rem',
                                minWidth: '120px'
                            }}>
                                <div style={{fontWeight: 700, marginBottom: '4px', borderBottom: '1px solid #eee', paddingBottom: '2px'}}>
                                    {t.colDate}: {activeData.day}
                                </div>
                                <div style={{display: 'flex', justifyContent: 'space-between', color: getColor('primary')}}>
                                    <span>{t.legendCurrent}:</span>
                                    <strong>{activeData.current}</strong>
                                </div>
                                <div style={{display: 'flex', justifyContent: 'space-between', color: getColor('warning')}}>
                                    <span>{t.legendPrev}:</span>
                                    <strong>{activeData.prev}</strong>
                                </div>
                            </div>
                        )}

                        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{width: '100%', height: '100%', overflow: 'visible'}}>
                            {/* Grid Lines */}
                            {[0, 0.25, 0.5, 0.75, 1].map((factor) => {
                                 const val = maxValue * factor;
                                 const y = getY(val);
                                 return (
                                     <g key={factor}>
                                         <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#e5e7eb" strokeDasharray="4" />
                                         <text x={padding - 5} y={y + 4} textAnchor="end" fontSize="10" fill="#9ca3af">{Math.round(val)}</text>
                                     </g>
                                 );
                            })}

                            {/* X Axis Labels */}
                            {chartData.map((d) => (
                                <text key={d.day} x={getX(d.day)} y={height - 5} textAnchor="middle" fontSize="9" fill="#9ca3af">{d.day}</text>
                            ))}

                            {/* Lines */}
                            <path d={makePath('prev')} fill="none" stroke={getColor('warning')} strokeWidth="2" strokeOpacity="0.5" />
                            <path d={makePath('current')} fill="none" stroke={getColor('primary')} strokeWidth="3" />

                            {/* Interactive Elements for Hover */}
                            {activeData && (
                                <g>
                                    {/* Vertical Indicator Line */}
                                    <line 
                                        x1={getX(activeData.day)} 
                                        y1={padding} 
                                        x2={getX(activeData.day)} 
                                        y2={height - padding} 
                                        stroke="#94a3b8" 
                                        strokeWidth="1" 
                                        strokeDasharray="4"
                                    />
                                    {/* Active Points Highlight */}
                                    <circle cx={getX(activeData.day)} cy={getY(activeData.prev)} r={5} fill={getColor('warning')} stroke="white" strokeWidth={2} />
                                    <circle cx={getX(activeData.day)} cy={getY(activeData.current)} r={6} fill={getColor('primary')} stroke="white" strokeWidth={2} />
                                </g>
                            )}
                        </svg>
                    </>
                )}
            </div>
        </div>
    );
}