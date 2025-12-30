import { useEffect, useState, useMemo } from 'react';
import pb, { getActualTasks, clearRankingCache } from '../lib/pocketbase';
import { translations, Language } from '../lib/translations';
import { StatusBadge } from './ui/StatusBadge';
import { MultiSelect } from './ui/MultiSelect';
import { Card } from './ui/Card';
import { Task, TaskField, Status, User } from '../types/tasks';
import { useTaskListConfig, useTaskListData } from '../hooks/useTaskList';

interface TaskListProps {
    lang: Language;
}

export default function TaskList({ lang }: TaskListProps) {
    const t = translations[lang];
    const { fields, statuses } = useTaskListConfig();
    
    // Текущий юзер и его роль
    const [currentUser, setCurrentUser] = useState(pb.authStore.record);
    useEffect(() => {
        const unsub = pb.authStore.onChange((_token, record) => setCurrentUser(record));
        return () => unsub();
    }, []);

    const isAdminOrCoordinator = useMemo(() => {
        return currentUser?.superadmin === true || currentUser?.is_coordinator === true;
    }, [currentUser]);

    const [selectedUserId, setSelectedUserId] = useState<string>(pb.authStore.record?.id || '');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [filters, setFilters] = useState<Record<string, string>>({});
    const [users, setUsers] = useState<User[]>([]);
    const [showUnfinishedOnly, setShowUnfinishedOnly] = useState(false);
    const [showGroupedCompleted, setShowGroupedCompleted] = useState(false);

    const { tasks, loading, error, fetchTasks, updateTaskTime } = useTaskListData(lang);

    // Инициализация
    useEffect(() => {
        const init = async () => {
            if (isAdminOrCoordinator) {
                try {
                    const allUsers = await pb.collection('users').getFullList({ sort: 'name', requestKey: 'init_users_list' });
                    setUsers(allUsers.map(u => ({ id: u.id, name: u.name, email: u.email })));
                } catch (e) { console.error(e); }
            }
            const now = new Date();
            const formatDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const s = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
            const e = formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
            setStartDate(s); setEndDate(e);
            
            const target = selectedUserId || pb.authStore.record?.id;
            if (target) {
                fetchTasks({ start: s, end: e, userId: target, unfinishedMode: false, groupedCompletedMode: false });
            }
        };
        init();
    }, [isAdminOrCoordinator]);

    const handleSearch = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        fetchTasks({ start: startDate, end: endDate, userId: selectedUserId, unfinishedMode: showUnfinishedOnly, groupedCompletedMode: showGroupedCompleted });
    };

    const handleFilterChange = (key: string, value: string) => setFilters(prev => ({ ...prev, [key]: value }));
    const clearFilters = () => setFilters({});

    const handleEditTime = async (task: Task, currentVal: number) => {
        const promptMsg = lang === 'ru' ? "Введите новое значение (ч):" : "Enter new value (h):";
        const newValStr = window.prompt(promptMsg, String(currentVal));
        if (newValStr === null) return;
        const newVal = parseFloat(newValStr.replace(',', '.'));
        if (isNaN(newVal)) { alert(translations[lang].invalidValue); return; }
        try {
            await updateTaskTime(task, newVal);
            // Принудительное обновление для выбранного юзера (например, Рустама)
            fetchTasks({ start: startDate, end: endDate, userId: selectedUserId, unfinishedMode: showUnfinishedOnly, groupedCompletedMode: showGroupedCompleted });
        } catch (e: any) { alert(t.genericError + ": " + e.message); }
    };

    const formatNum = (val: any) => {
        const n = parseFloat(String(val));
        if (isNaN(n) || n === 0) return <span style={{color: '#cbd5e1'}}>-</span>;
        return n.toFixed(2);
    };

    const renderCell = (task: Task, field: TaskField) => {
        const value = task[field.key];

        if (field.type === 'date') {
            if (!value) return '-';
            let d: Date;
            if (!isNaN(Number(value)) && Number(value) > 40000 && Number(value) < 60000) {
                d = new Date((Number(value) - 25569) * 86400 * 1000);
            } else { d = new Date(value); }
            if (isNaN(d.getTime())) return String(value);
            return d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : (lang === 'az' ? 'az-Latn-AZ' : 'en-US'));
        }

        if (field.type === 'select' || field.key === 'status') {
             const valStr = String(value).trim().toLowerCase();
             const s = statuses.find(st => st.slug.toLowerCase() === valStr || st.title.toLowerCase() === valStr);
             return s ? <StatusBadge status={s.slug} /> : <span style={{color: '#64748b'}}>{value}</span>;
        }

        // КОЛОНКИ ЧИСЕЛ
        if (field.type === 'number' || field.key === 'time_spent' || field.key === 'original_time_spent' || field.key === 'programmer_estimate') {
            
            if (field.key === 'original_time_spent') {
                return task.is_edited ? <div className="text-right">{formatNum(value)}</div> : <div className="text-right text-gray-300">-</div>;
            }

            if (field.key === 'time_spent') {
                const numVal = parseFloat(String(value)) || 0;
                return (
                    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem', width: '100%'}}>
                        <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{formatNum(value)}</span>
                        {isAdminOrCoordinator && !showGroupedCompleted && (
                            <button onClick={() => handleEditTime(task, numVal)} className="btn-icon" style={{ color: '#3b82f6', padding: '2px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }} title="Edit">
                               <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            </button>
                        )}
                    </div>
                );
            }
            return <div className="text-right">{formatNum(value)}</div>;
        }

        if (field.key === 'is_edited') {
            return value ? <div style={{display: 'flex', justifyContent: 'center'}}><span title="Edited" style={{color: '#e11d48', fontWeight: 'bold', fontSize: '1.2rem'}}>•</span></div> : null;
        }

        if (field.type === 'text' && field.key === 'description') {
            return <div title={value} style={{whiteSpace: 'normal', minWidth: '250px'}}>{value}</div>;
        }

        return value;
    };

    const filteredTasks = useMemo(() => {
        return tasks.filter((task: Task) => {
            return fields.every(field => {
                const fVal = filters[field.key];
                if (!fVal) return true;
                const tVal = task[field.key];
                if (tVal === null || tVal === undefined) return false;
                if (field.type === 'select' || field.key === 'status') {
                    const slugs = fVal.split(',');
                    const current = String(tVal).trim().toLowerCase();
                    const valid = slugs.flatMap(slug => {
                        const s = statuses.find(st => st.slug === slug);
                        return s ? [slug.toLowerCase(), s.title.toLowerCase()] : [slug.toLowerCase()];
                    });
                    return valid.includes(current);
                }
                return String(tVal).toLowerCase().includes(fVal.toLowerCase());
            });
        });
    }, [tasks, filters, fields, lang, statuses]); 

    const totals = useMemo(() => {
        const acc: Record<string, number> = {};
        fields.forEach(f => { if (f.type === 'number') acc[f.key] = 0; });
        filteredTasks.forEach((task: Task) => {
            fields.forEach(f => {
                if (f.type === 'number') {
                    const v = parseFloat(task[f.key]);
                    if (!isNaN(v)) acc[f.key] += v;
                }
            });
        });
        return acc;
    }, [filteredTasks, fields]);

    return (
        <div className="task-list-container animate-fade-in">
            <Card style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
                <form onSubmit={handleSearch} style={{ display: 'flex', alignItems: 'flex-end', gap: '1rem', flexWrap: 'wrap' }}>
                    {isAdminOrCoordinator && (
                        <div className="form-group-inline">
                            <label className="form-label">User</label>
                            <select className="input" value={selectedUserId} onChange={(e) => {
                                const nid = e.target.value; setSelectedUserId(nid);
                                fetchTasks({ start: startDate, end: endDate, userId: nid, unfinishedMode: showUnfinishedOnly, groupedCompletedMode: showGroupedCompleted });
                            }} style={{ width: '200px' }}>
                                {users.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                            </select>
                        </div>
                    )}
                    <div className="form-group-inline">
                        <label className="form-label">{t.from}</label>
                        <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required style={{ width: '140px' }} />
                    </div>
                    <div className="form-group-inline">
                        <label className="form-label">{t.to}</label>
                        <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required style={{ width: '140px' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button type="submit" className="btn btn-primary" disabled={loading} style={{ height: '38px', padding: '0 1.25rem' }}>{loading ? t.loading : t.showTasks}</button>
                        <button type="button" className={`btn ${showUnfinishedOnly ? 'btn-primary' : 'btn-secondary'}`} 
                            onClick={() => {
                                const v = !showUnfinishedOnly; setShowUnfinishedOnly(v); setShowGroupedCompleted(false);
                                fetchTasks({ start: startDate, end: endDate, userId: selectedUserId, unfinishedMode: v, groupedCompletedMode: false });
                            }} style={{ height: '38px', background: showUnfinishedOnly ? 'var(--primary)' : '#fff', color: showUnfinishedOnly ? '#fff' : '#475569', border: '1px solid ' + (showUnfinishedOnly ? 'var(--primary)' : '#e2e8f0'), display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                {showUnfinishedOnly ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /> : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />}
                            </svg>
                            {t.showUnfinished}
                        </button>
                        <button type="button" className={`btn ${showGroupedCompleted ? 'btn-primary' : 'btn-secondary'}`} 
                            onClick={() => {
                                const v = !showGroupedCompleted; setShowGroupedCompleted(v); setShowUnfinishedOnly(false);
                                fetchTasks({ start: startDate, end: endDate, userId: selectedUserId, unfinishedMode: false, groupedCompletedMode: v });
                            }} style={{ height: '38px', background: showGroupedCompleted ? 'var(--primary)' : '#fff', color: showGroupedCompleted ? '#fff' : '#475569', border: '1px solid ' + (showGroupedCompleted ? 'var(--primary)' : '#e2e8f0'), display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                {showGroupedCompleted ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /> : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />}
                            </svg>
                            {t.showGroupedCompleted}
                        </button>
                    </div>
                </form>
                <div className="filter-card-fields" style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid #f1f5f9' }}>
                    {fields.filter(f => f.filterable).map(f => (
                        <div key={f.key} className="form-group-inline" style={{ flexGrow: 1, maxWidth: '200px' }}>
                            <label className="form-label" style={{ fontSize: '0.8rem' }}>{f.title}</label>
                            {f.type === 'select' || f.key === 'status' ? (
                                <MultiSelect label={f.title} placeholder={t.all} options={statuses.map(s => ({ value: s.slug, label: s.title }))} selected={(filters[f.key] || '').split(',').filter(Boolean)} onChange={(v) => handleFilterChange(f.key, v.join(','))} />
                            ) : (
                                <input className="input" type={f.type === 'number' ? 'number' : 'text'} value={filters[f.key] || ''} onChange={(e) => handleFilterChange(f.key, e.target.value)} placeholder="..." />
                            )}
                        </div>
                    ))}
                    {Object.keys(filters).length > 0 && <button type="button" className="btn-secondary" onClick={clearFilters} style={{ marginLeft: 'auto', alignSelf: 'flex-end', height: '38px' }}>✕ Clear</button>}
                </div>
            </Card>

            {error && <div className="status-card error" style={{ marginBottom: '1rem' }}>{error}</div>}

            <Card style={{ padding: 0, overflow: 'hidden' }}>
                <div className="table-wrapper" style={{ maxHeight: 'calc(100vh - 350px)', overflowY: 'auto' }}>
                    <table className="data-table">
                        <thead style={{ position: 'sticky', top: 0, zIndex: 40, background: 'white' }}>
                            <tr>
                                <th style={{ width: '40px', textAlign: 'center' }}>#</th>
                                {fields.map(f => <th key={f.key} style={{ width: f.width, textAlign: f.type === 'number' ? 'right' : 'left' }}>{f.title}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTasks.length === 0 && !loading ? (
                                <tr><td colSpan={fields.length + 1} style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>{t.noTasks}</td></tr>
                            ) : filteredTasks.map((task, index) => (
                                <tr key={index}>
                                    <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>{index + 1}</td>
                                    {fields.map(f => (
                                        <td key={f.key} style={{ width: f.width, textAlign: f.type === 'number' ? 'right' : 'left' }}>
                                            {renderCell(task, f)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                        {filteredTasks.length > 0 && (
                            <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 30 }}>
                                <tr className="total-row" style={{ background: 'white', borderTop: '2px solid #e2e8f0' }}>
                                    <td style={{ textAlign: 'center' }}>Σ</td>
                                    {fields.map((f, idx) => {
                                        if (idx === 0) return <td key={f.key} className="text-right font-bold">{t.total}:</td>;
                                        if (f.type === 'number') return <td key={f.key} style={{ textAlign: 'right' }} className="font-bold text-indigo-600">{(totals[f.key] || 0).toFixed(2)}</td>;
                                        return <td key={f.key}></td>;
                                    })}
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </Card>
        </div>
    );
}
