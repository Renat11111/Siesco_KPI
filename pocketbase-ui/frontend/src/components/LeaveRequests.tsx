import { useState, useEffect, useMemo } from 'react';
import pb, { handleApiError } from '../lib/pocketbase';
import { translations, Language } from '../lib/translations';

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
    
    // 1. Dynamic Auth Monitoring
    const [currentUser, setCurrentUser] = useState(pb.authStore.record);
    const isAdmin = useMemo(() => {
        if (!currentUser) return false;
        return currentUser.superadmin === true || currentUser.is_coordinator === true;
    }, [currentUser]);

    // Update local user state if global auth store changes
    useEffect(() => {
        const unsubscribe = pb.authStore.onChange((_token, record) => {
            console.log("[LeaveRequests] Auth store changed dynamically");
            setCurrentUser(record);
        });
        return () => unsubscribe();
    }, []);

    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [reason, setReason] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const getLocalStr = (d: Date) => {
        const offset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - offset).toISOString().split('T')[0];
    };

    const [filterStart, setFilterStart] = useState(() => {
        const now = new Date();
        return getLocalStr(new Date(now.getFullYear(), now.getMonth(), 1));
    });
    const [filterEnd, setFilterEnd] = useState(() => {
        const now = new Date();
        return getLocalStr(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    });

    const today = getLocalStr(new Date());

    const fetchRequests = async () => {
        const authUser = pb.authStore.record;
        if (!authUser?.id) return;
        
        setLoading(true);
        setFetchError('');
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

            // Final identity check: ensure we didn't switch users during the fetch
            if (pb.authStore.record?.id === authUser.id) {
                setRequests(records.items);
            }
        } catch (err: any) {
            if (err.isAbort) return;
            setFetchError(handleApiError(err, t));
        } finally {
            setLoading(false);
        }
    };

    // Load data and handle Real-time
    useEffect(() => {
        if (!currentUser?.id) return;

        fetchRequests();

        // 2. Simple & Reliable Subscription
        // We subscribe to all changes in the collection to ensure delete events are caught.
        // fetchRequests() will handle the actual data filtering based on the current user.
        const sub = pb.collection('leave_requests').subscribe('*', (e) => {
            console.log("[LeaveRequests] RT event received:", e.action);
            fetchRequests();
        });

        return () => { 
            pb.collection('leave_requests').unsubscribe('*');
        };
    }, [filterStart, filterEnd, currentUser?.id, isAdmin]);

    const handleSubmit = async (e: React.FormEvent) => {
        if (isFormSubmitting) return;
        
        e.preventDefault();
        setIsFormSubmitting(true);
        setMessage('');
        setError('');

        if (startDate < today) { setError(t.errorPastDate); setIsFormSubmitting(false); return; }
        if (endDate < startDate) { setError(t.errorEndDate); setIsFormSubmitting(false); return; }

        try {
            await pb.collection('leave_requests').create({
                start_date: startDate,
                end_date: endDate,
                reason: reason,
                status: 'pending',
                user: currentUser?.id
            });
            
            setMessage(t.requestSubmitted);
            setStartDate(''); setEndDate(''); setReason('');
        } catch (err: any) {
            if (err.message?.includes("overlapping dates") || err.message?.includes("error_overlap")) {
                setError(t.errorOverlap);
            } else {
                setError(handleApiError(err, t));
            }
        } finally {
            setIsFormSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        const record = requests.find(r => r.id === id);
        if (!record) return;

        if (!isAdmin && record.user !== currentUser?.id) {
            alert("Access denied");
            return;
        }

        if (!window.confirm(t.confirmDeleteRequest)) return;
        try {
            await pb.collection('leave_requests').delete(id);
        } catch (err: any) {
            alert(handleApiError(err, t));
        }
    };

    const handleStatusChange = async (id: string, newStatus: string) => {
        if (!isAdmin) return;
        try {
            await pb.collection('leave_requests').update(id, { status: newStatus });
        } catch (err: any) {
            alert(handleApiError(err, t));
            fetchRequests();
        }
    };

    return (
        <div className="task-list-container animate-fade-in" style={{ padding: '1rem', height: '100%', overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: '1.5rem', height: '100%' }}>
                
                {/* FORM PANEL */}
                <div className="dashboard-card" style={{ width: '340px', flexShrink: 0, height: '100%', padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
                    <h3 className="section-title" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ color: 'var(--primary)' }}>📅</span>
                        {t.timeOffTitle}
                    </h3>

                    {message && <div className="status-card success" style={{ marginBottom: '1rem' }}>{message}</div>}
                    {error && <div className="status-card error" style={{ marginBottom: '1rem' }}>{error}</div>}

                    <form onSubmit={handleSubmit} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div className="form-group-inline">
                            <label className="form-label">{t.startDate}</label>
                            <input type="date" className="input" required min={today} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                        </div>
                        <div className="form-group-inline">
                            <label className="form-label">{t.endDate}</label>
                            <input type="date" className="input" required min={startDate || today} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                        </div>
                        <div className="form-group-inline" style={{ flex: 1 }}>
                            <label className="form-label">{t.reason}</label>
                            <textarea className="input" required value={reason} onChange={(e) => setReason(e.target.value)} style={{ resize: 'none', height: '100%', minHeight: '120px' }} />
                        </div>
                        <button type="submit" className="btn" disabled={isFormSubmitting} style={{ marginTop: 'auto' }}>
                            {isFormSubmitting ? t.processing : t.submitRequest}
                        </button>
                    </form>
                </div>

                {/* LIST PANEL */}
                <div className="dashboard-card" style={{ flex: 1, minWidth: 0, height: '100%', padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <h3 className="section-title" style={{ margin: 0, fontSize: '1rem' }}>{t.requestHistory}</h3>
                            <span className="badge badge-neutral">{requests.length}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t.filterPeriod}:</span>
                            <input type="date" className="input" style={{ width: '130px', height: '30px', fontSize: '0.8rem' }} value={filterStart} onChange={(e) => setFilterStart(e.target.value)} />
                            <span>-</span>
                            <input type="date" className="input" style={{ width: '130px', height: '30px', fontSize: '0.8rem' }} value={filterEnd} onChange={(e) => setFilterEnd(e.target.value)} />
                        </div>
                    </div>

                    <div className="table-wrapper" style={{ border: 'none', flex: 1, overflowY: 'auto' }}>
                        {loading && requests.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '3rem' }}>{t.loading}</div>
                        ) : requests.length === 0 ? (
                            <div className="empty-state" style={{ margin: '3rem' }}>{t.noTasks}</div>
                        ) : (
                            <table className="data-table">
                                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
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
                                            {isAdmin && <td style={{ fontWeight: 600, color: 'var(--primary)' }}>{req.expand?.user?.name || req.expand?.user?.email || "User"}</td>}
                                            <td>{new Date(req.start_date).toLocaleDateString()}</td>
                                            <td>{new Date(req.end_date).toLocaleDateString()}</td>
                                            <td style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{req.reason}</td>
                                            <td>
                                                {isAdmin ? (
                                                    <select className="input" value={req.status} onChange={(e) => handleStatusChange(req.id, e.target.value)} style={{ height: '30px', padding: '0 5px', fontSize: '0.8rem', fontWeight: 600 }}>
                                                        <option value="pending">{t.statusPending}</option>
                                                        <option value="approved">{t.statusApproved}</option>
                                                        <option value="rejected">{t.statusRejected}</option>
                                                    </select>
                                                ) : (
                                                    <span className="badge" style={{ 
                                                        backgroundColor: req.status === 'approved' ? 'var(--success-bg)' : req.status === 'rejected' ? 'var(--error-bg)' : '#fffbeb',
                                                        color: req.status === 'approved' ? 'var(--success)' : req.status === 'rejected' ? 'var(--error)' : '#d97706'
                                                    }}>
                                                        {req.status === 'approved' ? t.statusApproved : req.status === 'rejected' ? t.statusRejected : t.statusPending}
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                {(isAdmin || (req.user === currentUser?.id && req.status === 'pending')) && (
                                                    <button onClick={() => handleDelete(req.id)} className="btn-icon" style={{ color: 'var(--text-light)' }}>🗑️</button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
