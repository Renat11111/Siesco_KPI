import React, { useEffect, useState } from 'react';
import { translations, Language } from '../lib/translations';
import pb from '../lib/pocketbase';
import DailyComparisonChart from './DailyComparisonChart';
import ColleagueRankingChart from './ColleagueRankingChart';
import YearlyRankingChart from './YearlyRankingChart';

interface AnalyticsViewProps {
    lang: Language;
}

function ReturnedTasksCard({ lang }: { lang: Language }) {
    const t = translations[lang];
    const [tasks, setTasks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchTasks = async () => {
            const user = pb.authStore.record;
            if (!user?.id) return;
            
            const now = new Date();
            const start = new Date(now.getFullYear(), now.getMonth(), 1);
            const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

            try {
                const res = await pb.send('/api/kpi/returned-tasks', {
                    params: {
                        start: start.toISOString(),
                        end: end.toISOString(),
                        user: user.id
                    }
                });
                setTasks(res);
            } catch (e) {
                console.error("Failed to fetch returned tasks", e);
            } finally {
                setLoading(false);
            }
        };

        fetchTasks();

        // Realtime subscription
        pb.collection('tasks').subscribe('*', (e) => {
            const user = pb.authStore.record;
            if (user && e.record && e.record.user === user.id) {
                fetchTasks();
            }
        });

        return () => {
            pb.collection('tasks').unsubscribe('*');
        };
    }, []);

    // Helper for date formatting
    const formatDate = (dateStr: string) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleDateString(
            lang === 'ru' ? 'ru-RU' : (lang === 'az' ? 'az-Latn-AZ' : 'en-US')
        );
    };

    if (loading && tasks.length === 0) return null; // Or skeleton

    return (
        <div className="dashboard-card" style={{marginTop: '0'}}>
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem'}}>
                <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                    <div style={{padding: '6px', background: '#fff1f2', borderRadius: '6px', color: '#e11d48'}}>
                        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                    </div>
                    <h3 style={{margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)'}}>
                        {t.returnedTasksTitle}
                    </h3>
                </div>
                <span style={{
                    backgroundColor: tasks.length > 0 ? '#ffe4e6' : '#f1f5f9', 
                    color: tasks.length > 0 ? '#e11d48' : '#64748b',
                    padding: '2px 8px', 
                    borderRadius: '12px', 
                    fontSize: '0.85rem', 
                    fontWeight: 700
                }}>
                    {tasks.length}
                </span>
            </div>

            {tasks.length === 0 ? (
                <div style={{padding: '1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem'}}>
                    {t.noTasks || "No tasks"}
                </div>
            ) : (
                <div style={{overflowX: 'auto'}}>
                    <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem'}}>
                        <thead>
                            <tr style={{borderBottom: '1px solid #e2e8f0'}}>
                                <th style={{textAlign: 'left', padding: '8px', color: '#64748b', fontWeight: 600}}>{t.colTaskNum}</th>
                                <th style={{textAlign: 'left', padding: '8px', color: '#64748b', fontWeight: 600}}>{t.colProject}</th>
                                <th style={{textAlign: 'left', padding: '8px', color: '#64748b', fontWeight: 600}}>{t.colDate}</th>
                                <th style={{textAlign: 'left', padding: '8px', color: '#64748b', fontWeight: 600}}>{t.colDesc}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tasks.map((task, i) => (
                                <tr key={i} style={{borderBottom: '1px solid #f8fafc'}}>
                                    <td style={{padding: '8px', fontWeight: 500}}>{task.task_number}</td>
                                    <td style={{padding: '8px'}}>{task.project}</td>
                                    <td style={{padding: '8px', whiteSpace: 'nowrap', color: '#64748b'}}>
                                        {formatDate(task.source_file_date || task.date)}
                                    </td>
                                    <td style={{padding: '8px', maxWidth: '300px'}}>
                                        <div style={{
                                            whiteSpace: 'nowrap', 
                                            overflow: 'hidden', 
                                            textOverflow: 'ellipsis'
                                        }} title={task.description}>
                                            {task.description}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

export default function AnalyticsView({ lang }: AnalyticsViewProps) {
    const t = translations[lang];

    return (
        <div className="analytics-container animate-fade-in">
             <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', paddingBottom: '2rem' }}>
                <DailyComparisonChart lang={lang} refreshTrigger={0} />
                <ReturnedTasksCard lang={lang} />
                <ColleagueRankingChart lang={lang} />
                <YearlyRankingChart lang={lang} />
             </div>
        </div>
    );
}
