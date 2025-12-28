import { useEffect, useState, useMemo } from 'react';
import pb, { getActualTasks, clearRankingCache } from '../lib/pocketbase';
import { translations, Language } from '../lib/translations';
import { getColor } from '../lib/colors';

interface TaskField {
    key: string;
    title: string;
    type: string;
    width: string;
    filterable: boolean;
    order: number; // Added order
}

interface Status {
    title: string;
    slug: string;
    color: string;
}

interface User {
    id: string;
    name: string;
    email: string;
}

// Use a flexible record for tasks since fields are dynamic
type Task = Record<string, any> & {
    source_file_date?: string;
    source_file_id?: string;
};

interface TaskListProps {
    lang: Language;
}

export default function TaskList({ lang }: TaskListProps) {
    const t = translations[lang];

    const [tasks, setTasks] = useState<Task[]>([]);
    const [fields, setFields] = useState<TaskField[]>([]);
    const [statuses, setStatuses] = useState<Status[]>([]);
    
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    
    // Dynamic filters for each field: key -> value
    const [filters, setFilters] = useState<Record<string, string>>({});
    
    // State to manage open/close of multi-select dropdowns
    const [openDropdowns, setOpenDropdowns] = useState<Record<string, boolean>>({});

    // --- Admin/Coordinator Logic ---
    const [isAdminOrCoordinator, setIsAdminOrCoordinator] = useState(false);
    const [users, setUsers] = useState<User[]>([]);
    const [selectedUserId, setSelectedUserId] = useState<string>('');
    const [showUnfinishedOnly, setShowUnfinishedOnly] = useState(false);
    const [showGroupedCompleted, setShowGroupedCompleted] = useState(false);

    useEffect(() => {
        const checkUserRole = async () => {
             const user = pb.authStore.record;
             if (user) {
                 setSelectedUserId(user.id); // Default to self
                 if (user.superadmin || user.is_coordinator) {
                     setIsAdminOrCoordinator(true);
                     try {
                         const allUsers = await pb.collection('users').getFullList({
                             sort: 'name',
                             requestKey: null
                         });
                         setUsers(allUsers.map(u => ({ id: u.id, name: u.name, email: u.email })));
                     } catch (e) {
                         console.error("Failed to load users list", e);
                     }
                 }
             }
        };

        checkUserRole();
        loadConfig();
        
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        
        const formatDate = (d: Date) => {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };
        
        const initialStartDate = formatDate(start);
        const initialEndDate = formatDate(end);

        setStartDate(initialStartDate);
        setEndDate(initialEndDate);
        
        fetchTasks(initialStartDate, initialEndDate, pb.authStore.record?.id, false, false); // Default to history mode
    }, []);

    // Realtime Subscription
    useEffect(() => {
        const setup = async () => {
            const targetUser = selectedUserId || pb.authStore.record?.id;
            
            // Подписка на задачи
            await pb.collection('tasks').subscribe('*', (e) => {
                if (targetUser && e.record && e.record.user === targetUser) {
                    fetchTasks(startDate, endDate, selectedUserId, showUnfinishedOnly, showGroupedCompleted);
                }
            });

            // Подписка на глобальный сигнал
            await pb.collection('ranking_updates').subscribe('*', () => {
                fetchTasks(startDate, endDate, selectedUserId, showUnfinishedOnly, showGroupedCompleted);
            });
        };

        setup();

        return () => {
            // Оставляем подписки живыми для стабильности в Wails
        };
    }, [selectedUserId, startDate, endDate, showUnfinishedOnly, showGroupedCompleted]);

    const loadConfig = async () => {
        try {
            const fieldsRes = await pb.collection('task_fields').getFullList({ sort: 'order' });
            // Map the response to our interface
            const mappedFields: TaskField[] = fieldsRes.map((r: any) => ({
                key: r.key,
                title: r.title,
                type: r.type,
                width: r.width || 'auto',
                filterable: r.filterable ?? true,
                order: r.order || 0
            }));

            // Sort fields by order defined in config/DB
            mappedFields.sort((a, b) => a.order - b.order);

            setFields(mappedFields);

            const statusesRes = await pb.collection('statuses').getFullList();
            const mappedStatuses: Status[] = statusesRes.map((r: any) => ({
                title: r.title,
                slug: r.slug,
                color: r.color
            }));
            setStatuses(mappedStatuses);

        } catch (e) {
            console.error("Failed to load config", e);
        }
    };

    const fetchTasks = async (start = startDate, end = endDate, userIdOverride?: string, unfinishedMode = showUnfinishedOnly, groupedCompletedMode = showGroupedCompleted) => {
        if (!start || !end) return;
        
        const targetUserId = userIdOverride || selectedUserId || pb.authStore.record?.id;
        if (!targetUserId) return;

        setLoading(true);
        setError('');
        setTasks([]);

        try {
            // Формат даты для бэкенда
            const filterStartDate = `${start} 00:00:00`;
            const filterEndDate = `${end} 23:59:59`;

            if (unfinishedMode) {
                // Use Custom API for Actual Unfinished Tasks
                const actualTasks = await getActualTasks(filterStartDate, filterEndDate, targetUserId);
                setTasks(actualTasks);
            } else if (groupedCompletedMode) {
                // Use Custom API for Grouped Completed Tasks
                const groupedTasks = await pb.send('/api/kpi/completed-tasks-grouped', {
                    params: {
                        start: filterStartDate,
                        end: filterEndDate,
                        user: targetUserId
                    }
                });
                setTasks(groupedTasks);
            } else {
                // Use Standard API for History
                const filter = `user = "${targetUserId}" && file_date >= "${filterStartDate}" && file_date <= "${filterEndDate}"`;

                const records = await pb.collection('tasks').getFullList({
                    filter: filter,
                    sort: '-file_date',
                    requestKey: null,
                });

                let aggregatedTasks: Task[] = [];

                records.forEach(record => {
                    const tasksInFile = record.data; 
                    
                    if (Array.isArray(tasksInFile)) {
                        tasksInFile.forEach((t: any) => {
                            const task: Task = {
                                ...t,
                                source_file_date: record.file_date,
                                source_file_id: record.id
                            };
                            aggregatedTasks.push(task);
                        });
                    }
                });

                setTasks(aggregatedTasks);
            }

        } catch (err: any) {
            console.error("Error fetching tasks:", err);
            setError(err.message || t.genericError);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        fetchTasks(startDate, endDate);
    };

    const toggleUnfinishedMode = () => {
        const newUnfinished = !showUnfinishedOnly;
        setShowUnfinishedOnly(newUnfinished);
        if (newUnfinished) setShowGroupedCompleted(false); // Mutual exclusion
        fetchTasks(startDate, endDate, undefined, newUnfinished, false);
    };

    const toggleGroupedCompletedMode = () => {
        const newGrouped = !showGroupedCompleted;
        setShowGroupedCompleted(newGrouped);
        if (newGrouped) setShowUnfinishedOnly(false); // Mutual exclusion
        fetchTasks(startDate, endDate, undefined, false, newGrouped);
    };

    // Handler for user dropdown change
    const handleUserChange = (newUserId: string) => {
        setSelectedUserId(newUserId);
        fetchTasks(startDate, endDate, newUserId);
    };

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
            // If empty, remove key to keep state clean
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
        setOpenDropdowns(prev => {
            return { ...prev, [key]: !prev[key] };
        });
    };

    // Filter tasks client-side based on per-field filters
    const filteredTasks = useMemo(() => {
        return tasks.filter(task => {
            return fields.every(field => {
                const filterVal = filters[field.key];
                if (!filterVal) return true; // No filter set for this field

                const taskVal = task[field.key];
                // If filter is set but value is missing, exclude it
                if (taskVal === null || taskVal === undefined) return false;

                const strVal = String(taskVal).toLowerCase();

                if (field.type === 'select' || field.key === 'status') {
                    // Multi-select logic: check if task value matches Slug OR Title
                    const selectedSlugs = filterVal.split(',');
                    const currentVal = String(taskVal).trim().toLowerCase();
                    
                    // Build a list of all valid strings (slugs AND titles) for the selected filters
                    const validValues = selectedSlugs.flatMap(slug => {
                        const s = statuses.find(st => st.slug === slug);
                        return s ? [slug.toLowerCase(), s.title.toLowerCase()] : [slug.toLowerCase()];
                    });

                    return validValues.includes(currentVal);
                }

                if (field.type === 'date') {
                    if (!filterVal) return true;
                    try {
                        // Compare against the DISPLAYED date string
                        const displayedDate = new Date(taskVal).toLocaleDateString(
                            lang === 'ru' ? 'ru-RU' : (lang === 'az' ? 'az-Latn-AZ' : 'en-US')
                        );
                        return displayedDate.includes(filterVal);
                    } catch (e) {
                        return false;
                    }
                }
                
                // Partial match for everything else (text, number)
                return strVal.includes(filterVal.toLowerCase());
            });
        });
    }, [tasks, filters, fields, lang, statuses]); 

    // Calculate totals for numeric fields
    const totals = useMemo(() => {
        const acc: Record<string, number> = {};
        fields.forEach(f => {
            if (f.type === 'number') {
                acc[f.key] = 0;
            }
        });

        filteredTasks.forEach(task => {
            fields.forEach(f => {
                if (f.type === 'number') {
                    const val = parseFloat(task[f.key]);
                    if (!isNaN(val)) {
                        acc[f.key] += val;
                    }
                }
            });
        });
        return acc;
    }, [filteredTasks, fields]);

    const handleEditTime = async (task: Task, currentVal: number) => {
        const newValStr = window.prompt(lang === 'ru' ? "Введите новое значение времени (часы):" : "Enter new time value (hours):", String(currentVal));
        if (newValStr === null) return; 
        
        const newVal = parseFloat(newValStr.replace(',', '.')); 
        if (isNaN(newVal)) {
            alert(translations[lang].invalidValue);
            return;
        }

        if (newVal === currentVal) return;

        // If in grouped mode, source_file_id might be from the latest file, which is correct for updating the latest state.
        if (!task.source_file_id || !task.task_number) {
            alert("Error: Missing task ID context");
            return;
        }

        try {
            await pb.send('/api/kpi/update-task-time', {
                method: 'POST',
                body: {
                    record_id: task.source_file_id,
                    task_number: task.task_number,
                    new_time: newVal
                }
            });
            // Clear cache so Analytics tab recalculates immediately
            clearRankingCache();
            // Refresh with current params
            fetchTasks();
        } catch (e: any) {
            console.error(e);
            alert(translations[lang].genericError + ": " + e.message);
        }
    };

    const renderCell = (task: Task, field: TaskField) => {
        const value = task[field.key];

        if (field.type === 'date') {
            if (!value) return '-';
            
            let dateObj: Date;
            // Если это число (например, 46001), конвертируем из формата Excel (сериальное число)
            if (!isNaN(Number(value)) && Number(value) > 40000 && Number(value) < 60000) {
                dateObj = new Date((Number(value) - 25569) * 86400 * 1000);
            } else {
                dateObj = new Date(value);
            }

            if (isNaN(dateObj.getTime())) return String(value);

            return dateObj.toLocaleDateString(
                lang === 'ru' ? 'ru-RU' : (lang === 'az' ? 'az-Latn-AZ' : 'en-US')
            );
        }

        if (field.type === 'select' || field.key === 'status') {
             const valStr = String(value).trim().toLowerCase();
             const statusObj = statuses.find(s => s.slug.toLowerCase() === valStr || s.title.toLowerCase() === valStr);
             
             if (statusObj) {
                 const bgColor = getColor(statusObj.color, 100); 
                 const textColor = getColor(statusObj.color, 700);
                 const borderColor = getColor(statusObj.color, 200);
                 
                 return (
                     <span style={{
                         display: 'inline-flex',
                         alignItems: 'center',
                         justifyContent: 'center',
                         backgroundColor: bgColor,
                         color: textColor,
                         border: `1px solid ${borderColor}`,
                         padding: '4px 10px',
                         minHeight: '24px',
                         borderRadius: '12px',
                         fontWeight: 600,
                         fontSize: '0.75rem',
                         whiteSpace: 'normal',
                         textAlign: 'center',
                         lineHeight: '1.2',
                         boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                     }}>
                         {statusObj.title}
                     </span>
                 );
             }
             return <span style={{color: '#64748b'}}>{value}</span>;
        }

        if (field.key === 'time_spent' && field.type === 'number') {
            return (
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem'}}>
                    <span>{typeof value === 'number' ? value.toFixed(2) : value}</span>
                    {isAdminOrCoordinator && !showGroupedCompleted && (
                        <button 
                            onClick={() => handleEditTime(task, Number(value))}
                            style={{
                                border: 'none',
                                background: 'transparent',
                                cursor: 'pointer',
                                padding: '2px',
                                color: '#3b82f6',
                                display: 'flex',
                                alignItems: 'center'
                            }}
                            title="Edit Time"
                        >
                           <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        </button>
                    )}
                </div>
            );
        }

        if (field.key === 'is_edited') {
            if (value) {
                return (
                    <div style={{display: 'flex', justifyContent: 'center'}}>
                         <span title="Edited" style={{color: '#e11d48', fontWeight: 'bold', fontSize: '1.2rem'}}>•</span>
                    </div>
                );
            }
            return null;
        }

        if (field.type === 'boolean') {
            return value ? 'Yes' : 'No';
        }

        if (field.type === 'number') {
            return <div className="text-right">{typeof value === 'number' ? value.toFixed(2) : value}</div>;
        }

        if (field.type === 'text') {
            if (field.key === 'description') {
                 return <div title={value} style={{whiteSpace: 'normal', minWidth: '250px'}}>{value}</div>
            }
        }

        return value;
    };

    return (
        <div className="task-list-container">
            {/* Click-outside backdrop for dropdowns */}
            {Object.values(openDropdowns).some(Boolean) && (
                <div 
                    style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40}} 
                    onClick={() => setOpenDropdowns({})}
                />
            )}

            {/* Filters Container */}
            <div className="task-filters-wrapper">
                
            {/* 1. Server-Side Filter Card (Dates + User) */}
            <form className="filter-card-dates" onSubmit={handleSearch} style={{marginBottom: '1rem', display: 'flex', alignItems: 'flex-end', gap: '1rem', flexWrap: 'wrap'}}>
                {isAdminOrCoordinator && users.length > 0 && (
                    <div style={{display: 'flex', flexDirection: 'column', gap: '0.25rem'}}>
                        <label className="form-label" style={{marginBottom: 0, whiteSpace: 'nowrap', fontWeight: 600}}>User</label>
                        <select 
                            className="input"
                            value={selectedUserId}
                            onChange={(e) => handleUserChange(e.target.value)}
                            style={{width: '200px', height: '38px'}}
                        >
                            {users.map(u => (
                                <option key={u.id} value={u.id}>
                                    {u.name || u.email}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
                
                <div style={{display: 'flex', flexDirection: 'column', gap: '0.25rem'}}>
                    <label className="form-label" style={{marginBottom: 0, whiteSpace: 'nowrap', fontWeight: 600}}>{t.from}</label>
                    <input 
                        className="input"
                        type="date" 
                        value={startDate} 
                        onChange={(e) => setStartDate(e.target.value)} 
                        required
                        style={{width: '140px'}} 
                    />
                </div>
                <div style={{display: 'flex', flexDirection: 'column', gap: '0.25rem'}}>
                    <label className="form-label" style={{marginBottom: 0, whiteSpace: 'nowrap', fontWeight: 600}}>{t.to}</label>
                    <input 
                        className="input"
                        type="date" 
                        value={endDate} 
                        onChange={(e) => setEndDate(e.target.value)} 
                        required
                        style={{width: '140px'}}
                    />
                </div>
                
                <div style={{display: 'flex', gap: '1rem'}}>
                    <button 
                        type="submit" 
                        className="btn filter-btn" 
                        disabled={loading} 
                        style={{
                            marginBottom: 0, 
                            height: '38px', 
                            padding: '0 16px',
                            fontSize: '0.85rem', 
                            fontWeight: 600,
                            display: 'flex', 
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        {loading ? t.loading : t.showTasks}
                    </button>

                    <button 
                        type="button" 
                        className={`btn ${showUnfinishedOnly ? 'btn-primary' : 'btn-secondary'}`}
                        disabled={loading} 
                        onClick={toggleUnfinishedMode}
                        style={{
                            marginBottom: 0, 
                            height: '38px', 
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center', 
                            gap: '0.5rem',
                            transition: 'all 0.2s',
                            background: showUnfinishedOnly ? 'var(--primary)' : 'white',
                            color: showUnfinishedOnly ? 'white' : 'var(--text-secondary)',
                            border: showUnfinishedOnly ? '1px solid var(--primary)' : '1px solid #e2e8f0',
                            padding: '0 16px',
                            fontSize: '0.85rem',
                            fontWeight: 600
                        }}
                    >
                        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {showUnfinishedOnly ? (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            ) : (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            )}
                        </svg>
                        {t.showUnfinished}
                    </button>

                    <button 
                        type="button" 
                        className={`btn ${showGroupedCompleted ? 'btn-primary' : 'btn-secondary'}`}
                        disabled={loading} 
                        onClick={toggleGroupedCompletedMode}
                        style={{
                            marginBottom: 0, 
                            height: '38px', 
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center', 
                            gap: '0.5rem',
                            transition: 'all 0.2s',
                            background: showGroupedCompleted ? 'var(--primary)' : 'white',
                            color: showGroupedCompleted ? 'white' : 'var(--text-secondary)',
                            border: showGroupedCompleted ? '1px solid var(--primary)' : '1px solid #e2e8f0',
                            padding: '0 16px',
                            fontSize: '0.85rem',
                            fontWeight: 600
                        }}
                    >
                        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {showGroupedCompleted ? (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            ) : (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                            )}
                        </svg>
                        {t.showGroupedCompleted}
                    </button>
                </div>
            </form>
                {/* 2. Client-Side Filters Card (Fields) */}
                <div className="filter-card-fields">
                    {fields
                        .filter(field => field.filterable) 
                        .map(field => (
                            <div key={field.key} className="form-group-inline" style={{flexGrow: 1, minWidth: field.key === 'status' || field.type === 'select' ? '200px' : '150px', maxWidth: '200px'}}>
                            <label className="form-label" style={{fontSize: '0.8rem', marginBottom: '0.25rem'}}>{field.title}</label>
                            {field.type === 'select' || field.key === 'status' ? (
                                <div style={{position: 'relative'}}>
                                <div 
                                    className="input"
                                    onClick={() => toggleDropdown(field.key)}
                                    style={{
                                        padding: '0.4rem 0.6rem', 
                                        cursor: 'pointer', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'space-between',
                                        background: 'white',
                                        minHeight: '34px'
                                    }}
                                >
                                    <span style={{whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.85rem', marginRight: '0.5rem'}}>
                                        {filters[field.key] 
                                            ? (() => {
                                                const selectedSlugs = filters[field.key].split(',');
                                                const selectedTitles = selectedSlugs.map(slug => statuses.find(s => s.slug === slug)?.title || slug);
                                                if (selectedTitles.length > 2) return `${selectedTitles.length} selected`;
                                                return selectedTitles.join(', ');
                                            })()
                                            : (t.all || 'All')
                                        }
                                    </span>
                                    <span style={{fontSize: '0.7rem', color: '#94a3b8'}}>▼</span>
                                </div>

                                {openDropdowns[field.key] && (
                                    <div style={{
                                        position: 'absolute', 
                                        top: 'calc(100% + 4px)', 
                                        left: 0, 
                                        width: '100%', 
                                        minWidth: '200px',
                                        backgroundColor: '#ffffff', 
                                        border: '1px solid #cbd5e1', 
                                        borderRadius: '8px', 
                                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)', 
                                        zIndex: 105, 
                                        padding: '0.5rem', 
                                        maxHeight: '300px', 
                                        overflowY: 'auto'
                                    }}>
                                        {statuses.map(s => {
                                            const isActive = (filters[field.key] || '').split(',').includes(s.slug);
                                            return (
                                                <label 
                                                    key={s.slug} 
                                                    style={{
                                                        display: 'flex', 
                                                        alignItems: 'center', 
                                                        gap: '0.6rem', 
                                                        padding: '0.4rem', 
                                                        cursor: 'pointer',
                                                        borderRadius: '4px',
                                                        transition: 'background 0.1s'
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                                >
                                                    <input 
                                                        type="checkbox" 
                                                        checked={isActive} 
                                                        onChange={() => toggleStatusFilter(field.key, s.slug)} 
                                                        style={{cursor: 'pointer', width: '16px', height: '16px'}}
                                                    />
                                                    <span style={{fontSize: '0.85rem', color: '#334155'}}>{s.title}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <input 
                                className="input"
                                style={{padding: '0.4rem'}}
                                type={field.type === 'number' ? 'number' : 'text'}
                                value={filters[field.key] || ''}
                                onChange={(e) => handleFilterChange(field.key, e.target.value)}
                                placeholder="..."
                            />
                        )}
                    </div>
                ))}
                
                {Object.keys(filters).length > 0 && (
                    <button 
                        type="button" 
                        className="btn btn-secondary" 
                        onClick={clearFilters}
                        style={{width: 'auto', marginLeft: 'auto', fontSize: '0.85rem', height: '34px'}}
                    >
                        ✕ Clear
                    </button>
                )}
            </div>
            </div>

            {error && <div className="status-card error"><strong>Error:</strong> {error}</div>}

            {filteredTasks.length === 0 && !loading && !error ? (
                <div className="empty-state">{t.noTasks}</div>
            ) : (
                <div className="table-wrapper">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th style={{width: '40px', textAlign: 'center'}}>#</th>
                                {fields.map(field => (
                                    <th key={field.key} style={{width: field.width, textAlign: field.type === 'number' ? 'right' : 'left'}}>
                                        {field.title}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTasks.map((task, index) => (
                                <tr key={index}>
                                    <td style={{textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem'}}>{index + 1}</td>
                                    {fields.map(field => (
                                        <td key={field.key} style={{width: field.width}}>
                                            {renderCell(task, field)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                        {filteredTasks.length > 0 && (
                            <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 10, background: 'white' }}>
                                <tr className="total-row">
                                    <td></td>
                                    {fields.map((field, idx) => {
                                        if (idx === 0) return <td key={field.key} className="text-right font-bold">{t.total}</td>;
                                        if (field.type === 'number') {
                                            return (
                                                <td key={field.key} className="text-right font-bold" style={{textAlign: 'right'}}>
                                                    {totals[field.key]?.toFixed(2)}
                                                </td>
                                            );
                                        }
                                        return <td key={field.key}></td>;
                                    })}
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            )}
        </div>
    );
}
