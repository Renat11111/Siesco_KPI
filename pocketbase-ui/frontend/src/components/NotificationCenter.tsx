import React, { useState, useEffect, useRef } from 'react';
import pb from '../lib/pocketbase';
import { IconBell, IconCheck, IconTrash } from './Icons';

interface Notification {
    id: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
    is_read: boolean;
    created: string;
}

export default function NotificationCenter() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const userId = pb.authStore.record?.id;

    const fetchNotifications = async () => {
        if (!userId) return;
        try {
            const records = await pb.collection('notifications').getList<Notification>(1, 50, {
                sort: '-created',
                filter: `user = "${userId}"`,
            });
            setNotifications(records.items);
        } catch (e) {
            console.error("Failed to load notifications", e);
        }
    };

    useEffect(() => {
        fetchNotifications();

        const sub = pb.collection('notifications').subscribe('*', (e) => {
            if (e.record.user === userId) {
                fetchNotifications();
            }
        });

        return () => {
            pb.collection('notifications').unsubscribe('*');
        };
    }, [userId]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const markAsRead = async (id: string) => {
        try {
            // Optimistic update
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
            await pb.collection('notifications').update(id, { is_read: true });
        } catch (e) {
            console.error(e);
        }
    };

    const markAllRead = async () => {
        try {
            const unread = notifications.filter(n => !n.is_read);
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            
            // In a real app we'd have a batch endpoint, here we do parallel requests (fine for small numbers)
            await Promise.all(unread.map(n => pb.collection('notifications').update(n.id, { is_read: true })));
        } catch (e) {
            console.error(e);
        }
    };

    const deleteNotification = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            setNotifications(prev => prev.filter(n => n.id !== id));
            await pb.collection('notifications').delete(id);
        } catch (err) {
            console.error(err);
        }
    };

    const unreadCount = notifications.filter(n => !n.is_read).length;

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'success': return '#10b981';
            case 'warning': return '#f59e0b';
            case 'error': return '#ef4444';
            default: return '#3b82f6';
        }
    };

    return (
        <div ref={containerRef} style={{ position: 'relative' }}>
            <button 
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    position: 'relative', padding: '8px', color: '#64748b',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
                title="Уведомления"
            >
                <IconBell />
                {unreadCount > 0 && (
                    <span style={{
                        position: 'absolute', top: '4px', right: '4px',
                        background: '#ef4444', color: 'white', fontSize: '10px',
                        fontWeight: 'bold', minWidth: '16px', height: '16px',
                        borderRadius: '8px', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', border: '2px solid white'
                    }}>
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div style={{
                    position: 'absolute', top: '100%', right: '0',
                    width: '320px', background: 'white', borderRadius: '12px',
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                    border: '1px solid #e2e8f0', zIndex: 9999,
                    display: 'flex', flexDirection: 'column', maxHeight: '400px',
                    marginTop: '12px', animation: 'fadeIn 0.2s ease-out'
                }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, fontSize: '14px', color: '#1e293b' }}>Уведомления</span>
                        {unreadCount > 0 && (
                            <button onClick={markAllRead} style={{ fontSize: '11px', color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer' }}>
                                Прочитать все
                            </button>
                        )}
                    </div>

                    <div style={{ overflowY: 'auto', flex: 1 }}>
                        {notifications.length === 0 ? (
                            <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                                Нет новых уведомлений
                            </div>
                        ) : (
                            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                {notifications.map(n => (
                                    <li key={n.id} 
                                        onClick={() => !n.is_read && markAsRead(n.id)}
                                        style={{
                                            padding: '12px 16px', borderBottom: '1px solid #f8fafc',
                                            background: n.is_read ? 'white' : '#eff6ff',
                                            cursor: n.is_read ? 'default' : 'pointer',
                                            position: 'relative',
                                            transition: 'background 0.2s'
                                        }}
                                        className="notification-item"
                                    >
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: getTypeColor(n.type), marginTop: '6px', flexShrink: 0 }}></div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: '13px', color: '#334155', lineHeight: '1.4', marginBottom: '4px' }}>
                                                    {n.message}
                                                </div>
                                                <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                                                    {new Date(n.created).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            </div>
                                            <button 
                                                onClick={(e) => deleteNotification(n.id, e)}
                                                className="delete-btn"
                                                style={{ border: 'none', background: 'transparent', color: '#cbd5e1', cursor: 'pointer', padding: '4px' }}
                                                title="Удалить"
                                            >
                                                <IconTrash />
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}
            <style>{`
                .notification-item:hover .delete-btn { color: #ef4444 !important; }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>
        </div>
    );
}
