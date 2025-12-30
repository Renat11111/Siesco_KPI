import { useState, useEffect, useCallback } from 'react';
import pb, { getActualTasks, clearRankingCache } from '../lib/pocketbase';
import { Task, TaskField, Status } from '../types/tasks';
import { translations } from '../lib/translations';

export const useTaskListConfig = () => {
    const [fields, setFields] = useState<TaskField[]>([]);
    const [statuses, setStatuses] = useState<Status[]>([]);

    useEffect(() => {
        const loadConfig = async () => {
            try {
                const [fRes, sRes] = await Promise.all([
                    pb.collection('task_fields').getFullList({ sort: 'order', requestKey: 'fields_cfg' }),
                    pb.collection('statuses').getFullList({ requestKey: 'statuses_cfg' })
                ]);
                setFields(fRes.map((r: any) => ({
                    key: r.key, title: r.title, type: r.type, width: r.width || 'auto', filterable: r.filterable ?? true, order: r.order || 0
                })).sort((a, b) => a.order - b.order));
                setStatuses(sRes.map((r: any) => ({ title: r.title, slug: r.slug, color: r.color })));
            } catch (e: any) { if (!e.isAbort) console.error("Config load error", e); }
        };
        loadConfig();
    }, []);
    return { fields, statuses };
};

export const useTaskListData = (lang: 'ru' | 'en' | 'az') => {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const t = translations[lang];

    const fetchTasks = useCallback(async (params: {
        start: string, end: string, userId: string, unfinishedMode: boolean, groupedCompletedMode: boolean
    }) => {
        const { start, end, userId, unfinishedMode, groupedCompletedMode } = params;
        if (!start || !end || !userId) return;

        setLoading(true); setError('');
        try {
            const fStart = `${start} 00:00:00`;
            const fEnd = `${end} 23:59:59`;
            let result: Task[] = [];

            if (unfinishedMode) {
                result = await getActualTasks(fStart, fEnd, userId);
            } else if (groupedCompletedMode) {
                result = await pb.send('/api/kpi/completed-tasks-grouped', {
                    params: { start: fStart, end: fEnd, user: userId },
                    requestKey: null
                });
            } else {
                const records = await pb.collection('tasks').getFullList({
                    filter: `user = "${userId}" && file_date >= "${fStart}" && file_date <= "${fEnd}"`,
                    sort: '-file_date',
                    requestKey: null
                });
                records.forEach(record => {
                    if (Array.isArray(record.data)) {
                        record.data.forEach((item: any) => {
                            result.push({
                                ...item,
                                source_file_date: record.file_date,
                                source_file_id: record.id
                            });
                        });
                    }
                });
            }
            setTasks(result);
        } catch (err: any) {
            if (!err.isAbort) {
                console.error("Fetch tasks error:", err);
                setError(err.message || t.genericError);
            }
        } finally { setLoading(false); }
    }, [t.genericError]);

    const updateTaskTime = async (task: Task, newVal: number) => {
        if (!task.source_file_id || !task.task_number) throw new Error("Missing context");
        await pb.send('/api/kpi/update-task-time', {
            method: 'POST',
            body: { record_id: task.source_file_id, task_number: task.task_number, new_time: newVal }
        });
        clearRankingCache();
    };

    return { tasks, loading, error, fetchTasks, updateTaskTime, setTasks };
};