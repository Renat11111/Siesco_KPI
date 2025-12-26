import PocketBase, { ClientResponseError, BaseAuthStore } from 'pocketbase';

// Используем BaseAuthStore (в памяти), чтобы разные окна Wails 
// не конфликтовали через общее localStorage.
const pb = new PocketBase('http://127.0.0.1:8090', new BaseAuthStore());

export interface RankingItem {
    user_id: string;
    user_name: string;
    user_email: string;
    total_hours: number;
    completed_tasks: number;
}

// Умное кэширование рейтингов
const rankingCache = new Map<string, RankingItem[]>();

export const clearRankingCache = () => {
    console.log("Invalidating ranking cache...");
    rankingCache.clear();
};

export const getMonthlyRanking = async (month: string): Promise<RankingItem[]> => {
    // Disable cache to ensure Realtime updates work perfectly
    // const cacheKey = `monthly_${month}`;
    // if (rankingCache.has(cacheKey)) {
    //     return rankingCache.get(cacheKey)!;
    // }

    const data = await pb.send<RankingItem[]>('/api/kpi/ranking', {
        params: { month }
    });
    
    // rankingCache.set(cacheKey, data);
    return data;
};

export const getYearlyRanking = async (year: string): Promise<RankingItem[]> => {
    // Disable cache
    // const cacheKey = `yearly_${year}`;
    // if (rankingCache.has(cacheKey)) {
    //     return rankingCache.get(cacheKey)!;
    // }

    const data = await pb.send<RankingItem[]>('/api/kpi/yearly-ranking', {
        params: { year }
    });

    // rankingCache.set(cacheKey, data);
    return data;
};

// Унифицированный обработчик ошибок API
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