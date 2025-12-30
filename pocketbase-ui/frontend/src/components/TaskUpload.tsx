import React, { useState, useRef, useEffect } from 'react';
import pb, { getUserFiles } from '../lib/pocketbase';
import { translations, Language } from '../lib/translations';
import DailyStats from './DailyStats';
import MonthlyStats from './MonthlyStats';
import ComparisonStats from './ComparisonStats';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { useTaskUpload } from '../hooks/useTaskUpload';

interface TaskUploadProps {
    lang: Language;
}

export default function TaskUpload({ lang }: TaskUploadProps) {
    const t = translations[lang];
    
    // Logic extracted to hook
    const {
        uploading, message,
        error, setError,
        detailedErrors, 
        currentUser, isSuperAdmin,
        users, selectedUserId, setSelectedUserId,
        fileDate, setFileDate,
        taskFields, processFile, deleteFile,
        refreshTrigger
    } = useTaskUpload(lang);

    const [dragActive, setDragActive] = useState(false);
    const [uploadMode, setUploadMode] = useState<'upload' | 'delete'>('upload');
    const [availableFiles, setAvailableFiles] = useState<{id: string, file_name: string}[]>([]);
    const [selectedFileToDelete, setSelectedFileToDelete] = useState<string>('');
    const [deletionReason, setDeletionReason] = useState('');

    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (uploadMode === 'delete') {
            const targetUser = selectedUserId || currentUser?.id;
            if (targetUser && fileDate) {
                getUserFiles(targetUser, fileDate).then(files => {
                    setAvailableFiles(files);
                    if (files.length > 0) setSelectedFileToDelete(files[0].id);
                });
            }
        }
    }, [uploadMode, fileDate, selectedUserId, refreshTrigger, currentUser?.id]);

    const handleFiles = (files: FileList | null) => {
        const file = files?.[0];
        if (inputRef.current) inputRef.current.value = '';
        if (file) processFile(file);
    };

    const handleDeleteExisting = async () => {
        await deleteFile(selectedFileToDelete, deletionReason, availableFiles);
    };

    let statusContent;
    if (uploading) {
        statusContent = (
            <div className="status-card processing-card" style={{ justifyContent: 'center' }}>
                <div className="spinner"></div>
                <p>{message}</p>
            </div>
        );
    } else if (error) {
        statusContent = (
            <div className="status-card error">
                <div className="status-card-header" style={{display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: detailedErrors.length > 0 ? '0.5rem' : 0}}>
                    <svg className="status-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <span className="status-title" style={{fontWeight: 600}}>{error}</span>
                </div>
                {detailedErrors.length > 0 && (
                    <ul className="error-list" style={{margin: 0, paddingLeft: '1.2rem'}}>
                        {detailedErrors.map((err, idx) => <li key={idx}>{err}</li>)}
                    </ul>
                )}
            </div>
        );
    } else if (message) {
        statusContent = (
            <div className="status-card success" style={{ justifyContent: 'center' }}>
                <div style={{display: 'flex', gap: '0.5rem', alignItems: 'center'}}>
                    <svg className="status-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    <span className="status-title">{message}</span>
                </div>
            </div>
        );
    } else {
        const requiredFieldsText = taskFields.filter(f => f.required).map(f => f.title).join(", ");
        statusContent = (
            <div className="status-card info">
                <div style={{display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem'}}>
                    <div style={{padding: '4px', background: '#dbeafe', borderRadius: '50%', color: '#1e40af', display: 'flex'}}>
                        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <span className="status-title" style={{fontWeight: 600, fontSize: '0.9rem'}}>{t.infoTitle}</span>
                </div>
                <ul className="info-list" style={{ margin: 0 }}>
                    <li>{t.ruleName}</li>
                    <li>{t.ruleLimit}</li>
                    <li>{t.ruleUnique}</li>
                    <li>{t.infoColsTitle} {requiredFieldsText}</li>
                </ul>
            </div>
        );
    }

    const uploadTitle = (
        <>
            <div style={{padding: '6px', background: '#eff6ff', borderRadius: '6px', color: 'var(--primary)'}}>
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            </div>
            <h3 style={{margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)'}}>{t.uploadTitle}</h3>
        </>
    );

    const uploadExtra = (
        <div style={{display: 'flex', gap: '0.5rem', alignItems: 'center'}}>
            {isSuperAdmin && users.length > 0 && (
                <select className="input input-compact" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} style={{maxWidth: '150px'}}>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                </select>
            )}
            {isSuperAdmin && (
                <select className="input input-compact" value={uploadMode} onChange={(e) => setUploadMode(e.target.value as any)} style={{ maxWidth: '120px' }}>
                    <option value="upload">{t.modeUpload}</option>
                    <option value="delete">{t.modeDelete}</option>
                </select>
            )}
            <input className="input input-date-compact" type="date" value={fileDate} onChange={(e) => setFileDate(e.target.value)} disabled={!isSuperAdmin} />
        </div>
    );

    return (
        <div className="upload-grid">
            <Card title={uploadTitle} extra={uploadExtra} className="grid-cell-upload" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1}}>
                    {uploadMode === 'upload' ? (
                        <div className={`drop-zone ${dragActive ? 'active' : ''}`} onDragOver={(e)=>{e.preventDefault(); setDragActive(true)}} onDragLeave={()=>setDragActive(false)} onDrop={(e)=>{e.preventDefault(); setDragActive(false); handleFiles(e.dataTransfer.files)}} onClick={()=>inputRef.current?.click()} style={{minHeight: '140px'}}>
                            <input ref={inputRef} type="file" accept=".xlsx, .xls" onChange={(e)=>handleFiles(e.target.files)} style={{ display: 'none' }} disabled={uploading} />
                            <svg className="drop-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                            <p className="drop-text" style={{ margin: '8px 0 0 0' }}>{uploading ? t.processing : t.dragDrop}</p>
                        </div>
                    ) : (
                        <div className="delete-zone" style={{ border: '2px dashed #fca5a5', borderRadius: '12px', padding: '1.2rem', background: '#fff1f1', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <select className="input input-compact" value={selectedFileToDelete} onChange={(e) => setSelectedFileToDelete(e.target.value)} disabled={uploading || availableFiles.length === 0} style={{width: '100%', background: 'white'}}>{availableFiles.length === 0 ? <option value="">{t.noTasks}</option> : availableFiles.map(f => <option key={f.id} value={f.id}>{f.file_name}</option>)}</select>
                                <input className="input input-compact" placeholder={t.enterReason} value={deletionReason} onChange={(e) => setDeletionReason(e.target.value)} style={{width: '100%', background: 'white'}} />
                            </div>
                            <button className="btn" onClick={handleDeleteExisting} style={{background: '#ef4444', color: 'white', fontWeight: 700}}>{t.modeDelete}</button>
                        </div>
                    )}
                    <div>{statusContent}</div>
                </div>
            </Card>
            <ComparisonStats lang={lang} refreshTrigger={refreshTrigger} className="grid-cell-comp" />
            <div className="grid-cell-daily"><DailyStats lang={lang} refreshTrigger={refreshTrigger} /></div>
            <MonthlyStats lang={lang} refreshTrigger={refreshTrigger} className="grid-cell-monthly" />
        </div>
    );
}