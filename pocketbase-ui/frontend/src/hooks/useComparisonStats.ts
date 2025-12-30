import { useState, useEffect } from 'react';
import pb from '../lib/pocketbase';

export const useComparisonStats = (refreshTrigger: number) => {
    const [prevMonthHours, setPrevMonthHours] = useState(0);
    const [loading, setLoading] = useState(false);

    const fetchPrevMonth = async () => {
        const user = pb.authStore.record;
        if (!user) return;
        setLoading(true);
        try {
            const now = new Date();
            const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const start = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-01 00:00:00`;
            const end = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${new Date(prev.getFullYear(), prev.getMonth() + 1, 0).getDate()} 23:59:59`;

            const records = await pb.collection('tasks').getFullList({
                filter: `user = "${user.id}" && file_date >= "${start}" && file_date <= "${end}"`,
                fields: 'data'
            });

            let sum = 0;
            records.forEach(r => {
                if (Array.isArray(r.data)) {
                    r.data.forEach((t: any) => sum += (Number(t.time_spent) || 0));
                }
            });
            setPrevMonthHours(sum);
        } catch (e) { console.error(e); } finally { setLoading(false); }
    };

    useEffect(() => { fetchPrevMonth(); }, [refreshTrigger, pb.authStore.record?.id]);

    return { prevMonthHours, loading };
};
