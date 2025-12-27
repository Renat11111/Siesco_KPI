import { useState } from 'react';
import pb from '../lib/pocketbase';
import { ClientResponseError } from 'pocketbase';
import TaskUpload from './TaskUpload';
import TaskList from './TaskList';
import AnalyticsView from './AnalyticsView';
import LeaveRequests from './LeaveRequests';
import BitrixTasks from './BitrixTasks';
import NotificationCenter from './NotificationCenter';
import ChangePasswordModal from './ChangePasswordModal';
import { translations, Language } from '../lib/translations';
import { IconUpload, IconList, IconLogout, IconUser, IconChart, IconCalendar, IconLock, IconBitrix } from './Icons';
import logo from '../assets/images/logo.jpg';

type ViewMode = 'upload' | 'list' | 'analytics' | 'timeoff' | 'bitrix';

interface AuthProps {
    lang: Language;
    setLang: (lang: Language) => void;
}

export default function Auth({ lang, setLang }: AuthProps) {
    const t = translations[lang];

    const [isLogin, setIsLogin] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [fieldErrors, setFieldErrors] = useState<Record<string, any>>({});
    
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');
    
    const [user, setUser] = useState(pb.authStore.record);
    const [viewMode, setViewMode] = useState<ViewMode>('upload');
    const [showPasswordModal, setShowPasswordModal] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setFieldErrors({});

        try {
            if (isLogin) {
                await pb.collection('users').authWithPassword(email, password);
            } else {
                if (password !== passwordConfirm) {
                    throw new Error(t.passwordsDoNotMatch);
                }
                await pb.collection('users').create({
                    name,
                    email,
                    password,
                    passwordConfirm,
                });
                await pb.collection('users').authWithPassword(email, password);
            }
            setUser(pb.authStore.record);
            setPassword('');
            setPasswordConfirm('');
        } catch (err: any) {
            console.error("Auth error:", err);
            if (err instanceof ClientResponseError) {
                setError(err.message);
                if (err.data && Object.keys(err.data).length > 0) {
                    setFieldErrors(err.data);
                    if (err.data.message) setError(`${err.message}: ${err.data.message}`);
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

    const logout = () => {
        pb.authStore.clear();
        setUser(null);
        setViewMode('upload');
    };

    if (user) {
        return (
            <div className="app-layout animate-fade-in">
                <aside className="sidebar">
                    <div className="sidebar-logo">
                        <img src={logo} alt="Siesco KPI" className="sidebar-brand-img" />
                    </div>
                    
                    <nav className="nav-menu">
                        <button className={`nav-item ${viewMode === 'bitrix' ? 'active' : ''}`} onClick={() => setViewMode('bitrix')}><IconBitrix />{t.tabBitrix}</button>
                        <button className={`nav-item ${viewMode === 'upload' ? 'active' : ''}`} onClick={() => setViewMode('upload')}><IconUpload />{t.tabUpload}</button>
                        <button className={`nav-item ${viewMode === 'analytics' ? 'active' : ''}`} onClick={() => setViewMode('analytics')}><IconChart />{t.tabAnalytics}</button>
                        <button className={`nav-item ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')}><IconList />{t.tabView}</button>
                        <button className={`nav-item ${viewMode === 'timeoff' ? 'active' : ''}`} onClick={() => setViewMode('timeoff')}><IconCalendar />{t.tabTimeOff}</button>
                    </nav>

                    <div className="sidebar-footer">
                        <button className="nav-item" onClick={() => setShowPasswordModal(true)}><IconLock />{t.changePassword}</button>
                        <button className="nav-item" onClick={logout}><IconLogout />{t.logout}</button>
                    </div>
                </aside>

                <main className="main-content">
                    <header className="top-header">
                        <div className="header-title">
                            {viewMode === 'bitrix' ? t.tabBitrix : viewMode === 'upload' ? t.uploadTitle : viewMode === 'analytics' ? t.tabAnalytics : viewMode === 'list' ? t.myTasks : t.tabTimeOff}
                        </div>
                        <div className="header-actions">
                            <NotificationCenter />
                            <div className="user-profile"><IconUser />{user.email || user.name || "User"}</div>
                            <select className="lang-select" value={lang} onChange={(e) => setLang(e.target.value as Language)}>
                                <option value="ru">RU</option><option value="az">AZ</option><option value="en">EN</option>
                            </select>
                        </div>
                    </header>

                    <div className="page-content">
                        <div className={`container-wrapper ${viewMode === 'upload' ? 'container-upload' : 'container-wide'} `}>
                            {viewMode === 'bitrix' ? <BitrixTasks lang={lang} /> : viewMode === 'upload' ? <TaskUpload lang={lang} /> : viewMode === 'analytics' ? <AnalyticsView lang={lang} /> : viewMode === 'list' ? <TaskList lang={lang} /> : <LeaveRequests lang={lang} />}
                        </div>
                    </div>
                    {showPasswordModal && <ChangePasswordModal lang={lang} onClose={() => setShowPasswordModal(false)} />}
                </main>
            </div>
        );
    }

    return (
        <div className="auth-layout animate-fade-in">
            <div className="auth-card" style={{ padding: '2.5rem', gap: '1.5rem', borderTop: '4px solid #ef4444', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)' }}>
                <img src={logo} alt="SESCO" className="auth-logo" style={{ maxWidth: '160px', margin: '0 auto 1rem auto' }} />
                <div className="auth-welcome">{t.welcomeMessage}</div>
                <h2 style={{textAlign: 'center', marginBottom: '1rem', fontSize: '1.5rem', fontWeight: 700}}>{isLogin ? t.login : t.createAccount}</h2>
                {error && <div className="status-card error"><strong>Error:</strong> {error}</div>}
                <form onSubmit={handleSubmit}>
                    {!isLogin && (
                        <div className="form-group" style={{marginBottom: '1.5rem'}}>
                            <label className="form-label">{t.name}</label>
                            <input className="input" type="text" value={name} onChange={(e) => setName(e.target.value)} required style={{padding: '0.75rem 1rem', fontSize: '1rem', height: 'auto'}} />
                        </div>
                    )}
                    <div className="form-group" style={{marginBottom: '1.5rem'}}>
                        <label className="form-label">{t.email}</label>
                        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{padding: '0.75rem 1rem', fontSize: '1rem', height: 'auto'}} />
                    </div>
                    <div className="form-group" style={{marginBottom: '1.5rem'}}>
                        <label className="form-label">{t.password}</label>
                        <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{padding: '0.75rem 1rem', fontSize: '1rem', height: 'auto'}} />
                    </div>
                    {!isLogin && (
                        <div className="form-group" style={{marginBottom: '1.5rem'}}>
                            <label className="form-label">{t.confirmPassword}</label>
                            <input className="input" type="password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} required style={{padding: '0.75rem 1rem', fontSize: '1rem', height: 'auto'}} />
                        </div>
                    )}
                    <button className="btn mt-4" type="submit" disabled={loading} style={{padding: '0.75rem', fontSize: '1rem', height: 'auto', marginTop: '1rem'}}>
                        {loading ? t.processing : (isLogin ? t.login : t.register)}
                    </button>
                </form>
                <div style={{textAlign: 'center', marginTop: '0.5rem'}}>
                    <button className="btn-secondary" onClick={() => { setIsLogin(!isLogin); setError(''); setFieldErrors({}); }}>{isLogin ? t.dontHaveAccount : t.alreadyHaveAccount}</button>
                </div>
                <select className="lang-select-minimal" value={lang} onChange={(e) => setLang(e.target.value as Language)}>
                    <option value="ru">Русский</option><option value="az">Azərbaycan</option><option value="en">English</option>
                </select>
            </div>
        </div>
    );
}