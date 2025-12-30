import React, { useEffect, useState } from 'react';
import { translations, Language } from '../lib/translations';
import pb from '../lib/pocketbase';
import { Badge } from './ui/Badge';
import { Card } from './ui/Card';

interface ReturnedTasksCardProps {
    lang: Language;
}

export default function ReturnedTasksCard({ lang }: ReturnedTasksCardProps) {
    const t = translations[lang];
    const [tasks, setTasks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const thStyle: React.CSSProperties = {
        textAlign: 'left',
        padding: '8px',
        color: '#64748b',
        fontWeight: 600,
        borderBottom: '1px solid #e2e8f0'
    };

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
                    },
                    requestKey: null // Отключаем авто-отмену для стабильности
                });
                setTasks(res);
            } catch (e: any) {
                if (!e.isAbort) console.error("Failed to fetch returned tasks", e);
            } finally {
                setLoading(false);
            }
        };

        fetchTasks();

        // Realtime подписка
        let unsub: any;
        const setup = async () => {
            const user = pb.authStore.record;
            if (!user?.id) return;
            
            unsub = await pb.collection('tasks').subscribe('*', (e) => {
                if (user && e.record && e.record.user === user.id) {
                    fetchTasks();
                }
            });
        };
        setup();

        return () => { if (unsub) unsub(); };
    }, []);

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleDateString(
            lang === 'ru' ? 'ru-RU' : (lang === 'az' ? 'az-Latn-AZ' : 'en-US')
        );
    };

    if (loading && tasks.length === 0) return null;

    const cardTitle = (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{padding: '6px', background: '#fff1f2', borderRadius: '6px', color: '#e11d48', display: 'flex'}}>
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
            </div>
            <h3 style={{margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)'}}>
                {t.returnedTasksTitle}
            </h3>
        </div>
    );

    return (
        <Card 
            title={cardTitle}
            extra={<Badge color={tasks.length > 0 ? 'red' : 'gray'}>{tasks.length}</Badge>}
        >
            {tasks.length === 0 ? (
                <div style={{padding: '1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem'}}>
                    {t.noTasks}
                </div>
            ) : (
                <div style={{overflowX: 'auto'}}>
                    <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem'}}>
                        <thead>
                            <tr>
                                <th style={thStyle}>{t.colTaskNum}</th>
                                <th style={thStyle}>{t.colProject}</th>
                                <th style={thStyle}>{t.colDate}</th>
                                <th style={thStyle}>{t.colDesc}</th>
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
        </Card>
    );
}
