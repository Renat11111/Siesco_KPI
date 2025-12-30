import { useEffect, useState, useMemo } from 'react';
import pb, { getActualTasks, clearRankingCache } from '../lib/pocketbase';
import { translations, Language } from '../lib/translations';
import { StatusBadge } from './ui/StatusBadge';
import { MultiSelect } from './ui/MultiSelect';
import { Task, TaskField, Status, User } from '../types/tasks';
import { useTaskListConfig, useTaskListData } from '../hooks/useTaskList';

interface TaskListProps {
    lang: Language;
}

export default function TaskList({ lang }: TaskListProps) {
    const t = translations[lang];
    const { fields, statuses } = useTaskListConfig();
    const [selectedUserId, setSelectedUserId] = useState<string>(pb.authStore.record?.id || '');
    
    const { 
        tasks, 
        loading, 
        error, 
        fetchTasks, 
        updateTaskTime 
    } = useTaskListData(lang, selectedUserId);

    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    
    // Dynamic filters for each field: key -> value
    const [filters, setFilters] = useState<Record<string, string>>({});
    
    // --- Admin/Coordinator Logic ---
    const [isAdminOrCoordinator, setIsAdminOrCoordinator] = useState(false);
    const [users, setUsers] = useState<User[]>([]);
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
        
        const target = pb.authStore.record?.id;
        if (target) {
            fetchTasks({ start: initialStartDate, end: initialEndDate, userId: target, unfinishedMode: false, groupedCompletedMode: false });
        }
    }, [fetchTasks]);

    // Realtime Subscription
    useEffect(() => {
        const setup = async () => {
            const targetUser = selectedUserId || pb.authStore.record?.id;
            const refresh = () => fetchTasks({ start: startDate, end: endDate, userId: selectedUserId, unfinishedMode: showUnfinishedOnly, groupedCompletedMode: showGroupedCompleted });
            
            await pb.collection('tasks').subscribe('*', (e) => {
                if (targetUser && e.record && e.record.user === targetUser) refresh();
            });

            await pb.collection('ranking_updates').subscribe('*', () => refresh());
        };
        setup();
    }, [selectedUserId, startDate, endDate, showUnfinishedOnly, showGroupedCompleted, fetchTasks]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        fetchTasks({ start: startDate, end: endDate, userId: selectedUserId, unfinishedMode: showUnfinishedOnly, groupedCompletedMode: showGroupedCompleted });
    };

    const toggleUnfinishedMode = () => {
        const val = !showUnfinishedOnly;
        setShowUnfinishedOnly(val);
        if (val) setShowGroupedCompleted(false);
        fetchTasks({ start: startDate, end: endDate, userId: selectedUserId, unfinishedMode: val, groupedCompletedMode: false });
    };

    const toggleGroupedCompletedMode = () => {
        const val = !showGroupedCompleted;
        setShowGroupedCompleted(val);
        if (val) setShowUnfinishedOnly(false);
        fetchTasks({ start: startDate, end: endDate, userId: selectedUserId, unfinishedMode: false, groupedCompletedMode: val });
    };

    const handleUserChange = (newUserId: string) => {
        setSelectedUserId(newUserId);
        fetchTasks({ start: startDate, end: endDate, userId: newUserId, unfinishedMode: showUnfinishedOnly, groupedCompletedMode: showGroupedCompleted });
    };

    const handleFilterChange = (key: string, value: string) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const clearFilters = () => {
        setFilters({});
    };

    // Filter tasks client-side based on per-field filters
    const filteredTasks = useMemo(() => {
        return tasks.filter((task: Task) => {
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

        filteredTasks.forEach((task: Task) => {
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

    const handleEditTimeWrapper = async (task: Task, currentVal: number) => {
        const newValStr = window.prompt(lang === 'ru' ? "Введите новое значение времени (часы):" : "Enter new time value (hours):", String(currentVal));
        if (newValStr === null) return; 
        const newVal = parseFloat(newValStr.replace(',', '.')); 
        if (isNaN(newVal)) {
            alert(translations[lang].invalidValue);
            return;
        }
        if (newVal === currentVal) return;

        try {
            await updateTaskTime(task, newVal);
            fetchTasks({ start: startDate, end: endDate, userId: selectedUserId, unfinishedMode: showUnfinishedOnly, groupedCompletedMode: showGroupedCompleted });
        } catch (e: any) {
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
                 return <StatusBadge status={statusObj.slug} />;
             }
             return <span style={{color: '#64748b'}}>{value}</span>;
        }

        if (field.key === 'time_spent' && field.type === 'number') {
            return (
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem'}}>
                    <span>{typeof value === 'number' ? value.toFixed(2) : value}</span>
                    {isAdminOrCoordinator && !showGroupedCompleted && (
                        <button 
                            onClick={() => handleEditTimeWrapper(task, Number(value))}
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
            // Если значение реально пустое
            if (value === undefined || value === null || value === '') {
                return <div className="text-right text-gray-300">-</div>;
            }

            // Специальная логика для оригинала: если не редактировалось - всегда прочерк
            if (field.key === 'original_time_spent' && !task.is_edited) {
                return <div className="text-right text-gray-300">-</div>;
            }

            const numVal = Number(value);
            return <div className="text-right">{!isNaN(numVal) ? numVal.toFixed(2) : '-'}</div>;
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
                                <MultiSelect 
                                    label={field.title}
                                    placeholder={t.all || 'All'}
                                    options={statuses.map(s => ({ value: s.slug, label: s.title }))}
                                    selected={(filters[field.key] || '').split(',').filter(Boolean)}
                                    onChange={(newValues) => handleFilterChange(field.key, newValues.join(','))}
                                />
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
                            {filteredTasks.map((task: Task, index: number) => (
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
                            <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 30 }}>
                                <tr className="total-row" style={{ backgroundColor: '#ffffff', borderTop: '2px solid #e2e8f0', boxShadow: '0 -4px 10px rgba(0,0,0,0.05)' }}>
                                    <td style={{ backgroundColor: '#ffffff', textAlign: 'center', color: '#94a3b8' }}>Σ</td>
                                    {fields.map((field, idx) => {
                                        if (idx === 0) return <td key={field.key} style={{ backgroundColor: '#ffffff' }} className="text-right font-bold">{t.total}:</td>;
                                        if (field.type === 'number') {
                                            return (
                                                <td key={field.key} style={{ backgroundColor: '#ffffff', textAlign: 'right' }} className="font-bold text-indigo-600">
                                                    {totals[field.key]?.toFixed(2)}
                                                </td>
                                            );
                                        }
                                        return <td key={field.key} style={{ backgroundColor: '#ffffff' }}></td>;
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
