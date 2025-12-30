import { TranslationKeys } from './translations';

/**
 * Валидация дат отгула
 */
export function validateLeaveDates(startDate: string, endDate: string, t: TranslationKeys): string | null {
    if (!startDate || !endDate) return null;
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    const startCheck = new Date(startDate);
    startCheck.setHours(0, 0, 0, 0);

    if (startCheck < now) {
        return t.errorPastDate;
    }
    if (end < start) {
        return t.errorEndDate;
    }
    return null;
}

interface BasicLeaveRequest {
    start_date: string;
    end_date: string;
    status: string;
    user: string;
}

/**
 * Проверка на пересечение дат отгулов
 */
export function checkLeaveOverlap(
    startDate: string,
    endDate: string,
    requests: BasicLeaveRequest[],
    currentUserId: string
): boolean {
    const start = new Date(startDate);
    const end = new Date(endDate);

    return requests.some(req => {
        if (req.status === 'rejected') return false;
        if (req.user !== currentUserId) return false;
        
        const reqStart = new Date(req.start_date);
        const reqEnd = new Date(req.end_date);
        
        // Пересечение: (StartA <= EndB) и (EndA >= StartB)
        return (start <= reqEnd && end >= reqStart);
    });
}

/**
 * Расчет суммы часов из массива задач
 */
export function calculateTotalHours(tasks: any[]): number {
    return tasks.reduce((sum, task) => {
        const hours = Number(task.time_spent);
        return sum + (isNaN(hours) ? 0 : hours);
    }, 0);
}
