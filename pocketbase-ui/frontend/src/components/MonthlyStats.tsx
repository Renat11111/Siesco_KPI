import { translations, Language } from '../lib/translations';
import { Card } from './ui/Card';
import { useMonthlyStats } from '../hooks/useMonthlyStats';

interface MonthlyStatsProps {
    lang: Language;
    refreshTrigger: number; 
    style?: React.CSSProperties;
    className?: string;
}

export default function MonthlyStats({ lang, refreshTrigger, style, className }: MonthlyStatsProps) {
    const t = translations[lang];
    const { monthlyHours, loading } = useMonthlyStats(refreshTrigger);

    const title = (
        <>
            <div style={{padding: '6px', background: '#f0fdf4', borderRadius: '6px', color: '#166534'}}>
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
            </div>
            <h3 style={{margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)'}}>{t.statsMonthTitle}</h3>
        </>
    );

    const extra = (
        <small className="date-badge">
            {new Date().toLocaleString(lang === 'ru' ? 'ru' : (lang === 'az' ? 'az' : 'en'), { month: 'long', year: 'numeric' })}
        </small>
    );

    return (
        <Card title={title} extra={extra} className={className} style={style}>
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.5rem 0'}}>
                {loading ? (
                     <div style={{fontSize: '0.9rem', color: 'var(--text-muted)'}}>{t.statsLoading}</div>
                ) : (
                    <div style={{textAlign: 'center'}}>
                         <span style={{fontSize: '2.5rem', fontWeight: 700, color: 'var(--primary)', lineHeight: 1}}>
                            {monthlyHours.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                         </span>
                         <div style={{fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem', fontWeight: 500}}>
                             {t.colSpent}
                         </div>
                    </div>
                )}
            </div>
        </Card>
    );
}
