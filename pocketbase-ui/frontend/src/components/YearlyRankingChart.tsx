import { useEffect, useState } from 'react';
import pb, { getYearlyRanking } from '../lib/pocketbase';
import { translations, Language } from '../lib/translations';
import { getColor } from '../lib/colors';

interface YearlyRankingChartProps {
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

export default function YearlyRankingChart({ lang }: YearlyRankingChartProps) {
    const t = translations[lang];
    const [rankingData, setRankingData] = useState<UserStat[]>([]);
    const [loading, setLoading] = useState(false);
    const [maxHours, setMaxHours] = useState(10);

    useEffect(() => {
        fetchRanking();

        // Subscribe to global signaling collection
        pb.collection('ranking_updates').subscribe('*', (e) => {
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
            const currentYear = now.getFullYear().toString();

            // Fetch calculated stats from backend
            const records = await getYearlyRanking(currentYear);

            // Map to component state
            const result: UserStat[] = records.map(r => ({
                id: r.user_id,
                name: r.user_name || r.user_email || 'Unknown',
                email: r.user_email,
                totalHours: r.total_hours,
                completedTasks: r.completed_tasks,
                isCurrentUser: r.user_id === currentUser.id
            }));

            // Sort DESC (Highest first)
            result.sort((a, b) => b.totalHours - a.totalHours);

            // Determine max for scaling
            const max = result.length > 0 ? result[0].totalHours : 10;

            setRankingData(result);
            setMaxHours(max);

        } catch (err) {
            console.error("Yearly ranking fetch error:", err);
        } finally {
            setLoading(false);
        }
    };

    // --- Visualization Config ---
    const gap = 12;

    // Theme Colors: Violet/Purple
    const colorBgIcon = getColor('violet', 50); // #f5f3ff
    const colorIcon = getColor('violet', 600);  // #7c3aed
    const colorBarTop = getColor('violet', 500); // #8b5cf6
    const colorBarMe = getColor('primary');      // Indigo
    const colorBarOther = getColor('slate');     // Gray

    return (
        <div className="dashboard-card">
             <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem'}}>
                <div style={{padding: '6px', background: colorBgIcon, borderRadius: '6px', color: colorIcon}}>
                     {/* Trophy / Award Icon */}
                     <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" /></svg>
                </div>
                <h3 style={{margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)'}}>{t.statsYearlyRankingTitle}</h3>
            </div>

            <div style={{width: '100%', minHeight: '100px', position: 'relative'}}>
                {loading ? (
                     <div style={{textAlign: 'center', color: 'var(--text-muted)', padding: '2rem'}}>
                        {t.loading}
                    </div>
                ) : rankingData.length === 0 ? (
                    <div style={{textAlign: 'center', color: 'var(--text-muted)', padding: '1rem'}}>
                        No data available.
                    </div>
                ) : (
                    <div style={{maxHeight: '400px', overflowY: 'auto', paddingRight: '8px'}}> {/* Scroll container for ranking */}
                        <div style={{display: 'flex', flexDirection: 'column', gap: `${gap}px`}}>
                            {rankingData.map((user, index) => {
                                const widthPercent = maxHours > 0 ? (user.totalHours / maxHours) * 100 : 0;
                                const isCurrent = user.isCurrentUser;
                                
                                return (
                                    <div key={user.id} style={{display: 'flex', alignItems: 'center', gap: '1rem'}}>
                                        {/* Rank Number */}
                                        <div style={{
                                            width: '24px', 
                                            textAlign: 'center', 
                                            fontWeight: 700, 
                                            color: index < 3 ? getColor('amber') : 'var(--text-muted)', 
                                            fontSize: '0.9rem'
                                        }}>
                                            {index + 1}
                                        </div>

                                        {/* Name */}
                                        <div style={{flex: '0 0 150px', flexShrink: 0, fontSize: '0.85rem', fontWeight: isCurrent ? 700 : 500, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
                                            {user.name} {isCurrent && <span style={{color: 'var(--primary)', fontSize: '0.75rem'}}>({t.statsYourRank})</span>}
                                        </div>

                                        {/* Bar Container */}
                                        <div style={{flex: 1, display: 'flex', alignItems: 'center', gap: '8px'}}>
                                            <div style={{flex: 1, background: '#f1f5f9', borderRadius: '4px', height: '24px', position: 'relative'}}>
                                                {/* Filled Bar */}
                                                <div style={{
                                                    width: `${widthPercent}%`, 
                                                    height: '100%', 
                                                    background: isCurrent ? colorBarMe : (index === 0 ? colorBarTop : colorBarOther),
                                                    borderRadius: '4px',
                                                    transition: 'width 0.5s ease-out',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'flex-end',
                                                    paddingRight: '8px',
                                                    minWidth: '4px'
                                                }}>
                                                    {/* Value Label */}
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
                                                    background: getColor('violet', 100),
                                                    color: getColor('violet', 700),
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
        </div>
    );
}