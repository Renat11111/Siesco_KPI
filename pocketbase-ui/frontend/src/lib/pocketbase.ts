import PocketBase from 'pocketbase';

const pb = new PocketBase('http://127.0.0.1:8090');

export interface RankingItem {
    user_id: string;
    user_name: string;
    user_email: string;
    total_hours: number;
    completed_tasks: number;
}

export const getMonthlyRanking = async (month: string): Promise<RankingItem[]> => {
    return await pb.send<RankingItem[]>('/api/kpi/ranking', {
        params: { month }
    });
};

export const getYearlyRanking = async (year: string): Promise<RankingItem[]> => {
    return await pb.send<RankingItem[]>('/api/kpi/yearly-ranking', {
        params: { year }
    });
};

export const getActualTasks = async (start: string, end: string, userId?: string): Promise<any[]> => {
    const params: any = { start, end };
    if (userId) params.user = userId;
    
    return await pb.send<any[]>('/api/kpi/actual-tasks', {
        params
    });
};

export const getUserFiles = async (userId: string, dateStr: string): Promise<{id: string, file_name: string}[]> => {
    const start = new Date(dateStr);
    start.setHours(0,0,0,0);
    const end = new Date(dateStr);
    end.setHours(23,59,59,999);

    try {
        const records = await pb.collection('tasks').getList(1, 50, {
            filter: `user = "${userId}" && file_date >= "${start.toISOString()}" && file_date <= "${end.toISOString()}"`,
            fields: 'id,file_name,file_date',
            sort: '-file_date'
        });
        return records.items.map(r => ({ id: r.id, file_name: r.file_name }));
    } catch (e) {
        console.error("Error fetching user files", e);
        return [];
    }
};

export default pb;
