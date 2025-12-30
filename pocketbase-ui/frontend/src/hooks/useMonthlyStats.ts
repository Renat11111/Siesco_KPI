import { useState, useEffect } from 'react';
import pb from '../lib/pocketbase';

export const useMonthlyStats = (refreshTrigger: number) => {
    const [monthlyHours, setMonthlyHours] = useState(0);
    const [loading, setLoading] = useState(false);

    const fetchMonthly = async () => {
        const user = pb.authStore.record;
        if (!user) return;
        setLoading(true);
        try {
            const now = new Date();
            const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().replace('T', ' ').split('.')[0];
            const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString().replace('T', ' ').split('.')[0];

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
            setMonthlyHours(sum);
        } catch (e) { console.error(e); } finally { setLoading(false); }
    };

    useEffect(() => { fetchMonthly(); }, [refreshTrigger, pb.authStore.record?.id]);

    return { monthlyHours, loading };
};
