import { useEffect, useState } from 'react';
import pb from '../lib/pocketbase';
import { translations, Language } from '../lib/translations';
import { getColor } from '../lib/colors';
import { useSettings } from '../lib/SettingsContext';

interface DailyStatsProps {
    lang: Language;
    refreshTrigger: number; 
}

export default function DailyStats({ lang, refreshTrigger }: DailyStatsProps) {
    const t = translations[lang];
    const { statuses, loading: settingsLoading } = useSettings();
    const [stats, setStats] = useState<Record<string, number>>({});
    const [totalHoursSpent, setTotalHoursSpent] = useState<number>(0); 
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchDailyStats();
    }, [refreshTrigger, statuses]); // Refresh stats when statuses change or trigger fires

    const fetchDailyStats = async () => {
        const user = pb.authStore.record;
        if (!user || statuses.length === 0) return;

        setLoading(true);
        
        try {
            // 1. Prepare definitions from global context
            const definitions = statuses.map(s => ({
                title: s.title,
                color: getColor(s.color)
            }));

            // 2. Load tasks for today
            const now = new Date();
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
            const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

            const records = await pb.collection('tasks').getFullList({
                filter: `user = "${user.id}" && file_date >= "${startOfDay.toISOString()}" && file_date <= "${endOfDay.toISOString()}"`,
                requestKey: null
            });

            // 3. Calculate stats
            const counts: Record<string, number> = {};
            definitions.forEach(s => counts[s.title] = 0);
            
            let hoursSum = 0;

            records.forEach(record => {
                if (Array.isArray(record.data)) {
                    record.data.forEach((task: any) => {
                        const status = task.status?.trim();
                        // Matching by Title (as stored in Excel data)
                        if (counts.hasOwnProperty(status)) {
                            counts[status] = (counts[status] || 0) + 1;
                        }
                        const hours = Number(task.time_spent);
                        if (!isNaN(hours)) {
                            hoursSum += hours;
                        }
                    });
                }
            });

            setStats(counts);
            setTotalHoursSpent(hoursSum);

        } catch (err) {
            console.error("Failed to fetch daily stats", err);
        } finally {
            setLoading(false);
        }
    };

    const tableStyle: React.CSSProperties = {
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '0.85rem',
    };

    const thStyle: React.CSSProperties = {
        textAlign: 'left',
        padding: '3px 0',
        borderBottom: '1px solid var(--border)',
        color: 'var(--text-muted)',
        fontWeight: 600,
        fontSize: '0.7rem',
        textTransform: 'uppercase'
    };

    const tdStyle: React.CSSProperties = {
        padding: '3px 0',
        borderBottom: '1px solid #f1f5f9',
        color: 'var(--text-main)'
    };

    const countStyle: React.CSSProperties = {
        fontWeight: 700,
        color: 'var(--primary)',
        fontSize: '1rem'
    };

    return (
        <div className="dashboard-card">
            <div style={{display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0}}> 
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem'}}>
                    <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                        <div style={{padding: '6px', background: '#eff6ff', borderRadius: '6px', color: 'var(--primary)'}}>
                            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                        </div>
                        <h3 style={{margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)'}}>{t.statsTitle}</h3>
                    </div>
                    
                    <small className="date-badge">
                        {new Date().toLocaleDateString(lang === 'ru' ? 'ru-RU' : (lang === 'az' ? 'az-Latn-AZ' : 'en-US'))}
                    </small>
                </div>
                
                {loading ? (
                    <div style={{fontSize: '0.9rem', color: 'var(--text-muted)'}}>{t.statsLoading}</div>
                ) : (
                    <div style={{overflowY: 'auto', flex: 1, minHeight: 0, paddingRight: '4px'}}> {/* Scroll container */}
                        <table style={tableStyle}>
                            <thead>
                                <tr>
                                    <th style={{...thStyle, position: 'sticky', top: 0, zIndex: 10, background: 'white'}}>{t.statsStatus}</th>
                                    <th style={{...thStyle, textAlign: 'right', position: 'sticky', top: 0, zIndex: 10, background: 'white'}}>{t.statsCount}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {statuses.map(s => (
                                    <tr key={s.id}>
                                        <td style={tdStyle}>
                                            <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px'}}>
                                                <span style={{width: '10px', height: '10px', borderRadius: '50%', backgroundColor: getColor(s.color)}}></span>
                                                {s.title}
                                            </span>
                                        </td>
                                        <td style={{...tdStyle, textAlign: 'right'}}>
                                            <span style={{...countStyle, fontSize: '0.9rem'}}>{stats[s.title] || 0}</span>
                                        </td>
                                    </tr>
                                ))}
                                <tr style={{borderTop: '2px solid var(--border)'}}>
                                    <td style={{...tdStyle, fontWeight: 700, paddingTop: '4px'}}>{t.statsTotal}</td>
                                    <td style={{...tdStyle, textAlign: 'right', fontWeight: 700, fontSize: '1.1rem', paddingTop: '4px'}}>
                                        {statuses.reduce((acc, s) => acc + (stats[s.title] || 0), 0)}
                                    </td>
                                </tr>
                                <tr style={{borderTop: '1px solid var(--border)'}}>
                                    <td style={{...tdStyle, fontWeight: 700, paddingTop: '4px'}}>{t.statsTotalHours}</td>
                                    <td style={{...tdStyle, textAlign: 'right', fontWeight: 700, fontSize: '1.1rem', paddingTop: '4px'}}>
                                        {totalHoursSpent.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}