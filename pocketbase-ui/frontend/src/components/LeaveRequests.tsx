import { useState, useEffect, useMemo } from 'react';
import pb, { handleApiError } from '../lib/pocketbase';
import { translations, Language } from '../lib/translations';
import { UnsubscribeFunc } from 'pocketbase';

interface LeaveRequestsProps {
    lang: Language;
}

interface LeaveRequest {
    id: string;
    start_date: string;
    end_date: string;
    reason: string;
    status: 'pending' | 'approved' | 'rejected';
    created: string;
    user: string;
    expand?: {
        user?: {
            name: string;
            email: string;
        }
    }
}

export default function LeaveRequests({ lang }: LeaveRequestsProps) {
    const t = translations[lang];
    const [loading, setLoading] = useState(false);
    const [isFormSubmitting, setIsFormSubmitting] = useState(false);
    const [requests, setRequests] = useState<LeaveRequest[]>([]);
    const [fetchError, setFetchError] = useState('');
    
    const [currentUser, setCurrentUser] = useState(pb.authStore.record);
    const isAdmin = useMemo(() => {
        if (!currentUser) return false;
        return currentUser.superadmin === true || currentUser.is_coordinator === true;
    }, [currentUser]);

    useEffect(() => {
        const unsubscribe = pb.authStore.onChange((_token, record) => {
            setCurrentUser(record);
        });
        return () => unsubscribe();
    }, []);

    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [reason, setReason] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const [filterStart, setFilterStart] = useState(() => {
        const now = new Date();
        const d = new Date(now.getFullYear(), now.getMonth(), 1);
        const offset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - offset).toISOString().split('T')[0];
    });
    const [filterEnd, setFilterEnd] = useState(() => {
        const now = new Date();
        const d = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const offset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - offset).toISOString().split('T')[0];
    });

    const getLocalToday = () => {
        const d = new Date();
        const offset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - offset).toISOString().split('T')[0];
    };
    const today = getLocalToday();

    const fetchRequests = async () => {
        const authUser = pb.authStore.record;
        if (!authUser?.id) return;
        
        console.log("[LeaveRequests] Fetching requests for start:", filterStart, "end:", filterEnd);
        setLoading(true);
        try {
            let filterExpr = `created >= "${filterStart} 00:00:00" && created <= "${filterEnd} 23:59:59"`;
            if (!isAdmin) {
                filterExpr += ` && user = "${authUser.id}"`;
            }

            const records = await pb.collection('leave_requests').getList<LeaveRequest>(1, 200, {
                filter: filterExpr,
                sort: '-created',
                expand: 'user',
                requestKey: null
            });

            console.log("[LeaveRequests] Found records:", records.items.length);
            setRequests(records.items);
        } catch (err: any) {
            console.error("[LeaveRequests] Fetch error:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!currentUser?.id) return;

        fetchRequests();

        let unsub: UnsubscribeFunc;
        const setup = async () => {
            console.log("[LeaveRequests] Subscribing to leave_requests Realtime...");
            unsub = await pb.collection('leave_requests').subscribe('*', async (e) => {
                console.log("[LeaveRequests] Realtime event:", e.action, e.record.id);
                if (e.action === 'delete') {
                    setRequests(prev => prev.filter(r => r.id !== e.record.id));
                } else if (e.action === 'create') {
                    try {
                        const fullRecord = await pb.collection('leave_requests').getOne<LeaveRequest>(e.record.id, { 
                            expand: 'user',
                            requestKey: null 
                        });
                        setRequests(prev => [fullRecord, ...prev]);
                    } catch (err) {
                        console.error("[LeaveRequests] Error fetching new record:", err);
                        fetchRequests();
                    }
                } else {
                    fetchRequests();
                }
            });
        };
        setup();

        return () => { 
            if (unsub) unsub();
        };
    }, [filterStart, filterEnd, currentUser?.id, isAdmin]);

    const handleSubmit = async (e: React.FormEvent) => {
        if (isFormSubmitting) return;
        e.preventDefault();
        setIsFormSubmitting(true);
        setMessage('');
        setError('');

        try {
            // 1. Validate Date Range
            const start = new Date(startDate);
            const end = new Date(endDate);
            const now = new Date();
            now.setHours(0, 0, 0, 0);
            const startCheck = new Date(startDate);
            startCheck.setHours(0, 0, 0, 0);

            if (startCheck < now) {
                throw new Error(t.errorPastDate);
            }
            if (end < start) {
                throw new Error(t.errorEndDate);
            }

            // 2. Check Overlap (Client-side against loaded requests)
            // Note: This only checks against currently loaded requests. 
            // Ideally, backend should also enforce this.
            const hasOverlap = requests.some(req => {
                if (req.status === 'rejected') return false;
                if (req.user !== currentUser?.id) return false; // Check only own requests
                
                const reqStart = new Date(req.start_date);
                const reqEnd = new Date(req.end_date);
                
                // Overlap condition: (StartA <= EndB) and (EndA >= StartB)
                return (start <= reqEnd && end >= reqStart);
            });

            if (hasOverlap) {
                throw new Error(t.errorOverlap);
            }

            await pb.collection('leave_requests').create({
                start_date: startDate,
                end_date: endDate,
                reason: reason,
                status: 'pending',
                user: currentUser?.id
            });
            setMessage(t.requestSubmitted);
            setStartDate(''); setEndDate(''); setReason('');
            fetchRequests(); // Мгновенное обновление
        } catch (err: any) {
            // Handle simple Error objects (validation) and PocketBase errors
            if (err instanceof Error && !('response' in err)) {
                setError(err.message);
            } else {
                setError(handleApiError(err, t));
            }
        } finally {
            setIsFormSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm(t.confirmDeleteRequest)) return;
        try {
            await pb.collection('leave_requests').delete(id);
            // ПРИНУДИТЕЛЬНОЕ ОБНОВЛЕНИЕ после удаления
            setRequests(prev => prev.filter(r => r.id !== id));
        } catch (err: any) {
            alert(handleApiError(err, t));
        }
    };

    const handleStatusChange = async (id: string, newStatus: string) => {
        try {
            await pb.collection('leave_requests').update(id, { status: newStatus });
            fetchRequests();
        } catch (err: any) {
            alert(handleApiError(err, t));
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'pending': return t.statusPending;
            case 'approved': return t.statusApproved;
            case 'rejected': return t.statusRejected;
            default: return status;
        }
    };

    return (
        <div className="task-list-container animate-fade-in" style={{ padding: '1rem', height: '100%', overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: '1.5rem', height: '100%' }}>
                
                <div className="dashboard-card" style={{ width: '340px', flexShrink: 0, height: '100%', padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
                    <h3 className="section-title" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>📅</span> {t.timeOffTitle}
                    </h3>
                    {message && <div className="status-card success" style={{ marginBottom: '1rem' }}>{message}</div>}
                    {error && <div className="status-card error" style={{ marginBottom: '1rem' }}>{error}</div>}
                    <form onSubmit={handleSubmit} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div className="form-group-inline">
                            <label className="form-label">{t.startDate}</label>
                            <input type="date" className="input" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                        </div>
                        <div className="form-group-inline">
                            <label className="form-label">{t.endDate}</label>
                            <input type="date" className="input" required value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                        </div>
                        <div className="form-group-inline" style={{ flex: 1 }}>
                            <label className="form-label">{t.reason}</label>
                            <textarea className="input" required value={reason} onChange={(e) => setReason(e.target.value)} style={{ resize: 'none', height: '100%' }} />
                        </div>
                        <button type="submit" className="btn" disabled={isFormSubmitting} style={{ marginTop: 'auto' }}>
                            {isFormSubmitting ? t.processing : t.submitRequest}
                        </button>
                    </form>
                </div>

                <div className="dashboard-card" style={{ flex: 1, minWidth: 0, height: '100%', padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <h3 className="section-title" style={{ margin: 0, fontSize: '1rem' }}>{t.requestHistory}</h3>
                            <span className="badge badge-neutral">{requests.length}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input type="date" className="input" style={{ width: '130px' }} value={filterStart} onChange={(e) => setFilterStart(e.target.value)} />
                            <span>-</span>
                            <input type="date" className="input" style={{ width: '130px' }} value={filterEnd} onChange={(e) => setFilterEnd(e.target.value)} />
                        </div>
                    </div>

                    <div className="table-wrapper" style={{ border: 'none', flex: 1, overflowY: 'auto' }}>
                        <table className="data-table">
                            <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'white' }}>
                                <tr>
                                    {isAdmin && <th style={{ width: '150px' }}>User</th>}
                                    <th style={{ width: '120px' }}>{t.startDate}</th>
                                    <th style={{ width: '120px' }}>{t.endDate}</th>
                                    <th>{t.reason}</th>
                                    <th style={{ width: '140px' }}>{t.status}</th>
                                    <th style={{ width: '50px' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {requests.map(req => (
                                    <tr key={req.id}>
                                        {isAdmin && <td style={{ fontWeight: 600, color: 'var(--primary)' }}>{req.expand?.user?.name || req.expand?.user?.email}</td>}
                                        <td>{new Date(req.start_date).toLocaleDateString()}</td>
                                        <td>{new Date(req.end_date).toLocaleDateString()}</td>
                                        <td>{req.reason}</td>
                                        <td>
                                            {isAdmin ? (
                                                <select className="input" value={req.status} onChange={(e) => handleStatusChange(req.id, e.target.value)}>
                                                    <option value="pending">{t.statusPending}</option>
                                                    <option value="approved">{t.statusApproved}</option>
                                                    <option value="rejected">{t.statusRejected}</option>
                                                </select>
                                            ) : (
                                                <span className={`badge ${req.status === 'approved' ? 'badge-success' : req.status === 'rejected' ? 'badge-error' : 'badge-neutral'}`}>
                                                    {getStatusLabel(req.status)}
                                                </span>
                                            )}
                                        </td>
                                        <td>
                                            {(isAdmin || (req.user === currentUser?.id && req.status === 'pending')) && (
                                                <button onClick={() => handleDelete(req.id)} className="btn-icon">🗑️</button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}