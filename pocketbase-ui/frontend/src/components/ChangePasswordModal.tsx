import React, { useState } from 'react';
import pb from '../lib/pocketbase';
import { translations, Language } from '../lib/translations';
import { ClientResponseError } from 'pocketbase';

interface ChangePasswordModalProps {
    lang: Language;
    onClose: () => void;
}

export default function ChangePasswordModal({ lang, onClose }: ChangePasswordModalProps) {
    const t = translations[lang];
    const [oldPassword, setOldPassword] = useState('');
    const [password, setPassword] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        if (password !== passwordConfirm) {
            setError(t.passwordsDoNotMatch);
            setLoading(false);
            return;
        }

        try {
            if (!pb.authStore.record) throw new Error("No user");
            
            await pb.collection('users').update(pb.authStore.record.id, {
                oldPassword: oldPassword,
                password: password,
                passwordConfirm: passwordConfirm,
            });
            
            setSuccess(true);
            setTimeout(() => {
                onClose();
            }, 1500);
        } catch (err: any) {
             console.error("Change password error:", err);
            if (err instanceof ClientResponseError) {
                // PocketBase часто возвращает детализированные ошибки в data
                if (err.data && Object.keys(err.data).length > 0) {
                     // Просто берем первое попавшееся сообщение
                     const firstKey = Object.keys(err.data)[0];
                     const msg = err.data[firstKey].message;
                     setError(`${firstKey}: ${msg}`);
                } else {
                    setError(err.message);
                }
            } else if (err instanceof Error) {
                setError(err.message);
            } else {
                setError(t.genericError);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '400px'}}>
                <h3 style={{marginTop: 0}}>{t.changePassword}</h3>
                
                {success ? (
                    <div className="status-card success">
                        {t.passwordChangedSuccess}
                    </div>
                ) : (
                    <form onSubmit={handleSubmit}>
                        {error && <div className="status-card error">{error}</div>}
                        
                        <div className="form-group">
                            <label className="form-label">{t.oldPassword}</label>
                            <input 
                                className="input" 
                                type="password" 
                                value={oldPassword} 
                                onChange={e => setOldPassword(e.target.value)} 
                                required 
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">{t.newPassword}</label>
                            <input 
                                className="input" 
                                type="password" 
                                value={password} 
                                onChange={e => setPassword(e.target.value)} 
                                required 
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">{t.newPasswordConfirm}</label>
                            <input 
                                className="input" 
                                type="password" 
                                value={passwordConfirm} 
                                onChange={e => setPasswordConfirm(e.target.value)} 
                                required 
                            />
                        </div>

                        <div className="modal-actions">
                            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading} style={{background: 'transparent', border: '1px solid #e2e8f0', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer'}}>
                                {t.cancel}
                            </button>
                            <button type="submit" className="btn" disabled={loading} style={{width: 'auto'}}>
                                {loading ? t.processing : t.save}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}