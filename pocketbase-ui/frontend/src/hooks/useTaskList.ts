import { useState, useEffect, useCallback } from 'react';
import pb, { getActualTasks, clearRankingCache } from '../lib/pocketbase';
import { Task, TaskField, Status, User } from '../types/tasks';
import { translations } from '../lib/translations';

export const useTaskListConfig = () => {
    const [fields, setFields] = useState<TaskField[]>([]);
    const [statuses, setStatuses] = useState<Status[]>([]);

    useEffect(() => {
        const loadConfig = async () => {
            try {
                const fieldsRes = await pb.collection('task_fields').getFullList({ sort: 'order', requestKey: null });
                const mappedFields: TaskField[] = fieldsRes.map((r: any) => ({
                    key: r.key,
                    title: r.title,
                    type: r.type,
                    width: r.width || 'auto',
                    filterable: r.filterable ?? true,
                    order: r.order || 0
                }));
                mappedFields.sort((a, b) => a.order - b.order);
                setFields(mappedFields);

                const statusesRes = await pb.collection('statuses').getFullList({ requestKey: null });
                const mappedStatuses: Status[] = statusesRes.map((r: any) => ({
                    title: r.title,
                    slug: r.slug,
                    color: r.color
                }));
                setStatuses(mappedStatuses);
            } catch (e: any) {
                if (e.isAbort) return; // Ignore abort errors
                console.error("Failed to load config", e);
            }
        };
        loadConfig();
    }, []);

    return { fields, statuses };
};

export const useTaskListData = (lang: 'ru' | 'en' | 'az', initialUser: string) => {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const t = translations[lang];

    const fetchTasks = useCallback(async (params: {
        start: string,
        end: string,
        userId: string,
        unfinishedMode: boolean,
        groupedCompletedMode: boolean
    }) => {
        const { start, end, userId, unfinishedMode, groupedCompletedMode } = params;
        if (!start || !end || !userId) return;

        setLoading(true);
        setError('');
        try {
            const filterStartDate = `${start} 00:00:00`;
            const filterEndDate = `${end} 23:59:59`;

            if (unfinishedMode) {
                const actualTasks = await getActualTasks(filterStartDate, filterEndDate, userId);
                setTasks(actualTasks);
            } else if (groupedCompletedMode) {
                const groupedTasks = await pb.send('/api/kpi/completed-tasks-grouped', {
                    params: { start: filterStartDate, end: filterEndDate, user: userId }
                });
                setTasks(groupedTasks);
            } else {
                const filter = `user = "${userId}" && file_date >= "${filterStartDate}" && file_date <= "${filterEndDate}"`;
                const records = await pb.collection('tasks').getFullList({
                    filter: filter,
                    sort: '-file_date',
                    requestKey: null,
                });

                let aggregatedTasks: Task[] = [];
                records.forEach(record => {
                    const tasksInFile = record.data; 
                    if (Array.isArray(tasksInFile)) {
                        tasksInFile.forEach((t: any) => {
                            aggregatedTasks.push({
                                ...t,
                                source_file_date: record.file_date,
                                source_file_id: record.id
                            });
                        });
                    }
                });
                setTasks(aggregatedTasks);
            }
        } catch (err: any) {
            console.error("Error fetching tasks:", err);
            setError(err.message || t.genericError);
        } finally {
            setLoading(false);
        }
    }, [t.genericError]);

    const updateTaskTime = async (task: Task, newVal: number) => {
        if (!task.source_file_id || !task.task_number) throw new Error("Missing ID context");
        
        await pb.send('/api/kpi/update-task-time', {
            method: 'POST',
            body: {
                record_id: task.source_file_id,
                task_number: task.task_number,
                new_time: newVal
            }
        });
        clearRankingCache();
    };

    return { tasks, loading, error, fetchTasks, updateTaskTime, setTasks };
};