import { useEffect, useState } from 'react';
import pb from '../lib/pocketbase';
import { translations, Language } from '../lib/translations';
import { getColor } from '../lib/colors';
import { Card } from './ui/Card';

interface DailyStatsProps {
    lang: Language;
    refreshTrigger: number; 
}

interface StatusDefinition {
    title: string;
    color: string;
}

export default function DailyStats({ lang, refreshTrigger }: DailyStatsProps) {
    const t = translations[lang];
    const [stats, setStats] = useState<Record<string, number>>({});
    const [totalHoursSpent, setTotalHoursSpent] = useState<number>(0); 
    const [loading, setLoading] = useState(false);
    const [statusList, setStatusList] = useState<StatusDefinition[]>([]);

    useEffect(() => {
        fetchDailyStats();

        let unsubTasks: () => void;
        let unsubGlobal: () => void;

        const setup = async () => {
            const currentUser = pb.authStore.record;
            // 1. Smart Realtime: update only if the task belongs to ME
            unsubTasks = await pb.collection('tasks').subscribe('*', (e) => {
                if (currentUser && e.record && e.record.user === currentUser.id) {
                    fetchDailyStats();
                }
            });

            // 2. GLOBAL Realtime: update on any ranking update (e.g. admin upload)
            unsubGlobal = await pb.collection('ranking_updates').subscribe('*', () => {
                fetchDailyStats();
            });
        };

        setup();

        return () => {
            if (unsubTasks) unsubTasks();
            if (unsubGlobal) unsubGlobal();
        };
    }, [refreshTrigger, pb.authStore.record?.id]);

    const fetchDailyStats = async () => {
        const user = pb.authStore.record;
        if (!user) return;

        setLoading(true);
        try {
            const statusRecords = await pb.collection('statuses').getFullList({ requestKey: null });
            const definitions: StatusDefinition[] = statusRecords.map(r => ({
                title: r.title,
                color: getColor(r.color)
            }));
            setStatusList(definitions);

            const now = new Date();
            const y = now.getFullYear();
            const m = String(now.getMonth() + 1).padStart(2, '0');
            const d = String(now.getDate()).padStart(2, '0');
            const todayStr = `${y}-${m}-${d}`;

            const records = await pb.collection('tasks').getFullList({
                filter: `user = "${user.id}" && file_date >= "${todayStr} 00:00:00" && file_date <= "${todayStr} 23:59:59"`,
                requestKey: null
            });

            const counts: Record<string, number> = {};
            definitions.forEach(s => counts[s.title] = 0);
            let hoursSum = 0;

            records.forEach(record => {
                if (Array.isArray(record.data)) {
                    record.data.forEach((task: any) => {
                        const status = task.status?.trim();
                        if (definitions.some(d => d.title === status)) {
                            counts[status] = (counts[status] || 0) + 1;
                        }
                        const hours = Number(task.time_spent);
                        if (!isNaN(hours)) hoursSum += hours;
                    });
                }
            });

            setStats(counts);
            setTotalHoursSpent(hoursSum);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

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
                                    <td style={{padding: '3px 0', color: 'var(--text-main)', textAlign: 'right', fontWeight: 700, fontSize: '1.1rem', paddingTop: '4px'}}>{statusList.reduce((acc, s) => acc + (stats[s.title] || 0), 0)}</td>
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
