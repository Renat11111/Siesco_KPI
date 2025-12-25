import { useState, useMemo } from 'react';
import { TaskField, Status } from '../lib/SettingsContext';

interface Task {
    [key: string]: any;
}

export const useTaskFilters = (tasks: Task[], fields: TaskField[], statuses: Status[], lang: string) => {
    // Состояние фильтров: ключ поля -> значение
    const [filters, setFilters] = useState<Record<string, string>>({});
    
    // Состояние открытых выпадающих списков
    const [openDropdowns, setOpenDropdowns] = useState<Record<string, boolean>>({});

    const handleFilterChange = (key: string, value: string) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const toggleStatusFilter = (key: string, slug: string) => {
        setFilters(prev => {
            const currentStr = prev[key] || '';
            let current = currentStr ? currentStr.split(',') : [];
            
            if (current.includes(slug)) {
                current = current.filter(s => s !== slug);
            } else {
                current.push(slug);
            }
            
            const newVal = current.join(',');
            if (!newVal) {
                const { [key]: _, ...rest } = prev;
                return rest;
            }
            return { ...prev, [key]: newVal };
        });
    };

    const clearFilters = () => {
        setFilters({});
        setOpenDropdowns({});
    };

    const toggleDropdown = (key: string) => {
        setOpenDropdowns(prev => ({ ...prev, [key]: !prev[key] }));
    };

    // Мемоизированная фильтрация задач
    const filteredTasks = useMemo(() => {
        return tasks.filter(task => {
            return fields.every(field => {
                const filterVal = filters[field.key];
                if (!filterVal) return true;

                const taskVal = task[field.key];
                if (taskVal === null || taskVal === undefined) return false;

                const strVal = String(taskVal).toLowerCase();

                if (field.type === 'select' || field.key === 'status') {
                    const selectedSlugs = filterVal.split(',');
                    const currentVal = String(taskVal).trim().toLowerCase();
                    
                    const validValues = selectedSlugs.flatMap(slug => {
                        const s = statuses.find(st => st.slug === slug);
                        return s ? [slug.toLowerCase(), s.title.toLowerCase()] : [slug.toLowerCase()];
                    });

                    return validValues.includes(currentVal);
                }

                if (field.type === 'date') {
                    try {
                        const displayedDate = new Date(taskVal).toLocaleDateString(
                            lang === 'ru' ? 'ru-RU' : (lang === 'az' ? 'az-Latn-AZ' : 'en-US')
                        );
                        return displayedDate.includes(filterVal);
                    } catch (e) {
                        return false;
                    }
                }
                
                return strVal.includes(filterVal.toLowerCase());
            });
        });
    }, [tasks, filters, fields, lang, statuses]);

    // Мемоизированный подсчет итогов
    const totals = useMemo(() => {
        const acc: Record<string, number> = {};
        fields.forEach(f => {
            if (f.type === 'number') acc[f.key] = 0;
        });

        filteredTasks.forEach(task => {
            fields.forEach(f => {
                if (f.type === 'number') {
                    const val = parseFloat(task[f.key]);
                    if (!isNaN(val)) acc[f.key] += val;
                }
            });
        });
        return acc;
    }, [filteredTasks, fields]);

    return {
        filters,
        setFilters,
        handleFilterChange,
        toggleStatusFilter,
        clearFilters,
        openDropdowns,
        setOpenDropdowns,
        toggleDropdown,
        filteredTasks,
        totals
    };
};
