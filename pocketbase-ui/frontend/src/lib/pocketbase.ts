import PocketBase, { ClientResponseError, BaseAuthStore } from 'pocketbase';

// Используем BaseAuthStore (в памяти) для изоляции сессий в разных окнах Wails
const pb = new PocketBase('http://127.0.0.1:8090', new BaseAuthStore());

// SDK PocketBase автоматически управляет подключением к realtime при вызове subscribe().
// Явный вызов .connect() не требуется и запрещен типизацией (private).

export interface RankingItem {
    user_id: string;
    user_name: string;
    user_email: string;
    total_hours: number;
    completed_tasks: number;
}

export const clearRankingCache = () => {
    // Кэш отключен для стабильности Realtime
};

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

export const handleApiError = (error: any, t: any): string => {
    if (error instanceof ClientResponseError) {
        if (error.status === 401) return t.unauthorizedError || "Unauthorized";
        if (error.status === 403) return t.forbiddenError || "Forbidden";
        if (error.status === 404) return t.notFoundError || "Not Found";
        return error.message;
    }
    return t.genericError || "An unexpected error occurred";
};

export const getActualTasks = async (start: string, end: string, userId?: string): Promise<any[]> => {
    const params: any = { start, end };
    if (userId) params.user = userId;
    return await pb.send<any[]>('/api/kpi/actual-tasks', { params });
};

export const getSetting = async (key: string): Promise<string> => {
    try {
        const record = await pb.collection('settings').getFirstListItem(`key = "${key}"`);
        return record.value;
    } catch (e) {
        return '';
    }
};

export const getUserFiles = async (userId: string, dateStr: string): Promise<{id: string, file_name: string}[]> => {
    const start = `${dateStr} 00:00:00`;
    const end = `${dateStr} 23:59:59`;
    try {
        const records = await pb.collection('tasks').getList(1, 50, {
            filter: `user = "${userId}" && file_date >= "${start}" && file_date <= "${end}"`,
            fields: 'id,file_name,file_date',
            sort: '-file_date'
        });
        return records.items.map(r => ({ id: r.id, file_name: r.file_name }));
    } catch (e) {
        return [];
    }
};

export default pb;