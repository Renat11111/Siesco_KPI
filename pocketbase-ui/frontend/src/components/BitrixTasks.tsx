import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Language, translations } from '../lib/translations';
import pb, { getSetting } from '../lib/pocketbase';

interface BitrixTasksProps {
    lang: Language;
}

interface BitrixUser {
    id: string;
    name: string;
    icon?: string;
    workPosition?: string;
}

interface BitrixGroup {
    id: string;
    name: string;
}

interface BitrixTask {
    id: string;
    title: string;
    status: string;
    priority: string;
    deadline?: string;
    createdDate: string;
    responsibleId: string;
    responsible?: BitrixUser;
    group?: BitrixGroup;
    commentsCount?: string;
}

interface BitrixResponse {
    result: {
        tasks: any[];
    };
    total: number;
    next?: number;
}

const IT_DEPARTMENT_ID = 5;
const CTO_USER_ID = '7';

const getStatusConfig = (status: string) => {
    const base = {
        padding: '2px 10px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: 700,
        display: 'inline-block',
        whiteSpace: 'nowrap' as const
    };

    switch (status) {
        case '1': return { label: 'Новая', style: { ...base, background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' } };
        case '2': return { label: 'Ждет выполнения', style: { ...base, background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' } };
        case '3': return { label: 'Выполняется', style: { ...base, background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' } };
        case '4': return { label: 'Ожидает контроля', style: { ...base, background: '#f3e8ff', color: '#7e22ce', border: '1px solid #d8b4fe' } };
        case '5': return { label: 'Завершена', style: { ...base, background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0' } };
        case '6': return { label: 'Отложена', style: { ...base, background: '#fff7ed', color: '#9a3412', border: '1px solid #ffedd5' } };
        case '7': return { label: 'Возвращена', style: { ...base, background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca' } };
        case '-1': return { label: 'Просрочена', style: { ...base, background: '#7f1d1d', color: '#ffffff', border: '1px solid #991b1b' } };
        default: return { label: status, style: { ...base, background: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb' } };
    }
};

const getStatusName = (status: string) => {
    switch (status) {
        case '1': return 'Новая';
        case '2': return 'Ожидание';
        case '3': return 'В работе';
        case '4': return 'Контроль';
        case '5': return 'Завершена';
        case '6': return 'Отложена';
        case '7': return 'Возвращена';
        case '-1': return 'Просрочена';
        default: return status;
    }
};

// --- MultiSelect Dropdown Component ---
interface MultiSelectProps {
    label: string;
    options: { value: string; label: string | React.ReactNode }[];
    selected: string[];
    onChange: (values: string[]) => void;
}

const MultiSelect = ({ label, options, selected, onChange }: MultiSelectProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleOption = (value: string) => {
        if (selected.includes(value)) {
            onChange(selected.filter(v => v !== value));
        } else {
            onChange([...selected, value]);
        }
    };

    const displayText = selected.length === 0 
        ? label 
        : selected.length === 1 
            ? options.find(o => o.value === selected[0])?.label 
            : `${selected.length} выбр.`;

    return (
        <div ref={containerRef} style={{ position: 'relative', minWidth: '160px' }}>
            <div 
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    padding: '6px 10px',
                    fontSize: '13px',
                    borderRadius: '6px',
                    border: isOpen ? '1px solid #3b82f6' : '1px solid #cbd5e1',
                    background: 'white',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                    color: selected.length > 0 ? '#1e293b' : '#64748b'
                }}
            >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>
                    {typeof displayText === 'string' ? displayText : 'Выбрано'}
                </span>
                <span style={{ fontSize: '10px', color: '#94a3b8' }}>▼</span>
            </div>

            {isOpen && (
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    width: '220px',
                    marginTop: '4px',
                    background: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                    zIndex: 50,
                    maxHeight: '350px',
                    overflowY: 'auto',
                    padding: '4px'
                }}>
                    {selected.length > 0 && (
                        <div onClick={() => onChange([])} style={{ padding: '6px 8px', fontSize: '11px', color: '#ef4444', cursor: 'pointer', fontWeight: 600 }}>Сбросить выбор</div>
                    )}
                    {options.map(option => (
                        <div 
                            key={option.value}
                            onClick={() => toggleOption(option.value)}
                            style={{
                                padding: '6px 8px',
                                fontSize: '13px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                borderRadius: '4px',
                                background: selected.includes(option.value) ? '#f0f9ff' : 'transparent',
                            }}
                            className="hover-option"
                        >
                            <input type="checkbox" checked={selected.includes(option.value)} readOnly style={{ pointerEvents: 'none' }} />
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{option.label}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default function BitrixTasks({ lang }: BitrixTasksProps) {
    const t = translations[lang];
    const [tasks, setTasks] = useState<BitrixTask[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [total, setTotal] = useState(0);
    const [nextStart, setNextStart] = useState<number | undefined>(0);
    const [departmentUsers, setDepartmentUsers] = useState<string[]>([]);
    const [webhookUrl, setWebhookUrl] = useState('');

    const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
    const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);

    const fetchDepartmentUsers = async (url: string) => {
        try {
            const response = await fetch(`${url}/user.get?filter[UF_DEPARTMENT]=${IT_DEPARTMENT_ID}&filter[ACTIVE]=true`);
            const data = await response.json();
            let ids: string[] = data.result ? data.result.map((u: any) => u.ID) : [];
            if (!ids.includes(CTO_USER_ID)) ids.push(CTO_USER_ID);
            setDepartmentUsers(ids);
            return ids;
        } catch (e) {
            return [CTO_USER_ID];
        }
    };

    const fetchAllTasks = async (userIds?: string[], urlOverride?: string): Promise<void> => {
        const url = urlOverride || webhookUrl;
        if (!url) return;

        setLoading(true);
        setError('');
        const ids = userIds || departmentUsers;
        if (ids.length === 0) {
            const freshIds = await fetchDepartmentUsers(url);
            return fetchAllTasks(freshIds, url);
        }

        let allTasks: BitrixTask[] = [];
        let start = 0;
        let hasMore = true;

        try {
            while (hasMore) {
                const response = await fetch(`${url}/tasks.task.list`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        filter: { "!REAL_STATUS": 5, "RESPONSIBLE_ID": ids },
                        select: ["ID", "TITLE", "STATUS", "PRIORITY", "DEADLINE", "CREATED_DATE", "RESPONSIBLE_ID", "GROUP_ID", "COMMENTS_COUNT"],
                        order: { "ID": "DESC" },
                        start: start
                    })
                });
                const data: BitrixResponse = await response.json();
                if (data.result && data.result.tasks) {
                    const chunk = data.result.tasks.map((t: any) => ({
                        id: t.id, title: t.title, status: t.status, priority: t.priority,
                        deadline: t.deadline, createdDate: t.createdDate, responsibleId: t.responsibleId,
                        responsible: t.responsible, group: t.group, commentsCount: t.commentsCount
                    }));
                    allTasks = [...allTasks, ...chunk];
                }
                if (data.next) start = data.next;
                else hasMore = false;
                if (allTasks.length > 5000) hasMore = false; 
            }
            setTasks(allTasks);
            setTotal(allTasks.length);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const init = async () => {
            const url = await getSetting('bitrix_webhook');
            if (url) {
                setWebhookUrl(url);
                const ids = await fetchDepartmentUsers(url);
                if (ids.length > 0) fetchAllTasks(ids, url);
            } else {
                setError("Bitrix webhook not configured in settings.");
            }
        };
        init();
    }, []);

    const uniqueUsers = useMemo(() => {
        const usersMap = new Map<string, BitrixUser>();
        tasks.forEach(t => t.responsible && usersMap.set(t.responsibleId, t.responsible));
        return Array.from(usersMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [tasks]);

    const filteredTasks = useMemo(() => {
        return tasks.filter(task => {
            const matchesUser = selectedUsers.length === 0 || selectedUsers.includes(task.responsibleId);
            const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.includes(task.status);
            return matchesUser && matchesStatus;
        });
    }, [tasks, selectedUsers, selectedStatuses]);

    const formatDate = (d?: string) => d ? new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : '—';

    const statusOptions = ['1', '2', '3', '4', '6', '7', '-1'].map(s => ({
        value: s,
        label: getStatusConfig(s).label
    }));

    const userOptions = uniqueUsers.map(u => ({ value: u.id, label: u.name }));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            <div style={{ padding: '8px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b', margin: 0 }}>Задачи Bitrix</h2>
                    <span style={{ fontSize: '11px', color: '#64748b', background: '#e2e8f0', padding: '1px 8px', borderRadius: '10px', fontWeight: 600 }}>IT Dept</span>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>{filteredTasks.length} / {tasks.length}</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <MultiSelect label="Исполнители" options={userOptions} selected={selectedUsers} onChange={setSelectedUsers} />
                    <MultiSelect label="Статусы" options={statusOptions} selected={selectedStatuses} onChange={setSelectedStatuses} />
                    <button onClick={() => fetchAllTasks()} style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '4px 10px', cursor: 'pointer', color: '#64748b' }}>↻</button>
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', tableLayout: 'fixed' }}>
                    <thead style={{ position: 'sticky', top: 0, background: '#f1f5f9', zIndex: 5 }}>
                        <tr>
                            <th style={{ width: '40px', padding: '8px', textAlign: 'center', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>№</th>
                            <th style={{ width: '70px', padding: '8px', textAlign: 'left', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>ID</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Задача</th>
                            <th style={{ width: '180px', padding: '8px 12px', textAlign: 'left', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Ответственный</th>
                            <th style={{ width: '130px', padding: '8px', textAlign: 'center', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Статус</th>
                            <th style={{ width: '90px', padding: '8px', textAlign: 'center', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Дедлайн</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredTasks.map((task, idx) => {
                            const isOverdue = task.deadline && new Date(task.deadline) < new Date();
                            const statusCfg = getStatusConfig(task.status);
                            return (
                                <tr key={task.id} style={{ borderBottom: '1px solid #f1f5f9' }} className="hover-row">
                                    <td style={{ textAlign: 'center', color: '#94a3b8' }}>{idx + 1}</td>
                                    <td style={{ fontFamily: 'monospace', color: '#64748b' }}>{task.id}{task.priority === '2' && ' 🔥'}</td>
                                    <td style={{ padding: '8px 12px' }}>
                                        <div style={{ fontWeight: 500, color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={task.title}>{task.title}</div>
                                        {task.group && <div style={{ fontSize: '10px', color: '#4f46e5', background: '#e0e7ff', display: 'inline-block', padding: '0 4px', borderRadius: '3px' }}>{task.group.name}</div>}
                                    </td>
                                    <td style={{ padding: '8px 12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            {task.responsible?.icon ? <img src={task.responsible.icon} style={{ width: '20px', height: '20px', borderRadius: '50%' }} alt="" /> : <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#e2e8f0', fontSize: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{task.responsible?.name?.[0]}</div>}
                                            <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '12px' }}>{task.responsible?.name}</div>
                                        </div>
                                    </td>
                                    <td style={{ textAlign: 'center' }}><span style={statusCfg.style}>{statusCfg.label}</span></td>
                                    <td style={{ textAlign: 'center', fontSize: '12px', color: isOverdue ? '#ef4444' : '#64748b', fontWeight: isOverdue ? 700 : 400 }}>{formatDate(task.deadline)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                
                {loading && (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                        Загрузка задач... (уже загружено {tasks.length})
                    </div>
                )}
                
                {!loading && filteredTasks.length === 0 && (
                    <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                        {tasks.length > 0 ? "Нет задач с выбранными фильтрами" : (error ? error : "Нет задач")}
                    </div>
                )}
            </div>
            <style>{`.hover-row:hover { background-color: #f8fafc; } .hover-option:hover { background-color: #f8fafc !important; }`}</style>
        </div>
    );
}