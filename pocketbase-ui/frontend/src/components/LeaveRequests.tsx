import { useState, useEffect, useMemo } from 'react';
import pb from '../lib/pocketbase';
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
    user: string; // The owner ID
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
    const [submitting, setSubmitting] = useState(false);
    const [requests, setRequests] = useState<LeaveRequest[]>([]);
    const [fetchError, setFetchError] = useState('');
    
    // 1. Solid Auth Check
    const user = pb.authStore.record;
    const isAdmin = useMemo(() => {
        if (!user) return false;
        const res = user.superadmin === true || user.is_coordinator === true;
        console.log(`[LeaveRequests] User: ${user.email}, isAdmin: ${res}`);
        return res;
    }, [user]);

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
        if (!user) return;
        setLoading(true);
        setFetchError('');
        try {
            const filterExpr = `created >= "${filterStart} 00:00:00" && created <= "${filterEnd} 23:59:59"`;
            const records = await pb.collection('leave_requests').getList<LeaveRequest>(1, 200, {
                filter: filterExpr,
                sort: '-created',
                expand: 'user',
            });
            setRequests(records.items);
        } catch (err: any) {
            console.error("Fetch error", err);
            setFetchError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRequests();
        const sub = pb.collection('leave_requests').subscribe('*', (e) => {
            console.log("[LeaveRequests] Real-time event:", e.action);
            fetchRequests();
        });
        return () => { sub.then(unsub => unsub()); };
    }, [filterStart, filterEnd, user?.id]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setMessage('');
        setError('');

        if (startDate < today) { setError(t.errorPastDate); setSubmitting(false); return; }
        if (endDate < startDate) { setError(t.errorEndDate); setSubmitting(false); return; }

        try {
            await pb.collection('leave_requests').create({
                start_date: startDate,
                end_date: endDate,
                reason: reason,
                status: 'pending'
            });
            setMessage(t.requestSubmitted);
            setStartDate(''); setEndDate(''); setReason('');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm(t.confirmDeleteRequest)) return;
        try {
            await pb.collection('leave_requests').delete(id);
        } catch (err: any) {
            alert(err.message);
        }
    };

    const handleStatusChange = async (id: string, newStatus: string) => {
        try {
            await pb.collection('leave_requests').update(id, { status: newStatus });
        } catch (err: any) {
            alert(err.message);
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
                        <button type="submit" className="btn" disabled={submitting} style={{ marginTop: 'auto' }}>
                            {submitting ? t.processing : t.submitRequest}
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
                        {loading ? (
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
                                                {(isAdmin || req.status === 'pending') && (
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
