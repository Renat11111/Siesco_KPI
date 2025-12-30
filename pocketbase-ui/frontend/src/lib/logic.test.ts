import { describe, it, expect } from 'vitest';
import { validateLeaveDates, checkLeaveOverlap, calculateTotalHours } from './logic';
import { translations } from './translations';

const t = translations.ru;

describe('Logic Utils', () => {
    
    describe('validateLeaveDates', () => {
        it('should return error for past date', () => {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const dateStr = yesterday.toISOString().split('T')[0];
            
            expect(validateLeaveDates(dateStr, dateStr, t)).toBe(t.errorPastDate);
        });

        it('should return error if end date is before start date', () => {
            const today = new Date().toISOString().split('T')[0];
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];

            expect(validateLeaveDates(today, yesterdayStr, t)).toBe(t.errorEndDate);
        });

        it('should return null for valid future dates', () => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowStr = tomorrow.toISOString().split('T')[0];
            
            const nextWeek = new Date();
            nextWeek.setDate(nextWeek.getDate() + 7);
            const nextWeekStr = nextWeek.toISOString().split('T')[0];

            expect(validateLeaveDates(tomorrowStr, nextWeekStr, t)).toBe(null);
        });
    });

    describe('checkLeaveOverlap', () => {
        const userId = 'user123';
        const existingRequests = [
            { start_date: '2025-01-10', end_date: '2025-01-15', status: 'approved', user: userId },
            { start_date: '2025-01-20', end_date: '2025-01-25', status: 'rejected', user: userId },
        ];

        it('should detect overlap with approved request', () => {
            expect(checkLeaveOverlap('2025-01-12', '2025-01-13', existingRequests, userId)).toBe(true);
            expect(checkLeaveOverlap('2025-01-09', '2025-01-11', existingRequests, userId)).toBe(true);
            expect(checkLeaveOverlap('2025-01-14', '2025-01-16', existingRequests, userId)).toBe(true);
        });

        it('should not detect overlap with rejected request', () => {
            expect(checkLeaveOverlap('2025-01-21', '2025-01-22', existingRequests, userId)).toBe(false);
        });

        it('should not detect overlap with other users request', () => {
            expect(checkLeaveOverlap('2025-01-12', '2025-01-13', existingRequests, 'other_user')).toBe(false);
        });

        it('should not detect overlap for non-overlapping dates', () => {
            expect(checkLeaveOverlap('2025-01-01', '2025-01-05', existingRequests, userId)).toBe(false);
            expect(checkLeaveOverlap('2025-01-16', '2025-01-19', existingRequests, userId)).toBe(false);
        });
    });

    describe('calculateTotalHours', () => {
        it('should sum hours correctly', () => {
            const tasks = [
                { time_spent: 2.5 },
                { time_spent: '3' },
                { time_spent: 1 },
                { time_spent: 'abc' }, // invalid
                { time_spent: null }   // invalid
            ];
            expect(calculateTotalHours(tasks)).toBe(6.5);
        });

        it('should return 0 for empty array', () => {
            expect(calculateTotalHours([])).toBe(0);
        });
    });
});
