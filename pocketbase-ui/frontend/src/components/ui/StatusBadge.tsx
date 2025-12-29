import React from 'react';

const getStatusConfig = (status: number | string) => {
    const statusStr = String(status);
    const base = {
        padding: '2px 10px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: 700,
        display: 'inline-block',
        whiteSpace: 'nowrap' as const
    };

    switch (statusStr) {
        case '1': return { label: 'Новая', style: { ...base, background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' } };
        case '2': return { label: 'Ждет выполнения', style: { ...base, background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' } };
        case '3': return { label: 'Выполняется', style: { ...base, background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' } };
        case '4': return { label: 'Ожидает контроля', style: { ...base, background: '#f3e8ff', color: '#7e22ce', border: '1px solid #d8b4fe' } };
        case '5': return { label: 'Завершена', style: { ...base, background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0' } };
        case '6': return { label: 'Отложена', style: { ...base, background: '#fff7ed', color: '#9a3412', border: '1px solid #ffedd5' } };
        case '7': return { label: 'Возвращена', style: { ...base, background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca' } };
        case '-1': return { label: 'Просрочена', style: { ...base, background: '#7f1d1d', color: '#ffffff', border: '1px solid #991b1b' } };
        default: return { label: statusStr, style: { ...base, background: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb' } };
    }
};

export const StatusBadge = ({ status }: { status: number | string }) => {
    const config = getStatusConfig(status);
    return <span style={config.style}>{config.label}</span>;
};

// Экспортируем helper, так как он нужен для селектов фильтров
export { getStatusConfig };
