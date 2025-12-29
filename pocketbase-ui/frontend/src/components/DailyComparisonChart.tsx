import { useEffect, useState, useRef } from 'react';
import pb from '../lib/pocketbase';
import { translations, Language } from '../lib/translations';
import { getColor } from '../lib/colors';
import { Card } from './ui/Card';

interface DailyComparisonChartProps {
    lang: Language;
    refreshTrigger: number;
}

export default function DailyComparisonChart({ lang, refreshTrigger }: DailyComparisonChartProps) {
    const t = translations[lang];
    const [chartData, setChartData] = useState<{ day: number, current: number, prev: number }[]>([]);
    const [loading, setLoading] = useState(false);
    const [maxValue, setMaxValue] = useState(10);
    
    const [hoveredDay, setHoveredDay] = useState<number | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchData();

        // Realtime subscription
        pb.collection('tasks').subscribe('*', (e) => {
            const user = pb.authStore.record;
            if (user && e.record && e.record.user === user.id) {
                fetchData();
            }
        });

        return () => {
            pb.collection('tasks').unsubscribe('*');
        };
    }, [refreshTrigger]);

    const fetchData = async () => {
        const user = pb.authStore.record;
        if (!user) return;

        setLoading(true);
        try {
            const now = new Date();
            const y = now.getFullYear();
            const m = now.getMonth();
            
            // Текущий месяц
            const startCur = `${y}-${String(m + 1).padStart(2, '0')}-01 00:00:00`;
            const endCur = `${y}-${String(m + 1).padStart(2, '0')}-${new Date(y, m + 1, 0).getDate()} 23:59:59`;

            // Прошлый месяц
            const prevM = new Date(y, m - 1, 1);
            const startPrev = `${prevM.getFullYear()}-${String(prevM.getMonth() + 1).padStart(2, '0')}-01 00:00:00`;
            const endPrev = `${prevM.getFullYear()}-${String(prevM.getMonth() + 1).padStart(2, '0')}-${new Date(prevM.getFullYear(), prevM.getMonth() + 1, 0).getDate()} 23:59:59`;

            const recordsCur = await pb.collection('tasks').getFullList({
                filter: `user = "${user.id}" && file_date >= "${startCur}" && file_date <= "${endCur}"`,
                requestKey: null,
                fields: 'data,file_date' 
            });

            const recordsPrev = await pb.collection('tasks').getFullList({
                filter: `user = "${user.id}" && file_date >= "${startPrev}" && file_date <= "${endPrev}"`,
                requestKey: null,
                fields: 'data,file_date'
            });

            const aggregate = (records: any[]) => {
                const map = new Map<number, number>();
                records.forEach(r => {
                    const day = new Date(r.file_date).getDate();
                    if (Array.isArray(r.data)) {
                        r.data.forEach((task: any) => {
                            const hours = Number(task.time_spent);
                            if (!isNaN(hours)) map.set(day, (map.get(day) || 0) + hours);
                        });
                    }
                });
                return map;
            };

            const curMap = aggregate(recordsCur);
            const prevMap = aggregate(recordsPrev);

            const data = []; let max = 0;
            for (let i = 1; i <= 31; i++) {
                const c = curMap.get(i) || 0; const p = prevMap.get(i) || 0;
                if (c > max) max = c; if (p > max) max = p;
                data.push({ day: i, current: c, prev: p });
            }
            setChartData(data); setMaxValue(Math.max(max, 5));
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    const width = 1000; const height = 280; const paddingLeft = 50; const paddingRight = 30; const paddingTop = 40; const paddingBottom = 40;
    const graphWidth = width - paddingLeft - paddingRight; 
    const graphHeight = height - paddingTop - paddingBottom;
    
    const getX = (day: number) => paddingLeft + ((day - 1) / 30) * graphWidth;
    const getY = (val: number) => height - paddingBottom - (val / (maxValue * 1.1 || 1)) * graphHeight;

    const makePath = (type: 'current' | 'prev') => {
        return chartData.map((d, i) => {
            const x = getX(d.day); const y = getY(type === 'current' ? d.current : d.prev);
            return `${i === 0 ? 'M' : 'L'} ${x},${y}`;
        }).join(' ');
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (width / rect.width);
        let index = Math.round(((x - paddingLeft) / graphWidth) * 30);
        if (index < 0) index = 0; if (index > 30) index = 30;
        setHoveredDay(index + 1);
    };

    const activeData = hoveredDay ? chartData[hoveredDay - 1] : null;

    const chartTitle = (
        <>
            <div style={{padding: '6px', background: '#f3f4f6', borderRadius: '6px', color: '#4b5563'}}>
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                </svg>
            </div>
            <h3 style={{margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)'}}>{t.statsChartTitle}</h3>
        </>
    );

    const chartLegend = (
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
    );

    return (
        <Card title={chartTitle} extra={chartLegend}>
            <div ref={containerRef} style={{width: '100%', height: '320px', position: 'relative', cursor: 'crosshair'}} onMouseMove={handleMouseMove} onMouseLeave={()=>setHoveredDay(null)}>
                {loading ? <div style={{textAlign: 'center', padding: '5rem'}}>{t.loading}</div> : (
                    <>
                        <div style={{ position: 'absolute', top: activeData ? getY(activeData.current) - 70 : 0, left: activeData ? (getX(activeData.day) / width) * 100 + '%' : '0', transform: `translateX(-50%)`, backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 12px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', pointerEvents: 'none', zIndex: 100, opacity: activeData ? 1 : 0, transition: 'opacity 0.2s' }}>
                            {activeData && <div><div style={{fontSize: '0.7rem', fontWeight: 600}}>{activeData.day}</div><div>{t.legendCurrent}: {activeData.current.toFixed(1)}ч</div><div>{t.legendPrev}: {activeData.prev.toFixed(1)}ч</div></div>}
                        </div>
                        <svg viewBox={`0 0 ${width} ${height}`} style={{width: '100%', height: '100%', overflow: 'visible'}}>
                            {/* Сетка и шкала Y */}
                            {[0, 0.25, 0.5, 0.75, 1].map(f => {
                                const val = maxValue * f;
                                return (
                                    <g key={f}>
                                        <line x1={paddingLeft} y1={getY(val)} x2={width-paddingRight} y2={getY(val)} stroke="#e5e7eb" strokeDasharray="4" />
                                        <text x={paddingLeft - 10} y={getY(val) + 4} textAnchor="end" style={{fontSize: '11px', fill: '#94a3b8', fontWeight: 500}}>
                                            {val % 1 === 0 ? val : val.toFixed(1)}{t.statsHoursUnit || 'ч'}
                                        </text>
                                    </g>
                                );
                            })}

                            {/* Шкала X (все дни месяца) */}
                            {chartData.map((d) => (
                                <text key={d.day} x={getX(d.day)} y={height - 15} textAnchor="middle" style={{fontSize: '10px', fill: '#94a3b8', fontWeight: 500}}>{d.day}</text>
                            ))}

                            <path d={makePath('prev')} fill="none" stroke={getColor('warning')} strokeWidth="2" strokeOpacity="0.4" />
                            <path d={makePath('current')} fill="none" stroke={getColor('primary')} strokeWidth="3" strokeOpacity="0.8" />
                            
                            {/* Постоянные яркие точки и подписи значений */}
                            {chartData.map((d) => (
                                <g key={d.day}>
                                    {d.prev > 0 && (
                                        <circle cx={getX(d.day)} cy={getY(d.prev)} r="3.5" fill={getColor('warning')} stroke="white" strokeWidth="1.5" />
                                    )}
                                    {d.current > 0 && (
                                        <g>
                                            <circle cx={getX(d.day)} cy={getY(d.current)} r="4.5" fill={getColor('primary')} stroke="white" strokeWidth="2" />
                                            <text 
                                                x={getX(d.day)} 
                                                y={getY(d.current) - 10} 
                                                textAnchor="middle" 
                                                style={{fontSize: '10px', fill: getColor('primary'), fontWeight: 700}}
                                            >
                                                {d.current.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                                            </text>
                                        </g>
                                    )}
                                </g>
                            ))}

                            {activeData && <g>
                                <line x1={getX(activeData.day)} y1={paddingTop} x2={getX(activeData.day)} y2={height-paddingBottom} stroke="#94a3b8" strokeDasharray="4" />
                                <circle cx={getX(activeData.day)} cy={getY(activeData.prev)} r={6} fill={getColor('warning')} stroke="white" strokeWidth="2" />
                                <circle cx={getX(activeData.day)} cy={getY(activeData.current)} r={7} fill={getColor('primary')} stroke="white" strokeWidth="2" />
                            </g>}
                        </svg>
                    </>
                )}
            </div>
        </Card>
    );
}
