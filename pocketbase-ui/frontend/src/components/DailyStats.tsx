import { translations, Language } from '../lib/translations';
import { Card } from './ui/Card';
import { useDailyStats } from '../hooks/useDailyStats';

interface DailyStatsProps {
    lang: Language;
    refreshTrigger: number; 
}

export default function DailyStats({ lang, refreshTrigger }: DailyStatsProps) {
    const t = translations[lang];
    
    const { 
        stats, 
        totalHoursSpent, 
        loading, 
        statusList, 
        totalCount 
    } = useDailyStats(refreshTrigger);

    const statsTitle = (
        <>
            <div style={{padding: '6px', background: '#eff6ff', borderRadius: '6px', color: 'var(--primary)'}}>
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
            </div>
            <h3 style={{margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)'}}>{t.statsTitle}</h3>
        </>
    );

    const statsExtra = (
        <small className="date-badge">
            {new Date().toLocaleDateString(lang === 'ru' ? 'ru-RU' : (lang === 'az' ? 'az-Latn-AZ' : 'en-US'))}
        </small>
    );

    return (
        <Card title={statsTitle} extra={statsExtra} style={{ height: '100%' }}>
            <div style={{display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0}}> 
                {loading ? (
                    <div style={{fontSize: '0.9rem', color: 'var(--text-muted)'}}>{t.statsLoading}</div>
                ) : (
                    <div style={{overflowY: 'auto', flex: 1, minHeight: 0, paddingRight: '4px'}}>
                        <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem'}}>
                            <thead>
                                <tr>
                                    <th style={{textAlign: 'left', padding: '3px 0', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase', position: 'sticky', top: 0, background: 'white'}}>{t.statsStatus}</th>
                                    <th style={{textAlign: 'right', padding: '3px 0', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase', position: 'sticky', top: 0, background: 'white'}}>{t.statsCount}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {statusList.map(s => (
                                    <tr key={s.title}>
                                        <td style={{padding: '3px 0', borderBottom: '1px solid #f1f5f9', color: 'var(--text-main)'}}>
                                            <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px'}}><span style={{width: '10px', height: '10px', borderRadius: '50%', backgroundColor: s.color}}></span>{s.title}</span>
                                        </td>
                                        <td style={{padding: '3px 0', borderBottom: '1px solid #f1f5f9', color: 'var(--text-main)', textAlign: 'right'}}><span style={{fontWeight: 700, color: 'var(--primary)', fontSize: '0.9rem'}}>{stats[s.title] || 0}</span></td>
                                    </tr>
                                ))}
                                <tr style={{borderTop: '2px solid var(--border)'}}>
                                    <td style={{padding: '3px 0', color: 'var(--text-main)', fontWeight: 700, paddingTop: '4px'}}>{t.statsTotal}</td>
                                    <td style={{padding: '3px 0', color: 'var(--text-main)', textAlign: 'right', fontWeight: 700, fontSize: '1.1rem', paddingTop: '4px'}}>{totalCount}</td>
                                </tr>
                                <tr style={{borderTop: '1px solid var(--border)'}}>
                                    <td style={{padding: '3px 0', color: 'var(--text-main)', fontWeight: 700, paddingTop: '4px'}}>{t.statsTotalHours}</td>
                                    <td style={{padding: '3px 0', color: 'var(--text-main)', textAlign: 'right', fontWeight: 700, fontSize: '1.1rem', paddingTop: '4px'}}>{totalHoursSpent.toFixed(1)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </Card>
    );
}
