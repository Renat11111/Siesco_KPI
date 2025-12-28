import { useEffect, useState } from 'react';
import pb from '../lib/pocketbase';
import { translations, Language } from '../lib/translations';

interface MonthlyStatsProps {
    lang: Language;
    refreshTrigger: number; 
    style?: React.CSSProperties;
    className?: string;
}

export default function MonthlyStats({ lang, refreshTrigger, style, className }: MonthlyStatsProps) {
    const t = translations[lang];
    const [totalHours, setTotalHours] = useState(0);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchMonthlyStats();

        let unsubTasks: () => void;
        let unsubGlobal: () => void;

        const setup = async () => {
            const user = pb.authStore.record;
            // Realtime subscription for specific tasks
            unsubTasks = await pb.collection('tasks').subscribe('*', (e) => {
                if (user && e.record && e.record.user === user.id) {
                    fetchMonthlyStats();
                }
            });

            // GLOBAL Realtime: update on any ranking update (e.g. admin upload)
            unsubGlobal = await pb.collection('ranking_updates').subscribe('*', () => {
                fetchMonthlyStats();
            });
        };

        setup();

        return () => {
            if (unsubTasks) unsubTasks();
            if (unsubGlobal) unsubGlobal();
        };
    }, [refreshTrigger, pb.authStore.record?.id]);

    const fetchMonthlyStats = async () => {
        const user = pb.authStore.record;
        if (!user) return;

        setLoading(true);
        
        try {
            const now = new Date();
            const y = now.getFullYear();
            const m = String(now.getMonth() + 1).padStart(2, '0');
            const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
            
            const startStr = `${y}-${m}-01 00:00:00`;
            const endStr = `${y}-${m}-${lastDay} 23:59:59`;

            const records = await pb.collection('tasks').getFullList({
                filter: `user = "${user.id}" && file_date >= "${startStr}" && file_date <= "${endStr}"`,
                requestKey: null,
                fields: 'data' 
            });

            let sum = 0;

            records.forEach(record => {
                if (Array.isArray(record.data)) {
                    record.data.forEach((task: any) => {
                        // Sum up time_spent
                        // Ensure it's treated as a number
                        const hours = Number(task.time_spent);
                        if (!isNaN(hours)) {
                            sum += hours;
                        }
                    });
                }
            });

            setTotalHours(sum);

        } catch (err) {
            console.error("Failed to fetch monthly stats", err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={`dashboard-card ${className || ''}`} style={style}>
            <div style={{display: 'flex', flexDirection: 'column', flex: 1}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
                    <div style={{display: 'flex', alignItems: 'center', gap: '0.75rem'}}>
                        <div style={{padding: '6px', background: '#f0fdf4', borderRadius: '6px', color: '#166534'}}>
                            {/* Calendar/Clock Icon */}
                            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <h3 style={{margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)'}}>{t.statsMonthTitle}</h3>
                    </div>
                    
                    <small className="date-badge">
                        {new Date().toLocaleString(lang === 'ru' ? 'ru' : (lang === 'az' ? 'az' : 'en'), { month: 'long', year: 'numeric' })}
                    </small>
                </div>
                
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.5rem 0'}}>
                    {loading ? (
                         <div style={{fontSize: '0.9rem', color: 'var(--text-muted)'}}>{t.statsLoading}</div>
                    ) : (
                        <div style={{textAlign: 'center'}}>
                             <span style={{fontSize: '2.5rem', fontWeight: 700, color: 'var(--primary)', lineHeight: 1}}>
                                {totalHours.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                             </span>
                             <div style={{fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem', fontWeight: 500}}>
                                 {t.colSpent}
                             </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
