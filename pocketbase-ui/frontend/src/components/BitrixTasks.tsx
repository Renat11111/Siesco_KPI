import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Language, translations } from '../lib/translations';
import pb from '../lib/pocketbase';
import { RecordModel } from 'pocketbase';
import { StatusBadge, getStatusConfig } from './ui/StatusBadge';
import { UserBadge } from './ui/UserBadge';

interface BitrixTasksProps {
    lang: Language;
}

interface BitrixUser extends RecordModel {
    bitrix_id: number;
    full_name: string;
}

interface BitrixDepartment extends RecordModel {
    bitrix_id: number;
    name: string;
}

interface BitrixGroup extends RecordModel {
    bitrix_id: number;
    name: string;
}

interface BitrixTask extends RecordModel {
    bitrix_id: number;
    title: string;
    description: string;
    status: number;
    priority: number;
    deadline: string;
    created_date: string;
    responsible: string; 
    group: string;
    comments_count: number;
    expand?: {
        responsible?: BitrixUser;
        group?: BitrixGroup;
    };
}

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

const baseThStyle: React.CSSProperties = {
    padding: '8px',
    color: '#64748b',
    borderBottom: '1px solid #e2e8f0',
    fontWeight: 700
};

export default function BitrixTasks({ lang }: BitrixTasksProps) {
    const t = translations[lang];
    const [tasks, setTasks] = useState<BitrixTask[]>([]);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState('');

    // Roles and Restrictions
    const currentUser = pb.authStore.model;
    const isSpecialUser = currentUser?.superadmin || currentUser?.is_coordinator;
    const userBitrixRecordId = currentUser?.bitrix_user; // Link to bitrix_users collection
    
    const allowedUserIdsRef = useRef<Set<string>>(new Set());
    const [userMap, setUserMap] = useState<Map<string, BitrixUser>>(new Map());
    const [groupMap, setGroupMap] = useState<Map<string, BitrixGroup>>(new Map());
    const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
    const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
    const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
    const [taskIdFilter, setTaskIdFilter] = useState<string>('');

    // Initialize filters based on user role
    useEffect(() => {
        if (!isSpecialUser && userBitrixRecordId) {
            setSelectedUsers([userBitrixRecordId]);
        }
    }, [isSpecialUser, userBitrixRecordId]);

    const loadData = async (triggerSync = false) => {
        setLoading(true);
        setError('');
        try {
            if (triggerSync) {
                setSyncing(true);
                try {
                    await pb.send('/api/bitrix/sync-incremental', { method: 'POST' });
                } catch (syncErr) {
                    console.warn('Sync failed:', syncErr);
                } finally {
                    setSyncing(false);
                }
            }

            // 1. Fetch IT Dept users and CTO
            const targetUsers = await pb.collection('bitrix_users').getFullList<BitrixUser>({
                filter: 'bitrix_id = 7 || departments.bitrix_id ?= 5',
                expand: 'departments'
            });

            const uMap = new Map<string, BitrixUser>();
            const ids = new Set<string>();
            targetUsers.forEach(u => {
                uMap.set(u.id, u);
                ids.add(u.id);
            });
            setUserMap(uMap);
            allowedUserIdsRef.current = ids;

            // 2. Fetch all groups (projects)
            const groups = await pb.collection('bitrix_groups').getFullList<BitrixGroup>();
            const gMap = new Map<string, BitrixGroup>();
            groups.forEach(g => gMap.set(g.id, g));
            setGroupMap(gMap);

            // 3. Fetch Tasks WITHOUT filters or expand to avoid 400 error and slowness
            const resultList = await pb.collection('bitrix_tasks_active').getFullList<BitrixTask>({
                sort: '-created_date',
            });

            // 4. Filter on client side (safe and fast for 2k records)
            // Strict enforcement: if not admin/coord, ONLY show personal tasks
            let filtered = resultList.filter(t => ids.has(t.responsible));
            if (!isSpecialUser) {
                // If userBitrixRecordId is null/undefined, this will filter out everything (correct)
                filtered = filtered.filter(t => t.responsible === userBitrixRecordId);
            }
            setTasks(filtered);

        } catch (err: any) {
            console.error(err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();

        pb.collection('bitrix_tasks_active').subscribe('*', async (e) => {
            if (e.action === 'delete') {
                setTasks(prev => prev.filter(t => t.id !== e.record.id));
                return;
            }

            try {
                if (!allowedUserIdsRef.current.has(e.record.responsible)) return;

                // For updates/creates, we don't need expand anymore because we have groupMap
                const record = e.record as BitrixTask;

                setTasks(prev => {
                    const exists = prev.find(t => t.id === record.id);
                    if (exists) {
                        return prev.map(t => t.id === record.id ? record : t);
                    } else {
                        return [record, ...prev];
                    }
                });
            } catch (err) {
                console.error(err);
            }
        });

        return () => {
            pb.collection('bitrix_tasks_active').unsubscribe('*');
        };
    }, []);

    const uniqueUsers = useMemo(() => {
        const users = new Map<string, BitrixUser>();
        tasks.forEach(t => {
            const resp = userMap.get(t.responsible);
            if (resp) users.set(resp.id, resp);
        });
        return Array.from(users.values()).sort((a, b) => a.full_name.localeCompare(b.full_name));
    }, [tasks, userMap]);

    const uniqueGroups = useMemo(() => {
        const groups = new Map<string, BitrixGroup>();
        tasks.forEach(t => {
            const group = groupMap.get(t.group);
            if (group) groups.set(group.id, group);
        });
        return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [tasks, groupMap]);

    const filteredTasks = useMemo(() => {
        return tasks.filter(task => {
            const matchesUser = selectedUsers.length === 0 || selectedUsers.includes(task.responsible);
            const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.includes(String(task.status));
            const matchesGroup = selectedGroups.length === 0 || selectedGroups.includes(task.group);
            const matchesId = !taskIdFilter || String(task.bitrix_id).includes(taskIdFilter);
            return matchesUser && matchesStatus && matchesGroup && matchesId;
        });
    }, [tasks, selectedUsers, selectedStatuses, selectedGroups, taskIdFilter]);

    const formatDate = (d?: string) => d ? new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : '—';

    const statusOptions = ['1', '2', '3', '4', '6', '7', '-1'].map(s => ({
        value: s,
        label: getStatusConfig(s).label
    }));

    const userOptions = uniqueUsers.map(u => ({ value: u.id, label: u.full_name }));
    const groupOptions = uniqueGroups.map(g => ({ value: g.id, label: g.name }));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            <div style={{ padding: '8px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b', margin: 0 }}>Задачи Bitrix</h2>
                    <span style={{ fontSize: '11px', color: '#64748b', background: '#e2e8f0', padding: '1px 8px', borderRadius: '10px', fontWeight: 600 }}>IT Dept</span>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>{filteredTasks.length} / {tasks.length}</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input 
                        type="text" 
                        placeholder="Поиск по ID..." 
                        value={taskIdFilter}
                        onChange={(e) => setTaskIdFilter(e.target.value)}
                        style={{
                            padding: '6px 10px',
                            fontSize: '13px',
                            borderRadius: '6px',
                            border: '1px solid #cbd5e1',
                            width: '120px',
                            outline: 'none'
                        }}
                    />
                    <MultiSelect label="Проекты" options={groupOptions} selected={selectedGroups} onChange={setSelectedGroups} />
                    {isSpecialUser && (
                        <MultiSelect label="Исполнители" options={userOptions} selected={selectedUsers} onChange={setSelectedUsers} />
                    )}
                    <MultiSelect label="Статусы" options={statusOptions} selected={selectedStatuses} onChange={setSelectedStatuses} />
                    <button 
                        onClick={() => loadData(true)} 
                        disabled={loading || syncing}
                        style={{ 
                            background: syncing ? '#f1f5f9' : 'white', 
                            border: '1px solid #cbd5e1', 
                            borderRadius: '4px', 
                            padding: '4px 10px', 
                            cursor: (loading || syncing) ? 'not-allowed' : 'pointer', 
                            color: syncing ? '#3b82f6' : '#64748b',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'all 0.2s'
                        }}
                    >
                        <span style={{ 
                            display: 'inline-block', 
                            animation: syncing ? 'spin 1s linear infinite' : 'none',
                            fontSize: '16px'
                        }}>↻</span>
                        {syncing && <span style={{ fontSize: '11px', fontWeight: 600 }}>SYNC...</span>}
                    </button>
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', tableLayout: 'fixed' }}>
                    <thead style={{ position: 'sticky', top: 0, background: '#f1f5f9', zIndex: 5 }}>
                        <tr>
                            <th style={{ ...baseThStyle, width: '40px', textAlign: 'center' }}>№</th>
                            <th style={{ ...baseThStyle, width: '70px', textAlign: 'left' }}>ID</th>
                            <th style={{ ...baseThStyle, padding: '8px 12px', textAlign: 'left' }}>Задача</th>
                            <th style={{ ...baseThStyle, width: '180px', padding: '8px 12px', textAlign: 'left' }}>Ответственный</th>
                            <th style={{ ...baseThStyle, width: '130px', textAlign: 'center' }}>Статус</th>
                            <th style={{ ...baseThStyle, width: '90px', textAlign: 'center' }}>Дедлайн</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredTasks.map((task, idx) => {
                            const isOverdue = task.deadline && new Date(task.deadline) < new Date();
                            const responsible = userMap.get(task.responsible);
                            const group = groupMap.get(task.group);
                            
                            return (
                                <tr key={task.id} style={{ borderBottom: '1px solid #f1f5f9' }} className="hover-row">
                                    <td style={{ textAlign: 'center', color: '#94a3b8' }}>{idx + 1}</td>
                                    <td style={{ fontFamily: 'monospace', color: '#64748b' }}>{task.bitrix_id}{task.priority === 2 && ' 🔥'}</td>
                                    <td style={{ padding: '8px 12px' }}>
                                        <div style={{ fontWeight: 500, color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={task.title}>{task.title}</div>
                                        {group && <div style={{ fontSize: '10px', color: '#4f46e5', background: '#e0e7ff', display: 'inline-block', padding: '0 4px', borderRadius: '3px' }}>{group.name}</div>}
                                    </td>
                                    <td style={{ padding: '8px 12px' }}>
                                        <UserBadge user={responsible} />
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <StatusBadge status={task.status} />
                                    </td>
                                    <td style={{ textAlign: 'center', fontSize: '12px', color: isOverdue ? '#ef4444' : '#64748b', fontWeight: isOverdue ? 700 : 400 }}>{formatDate(task.deadline)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                
                {loading && <div style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>Загрузка...</div>}
                
                {!loading && filteredTasks.length === 0 && (
                    <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                        {error ? error : "Задач не найдено"}
                    </div>
                )}
            </div>
            <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                .hover-row:hover { background-color: #f8fafc; } 
                .hover-option:hover { background-color: #f8fafc !important; }
            `}</style>
        </div>
    );
}