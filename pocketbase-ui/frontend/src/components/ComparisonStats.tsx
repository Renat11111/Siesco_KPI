import { useEffect, useState } from 'react';
import pb from '../lib/pocketbase';
import { translations, Language } from '../lib/translations';

interface ComparisonStatsProps {
    lang: Language;
    refreshTrigger: number; 
    style?: React.CSSProperties;
    className?: string;
}

export default function ComparisonStats({ lang, refreshTrigger, style, className }: ComparisonStatsProps) {
    const t = translations[lang];
    const [totalHours, setTotalHours] = useState(0);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchComparisonStats();
    }, [refreshTrigger]);

    const fetchComparisonStats = async () => {
        const user = pb.authStore.record;
        if (!user) return;

        setLoading(true);
        
        try {
            const now = new Date();
            // Calculate Previous Month
            // If current is Dec (11), prev is Nov (10). 
            // If current is Jan (0), prev is Dec (-1) of prev year, Date handles this automatically.
            const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
            const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

            const records = await pb.collection('tasks').getFullList({
                filter: `user = "${user.id}" && file_date >= "${startOfPrevMonth.toISOString()}" && file_date <= "${endOfPrevMonth.toISOString()}"`,
                requestKey: null,
                fields: 'data'
            });

            let sum = 0;

            records.forEach(record => {
                if (Array.isArray(record.data)) {
                    record.data.forEach((task: any) => {
                        const hours = Number(task.time_spent);
                        if (!isNaN(hours)) {
                            sum += hours;
                        }
                    });
                }
            });

            setTotalHours(sum);

        } catch (err) {
            console.error("Failed to fetch comparison stats", err);
        } finally {
            setLoading(false);
        }
    };

    const getPrevMonthName = () => {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return d.toLocaleString(lang === 'ru' ? 'ru' : (lang === 'az' ? 'az' : 'en'), { month: 'long', year: 'numeric' });
    };

    return (
        <div className={`dashboard-card ${className || ''}`} style={style}>
            <div style={{display: 'flex', flexDirection: 'column', flex: 1}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem'}}>
                    <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                        <div style={{padding: '6px', background: '#fef3c7', borderRadius: '6px', color: '#b45309'}}>
                            {/* History/Clock Back Icon */}
                            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <h3 style={{margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)', flexShrink: 1}}>{t.statsComparisonTitle}</h3>
                    </div>
                    
                    <small className="date-badge">
                        {getPrevMonthName()}
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
