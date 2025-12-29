import { useEffect, useState, useMemo } from 'react';
import pb, { getMonthlyRanking } from '../lib/pocketbase';
import { translations, Language } from '../lib/translations';
import { getColor } from '../lib/colors';
import { Card } from './ui/Card';

interface ColleagueRankingChartProps {
    lang: Language;
}

interface UserStat {
    id: string;
    name: string;
    email: string;
    totalHours: number;
    completedTasks: number;
    isCurrentUser: boolean;
}

export default function ColleagueRankingChart({ lang }: ColleagueRankingChartProps) {
    const t = translations[lang];
    const [rankingData, setRankingData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [maxHours, setMaxHours] = useState(10);

    useEffect(() => {
        fetchRanking();

        // Subscribe to signaling collection to update ranking for ALL users simultaneously
        pb.collection('ranking_updates').subscribe('*', (e) => {
            // console.log("Global ranking update signal received");
            fetchRanking();
        });

        return () => {
            pb.collection('ranking_updates').unsubscribe('*');
        };
    }, []);

    const fetchRanking = async () => {
        const currentUser = pb.authStore.record;
        if (!currentUser) return;

        setLoading(true);
        try {
            const now = new Date();
            // Format YYYY-MM
            const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

            // Fetch calculated stats from backend
            const records = await getMonthlyRanking(monthStr);
            setRankingData(records);

            // Determine max for scaling
            if (records.length > 0) {
                const sorted = [...records].sort((a, b) => b.total_hours - a.total_hours);
                setMaxHours(sorted[0].total_hours || 10);
            }

        } catch (err) {
            console.error("Ranking fetch error:", err);
        } finally {
            setLoading(false);
        }
    };

    const sortedData = useMemo(() => {
        const currentUser = pb.authStore.record;
        if (!currentUser) return [];

        return rankingData
            .map(r => ({
                id: r.user_id,
                name: r.user_name || r.user_email || 'Unknown',
                email: r.user_email,
                totalHours: r.total_hours,
                completedTasks: r.completed_tasks,
                isCurrentUser: r.user_id === currentUser.id
            }))
            .sort((a, b) => b.totalHours - a.totalHours);
    }, [rankingData]);

    // --- Visualization Config ---
    const barHeight = 36;
    const gap = 12;
    const maxBarWidth = 100; // Percentage

    const chartTitle = (
        <>
            <div style={{padding: '6px', background: getColor('emerald', 50), borderRadius: '6px', color: getColor('emerald', 600)}}>
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </div>
            <h3 style={{margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)'}}>{t.statsRankingTitle}</h3>
        </>
    );

    return (
        <Card title={chartTitle}>
            <div style={{width: '100%', minHeight: '100px', position: 'relative'}}>
                {loading ? (
                     <div style={{textAlign: 'center', color: 'var(--text-muted)', padding: '2rem'}}>
                        {t.loading}
                    </div>
                ) : sortedData.length === 0 ? (
                    <div style={{textAlign: 'center', color: 'var(--text-muted)', padding: '1rem'}}>
                        No data available.
                    </div>
                ) : (
                    <div style={{maxHeight: '400px', overflowY: 'auto', paddingRight: '8px'}}> {/* Scroll container for ranking */}
                        <div style={{display: 'flex', flexDirection: 'column', gap: `${gap}px`}}>
                            {sortedData.map((user, index) => {
                                const widthPercent = maxHours > 0 ? (user.totalHours / maxHours) * 100 : 0;
                                const isCurrent = user.isCurrentUser;
                                
                                return (
                                    <div key={user.id} style={{display: 'flex', alignItems: 'center', gap: '1rem'}}>
                                        {/* Rank Number */}
                                        <div style={{
                                            width: '24px', 
                                            textAlign: 'center', 
                                            fontWeight: 700, 
                                            color: index < 3 ? getColor('amber') : 'var(--text-muted)', // Gold color for top 3
                                            fontSize: '0.9rem'
                                        }}>
                                            {index + 1}
                                        </div>

                                        {/* Avatar / Name */}
                                        <div style={{flex: '0 0 140px', flexShrink: 0, fontSize: '0.85rem', fontWeight: isCurrent ? 700 : 500, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
                                            {user.name} {isCurrent && <span style={{color: getColor('primary'), fontSize: '0.75rem'}}>({t.statsYourRank})</span>}
                                        </div>

                                        {/* Bar Container */}
                                        <div style={{flex: 1, display: 'flex', alignItems: 'center', gap: '8px'}}>
                                            <div style={{flex: 1, background: '#f1f5f9', borderRadius: '4px', height: '24px', position: 'relative'}}>
                                                {/* Filled Bar */}
                                                <div style={{
                                                    width: `${widthPercent}%`, 
                                                    height: '100%', 
                                                    background: isCurrent ? getColor('primary') : (index === 0 ? getColor('emerald') : getColor('slate')), 
                                                    borderRadius: '4px',
                                                    transition: 'width 0.5s ease-out',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'flex-end',
                                                    paddingRight: '8px',
                                                    minWidth: '4px'
                                                }}>
                                                    {/* Hours Label inside bar */}
                                                    <span style={{
                                                        color: 'white', 
                                                        fontWeight: 600, 
                                                        fontSize: '0.75rem',
                                                        textShadow: '0 1px 2px rgba(0,0,0,0.1)'
                                                    }}>
                                                        {user.totalHours.toLocaleString()}
                                                    </span>
                                                </div>
                                            </div>
                                            
                                            {/* Completed Tasks Count Badge */}
                                            <div 
                                                title="Completed Tasks"
                                                style={{
                                                    background: getColor('success', 100),
                                                    color: getColor('success', 700),
                                                    padding: '2px 8px',
                                                    borderRadius: '12px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 600,
                                                    minWidth: '32px',
                                                    textAlign: 'center'
                                                }}
                                            >
                                                {user.completedTasks} ✓
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </Card>
    );
}
