import { useState, useEffect } from 'react';
import pb from '../lib/pocketbase';
import { getColor } from '../lib/colors';
import { calculateTotalHours } from '../lib/logic';

export interface StatusDefinition {
    title: string;
    color: string;
}

export const useDailyStats = (refreshTrigger: number) => {
    const [stats, setStats] = useState<Record<string, number>>({});
    const [totalHoursSpent, setTotalHoursSpent] = useState<number>(0); 
    const [loading, setLoading] = useState(false);
    const [statusList, setStatusList] = useState<StatusDefinition[]>([]);

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
                    hoursSum += calculateTotalHours(record.data);
                    record.data.forEach((task: any) => {
                        const status = task.status?.trim();
                        if (definitions.some(d => d.title === status)) {
                            counts[status] = (counts[status] || 0) + 1;
                        }
                    });
                }
            });

            setStats(counts);
            setTotalHoursSpent(hoursSum);
        } catch (err) {
            console.error("Daily stats fetch error:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDailyStats();

        let unsubTasks: () => void;
        let unsubGlobal: () => void;

        const setup = async () => {
            const currentUser = pb.authStore.record;
            unsubTasks = await pb.collection('tasks').subscribe('*', (e) => {
                if (currentUser && e.record && e.record.user === currentUser.id) {
                    fetchDailyStats();
                }
            });

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

    const totalCount = statusList.reduce((acc, s) => acc + (stats[s.title] || 0), 0);

    return {
        stats,
        totalHoursSpent,
        loading,
        statusList,
        totalCount,
        refresh: fetchDailyStats
    };
};
