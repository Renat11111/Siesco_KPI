import { translations, Language } from '../lib/translations';
import { Card } from './ui/Card';
import { useComparisonStats } from '../hooks/useComparisonStats';

interface ComparisonStatsProps {
    lang: Language;
    refreshTrigger: number; 
    style?: React.CSSProperties;
    className?: string;
}

export default function ComparisonStats({ lang, refreshTrigger, style, className }: ComparisonStatsProps) {
    const t = translations[lang];
    const { prevMonthHours, loading } = useComparisonStats(refreshTrigger);

    const getPrevMonthName = () => {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return d.toLocaleString(lang === 'ru' ? 'ru' : (lang === 'az' ? 'az' : 'en'), { month: 'long', year: 'numeric' });
    };

    const title = (
        <>
            <div style={{padding: '6px', background: '#fef3c7', borderRadius: '6px', color: '#b45309'}}>
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </div>
            <h3 style={{margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)', flexShrink: 1}}>{t.statsComparisonTitle}</h3>
        </>
    );

    const extra = (
        <small className="date-badge">
            {getPrevMonthName()}
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
                            {prevMonthHours.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
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
