import { useState, useEffect } from 'react';
import pb from '../lib/pocketbase';
import { ClientResponseError } from 'pocketbase';
import TaskUpload from './TaskUpload';
import TaskList from './TaskList';
import AnalyticsView from './AnalyticsView';
import LeaveRequests from './LeaveRequests';
import { translations, Language } from '../lib/translations';
import { IconUpload, IconList, IconLogout, IconUser, IconChart, IconCalendar } from './Icons';
import logo from '../assets/images/logo.jpg';

type ViewMode = 'upload' | 'list' | 'analytics' | 'timeoff';

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

    // Глобальное отслеживание авторизации
    useEffect(() => {
        const unsubscribe = pb.authStore.onChange((_token, record) => {
            console.log("[Auth] Auth store changed, updating user state");
            setUser(record);
        });
        return () => unsubscribe();
    }, []);

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
                {/* Sidebar */}
                <aside className="sidebar">
                    <div className="sidebar-logo">
                        <img src={logo} alt="Siesco KPI" className="sidebar-brand-img" />
                    </div>
                    
                    <nav className="nav-menu">
                        <button 
                            className={`nav-item ${viewMode === 'upload' ? 'active' : ''}`}
                            onClick={() => setViewMode('upload')}
                        >
                            <IconUpload />
                            {t.tabUpload}
                        </button>
                        <button 
                            className={`nav-item ${viewMode === 'analytics' ? 'active' : ''}`}
                            onClick={() => setViewMode('analytics')}
                        >
                            <IconChart />
                            {t.tabAnalytics}
                        </button>
                        <button 
                            className={`nav-item ${viewMode === 'list' ? 'active' : ''}`}
                            onClick={() => setViewMode('list')}
                        >
                            <IconList />
                            {t.tabView}
                        </button>
                        <button 
                            className={`nav-item ${viewMode === 'timeoff' ? 'active' : ''}`}
                            onClick={() => setViewMode('timeoff')}
                        >
                            <IconCalendar />
                            {t.tabTimeOff}
                        </button>
                    </nav>

                    <div className="sidebar-footer">
                        <button className="nav-item" onClick={logout}>
                            <IconLogout />
                            {t.logout}
                        </button>
                    </div>
                </aside>

                {/* Main Content */}
                <main className="main-content">
                    {/* Header */}
                    <header className="top-header">
                        <div className="header-title">
                            {/* Dynamic Title based on view */}
                            {viewMode === 'upload' ? t.uploadTitle : 
                             viewMode === 'analytics' ? t.tabAnalytics : 
                             viewMode === 'list' ? t.myTasks : 
                             t.tabTimeOff}
                        </div>
                        <div className="header-actions">
                            <div className="user-profile">
                                <IconUser />
                                {user.email || user.name || "User"}
                            </div>
                            <select 
                                className="lang-select" 
                                value={lang} 
                                onChange={(e) => setLang(e.target.value as Language)}
                            >
                                <option value="ru">RU</option>
                                <option value="az">AZ</option>
                                <option value="en">EN</option>
                            </select>
                        </div>
                    </header>

                    {/* Scrollable Page Content */}
                    <div className="page-content">
                        <div className={`container-wrapper ${viewMode === 'upload' ? 'container-upload' : 'container-wide'} `}>
                            {viewMode === 'upload' ? (
                                <TaskUpload lang={lang} user={user} />
                            ) : viewMode === 'analytics' ? (
                                <AnalyticsView lang={lang} />
                            ) : viewMode === 'list' ? (
                                <TaskList lang={lang} user={user} />
                            ) : (
                                <LeaveRequests lang={lang} user={user} />
                            )}
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    // --- Render: Login Page (Logged Out) ---
    return (
        <div className="auth-layout animate-fade-in">
            <div className="auth-card" style={{
                padding: '2.5rem',
                gap: '1.5rem',
                borderTop: '4px solid #ef4444', // Red line fix
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)', // Original shadow
            }}>
                {/* Logo Section */}
                <img src={logo} alt="SESCO" className="auth-logo" style={{
                    maxWidth: '160px', // Original size
                    margin: '0 auto 1rem auto', // Original margin
                }} />
                <div className="auth-welcome">{t.welcomeMessage}</div>

                <h2 style={{textAlign: 'center', marginBottom: '1rem', fontSize: '1.5rem', fontWeight: 700}}>{isLogin ? t.login : t.createAccount}</h2>
                
                {error && (
                    <div className="status-card error">
                        <strong>Error:</strong> {error}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    {!isLogin && (
                        <div className="form-group" style={{marginBottom: '1.5rem'}}>
                            <label className="form-label">{t.name}</label>
                            <input
                                className="input"
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                                placeholder={t.name}
                                style={{padding: '0.75rem 1rem', fontSize: '1rem', height: 'auto'}}
                            />
                            {fieldErrors?.name && <small className="form-error-message">{fieldErrors.name.message}</small>}
                        </div>
                    )}

                    <div className="form-group" style={{marginBottom: '1.5rem'}}>
                        <label className="form-label">{t.email}</label>
                        <input
                            className="input"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            placeholder="name@example.com"
                            style={{padding: '0.75rem 1rem', fontSize: '1rem', height: 'auto'}}
                        />
                        {fieldErrors?.email && <small className="form-error-message">{fieldErrors.email.message}</small>}
                    </div>
                    
                    <div className="form-group" style={{marginBottom: '1.5rem'}}>
                        <label className="form-label">{t.password}</label>
                        <input
                            className="input"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={8} 
                            placeholder="••••••••"
                            style={{padding: '0.75rem 1rem', fontSize: '1rem', height: 'auto'}}
                        />
                         {fieldErrors?.password && <small className="form-error-message">{fieldErrors.password.message}</small>}
                    </div>

                    {!isLogin && (
                        <div className="form-group" style={{marginBottom: '1.5rem'}}>
                            <label className="form-label">{t.confirmPassword}</label>
                            <input
                                className="input"
                                type="password"
                                value={passwordConfirm}
                                onChange={(e) => setPasswordConfirm(e.target.value)}
                                required
                                minLength={8}
                                placeholder="••••••••"
                                style={{padding: '0.75rem 1rem', fontSize: '1rem', height: 'auto'}}
                            />
                            {fieldErrors?.passwordConfirm && <small className="form-error-message">{fieldErrors.passwordConfirm.message}</small>}
                        </div>
                    )}

                    <button className="btn mt-4" type="submit" disabled={loading} style={{padding: '0.75rem', fontSize: '1rem', height: 'auto', marginTop: '1rem'}}>
                        {loading ? t.processing : (isLogin ? t.login : t.register)}
                    </button>
                </form>

                <div style={{textAlign: 'center', marginTop: '0.5rem'}}>
                    <button 
                        className="btn-secondary"
                        onClick={() => {
                            setIsLogin(!isLogin);
                            setError('');
                            setFieldErrors({});
                        }}
                    >
                        {isLogin ? t.dontHaveAccount : t.alreadyHaveAccount}
                    </button>
                </div>

                {/* Minimal Lang Select at Bottom */}
                <select 
                    className="lang-select-minimal" 
                    value={lang} 
                    onChange={(e) => setLang(e.target.value as Language)}
                >
                    <option value="ru">Русский</option>
                    <option value="az">Azərbaycan</option>
                    <option value="en">English</option>
                </select>
            </div>
        </div>
    );
}