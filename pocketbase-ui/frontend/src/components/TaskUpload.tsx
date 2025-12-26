import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import pb, { getUserFiles, clearRankingCache, handleApiError } from '../lib/pocketbase';
import { translations, Language } from '../lib/translations';
import DailyStats from './DailyStats';
import MonthlyStats from './MonthlyStats';
import ComparisonStats from './ComparisonStats';

interface TaskUploadProps {
    lang: Language;
}

interface TaskField {
    key: string;
    title: string;
    type: string;
    required: boolean;
    width?: string;
}

interface User {
    id: string;
    name: string;
    email: string;
}

export default function TaskUpload({ lang }: TaskUploadProps) {
    const t = translations[lang];

    const [uploading, setUploading] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [detailedErrors, setDetailedErrors] = useState<string[]>([]);
    const [dragActive, setDragActive] = useState(false);
    const [refreshStats, setRefreshStats] = useState(0); 
    const [validStatuses, setValidStatuses] = useState<string[]>([]);
    const [taskFields, setTaskFields] = useState<TaskField[]>([]);
    
    // Стабильный пользователь
    const [currentUser, setCurrentUser] = useState(pb.authStore.record);
    useEffect(() => {
        const unsubscribe = pb.authStore.onChange((_token, record) => {
            setCurrentUser(record);
        });
        return () => unsubscribe();
    }, []);

    const getLocalDate = () => {
        const d = new Date();
        const offset = d.getTimezoneOffset() * 60000;
        return (new Date(d.getTime() - offset)).toISOString().slice(0, 10);
    };

    const [fileDate, setFileDate] = useState(getLocalDate()); 
    const [isSuperAdmin, setIsSuperAdmin] = useState(false);
    const [users, setUsers] = useState<User[]>([]);
    const [selectedUserId, setSelectedUserId] = useState<string>('');
    const [uploadMode, setUploadMode] = useState<'upload' | 'delete'>('upload');
    
    const [availableFiles, setAvailableFiles] = useState<{id: string, file_name: string}[]>([]);
    const [selectedFileToDelete, setSelectedFileToDelete] = useState<string>('');
    const [deletionReason, setDeletionReason] = useState('');

    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (uploadMode === 'delete') {
            const targetUser = selectedUserId || currentUser?.id;
            if (targetUser && fileDate) {
                setUploading(true);
                getUserFiles(targetUser, fileDate).then(files => {
                    setAvailableFiles(files);
                    if (files.length > 0) setSelectedFileToDelete(files[0].id);
                }).finally(() => setUploading(false));
            }
        }
    }, [uploadMode, fileDate, selectedUserId, refreshStats, currentUser?.id]);

    useEffect(() => {
        const loadInitialData = async () => {
            if (currentUser) {
                setSelectedUserId(currentUser.id);
                if (currentUser.superadmin) {
                    setIsSuperAdmin(true);
                    try {
                        const allUsers = await pb.collection('users').getFullList<User>({ sort: 'name', requestKey: null });
                        setUsers(allUsers);
                    } catch (e) { console.error(e); }
                }
            }

            try {
                const statusRecords = await pb.collection('statuses').getFullList({ requestKey: null });
                setValidStatuses(statusRecords.map(r => r.title));

                const fieldRecords = await pb.collection('task_fields').getFullList({ sort: 'order', requestKey: null });
                setTaskFields(fieldRecords.map(r => ({
                    key: r.key, title: r.title, type: r.type, required: r.required, width: r.width
                })));
            } catch (err) { console.error(err); }
        };
        loadInitialData();
    }, [currentUser?.id]);

    const handleFiles = (files: FileList | null) => {
        const file = files?.[0];
        if (inputRef.current) inputRef.current.value = '';
        if (file) processFile(file);
    };

    const handleDeleteExisting = async () => {
        if (!selectedFileToDelete || !deletionReason.trim()) return;
        const fileRecord = availableFiles.find(f => f.id === selectedFileToDelete);
        if (!fileRecord || !confirm(`${t.confirmDelete} "${fileRecord.file_name}"?`)) return;

        setUploading(true);
        try {
            const record = await pb.collection('tasks').getOne(selectedFileToDelete);
            const fileUrl = pb.files.getUrl(record, record.excel_file);
            const res = await fetch(fileUrl);
            const blob = await res.blob();

            const formData = new FormData();
            formData.append('file_name', record.file_name);
            formData.append('reason', deletionReason);
            if (currentUser) formData.append('deleted_by', currentUser.id);
            formData.append('excel_file', blob, record.excel_file); 

            await pb.collection('deletion_logs').create(formData);
            await pb.collection('tasks').delete(record.id);
            clearRankingCache();
            setMessage(t.fileDeleted);
            setRefreshStats(prev => prev + 1); 
        } catch (err: any) { setError(handleApiError(err, t)); } finally { setUploading(false); }
    };

    const getFormattedDateForCheck = (iso: string) => {
        const parts = iso.split('-');
        return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : "";
    };

    const parseDateStrict = (excelDate: any): string | null => {
        if (!excelDate) return null;
        try {
            if (typeof excelDate === 'number') {
                 const date = new Date(Math.round((excelDate - 25569)*86400*1000));
                 return date.toISOString();
            }
            if (typeof excelDate === 'string') {
                const parts = excelDate.trim().split('.');
                if (parts.length === 3) {
                    const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
                    d.setHours(12); return d.toISOString();
                }
                const d = new Date(excelDate);
                if (!isNaN(d.getTime())) return d.toISOString();
            }
        } catch (e) { return null; }
        return null;
    };

    const processFile = (file: File) => {
        setUploading(true); setMessage(t.validating); setError(''); setDetailedErrors([]);
        if (validStatuses.length === 0 || taskFields.length === 0) {
            setError("Configuration error."); setUploading(false); return;
        }

        const requiredPrefix = getFormattedDateForCheck(fileDate);
        if (!file.name.startsWith(requiredPrefix)) {
            setError(`${t.errorPrefix} "${requiredPrefix}"`); setUploading(false); return;
        }

        const targetUserId = selectedUserId || currentUser?.id;
        if (isSuperAdmin && currentUser && targetUserId !== currentUser.id) {
            const name = users.find(u => u.id === targetUserId)?.name || targetUserId;
            // @ts-ignore
            if (t.confirmUploadForOther && !window.confirm(t.confirmUploadForOther.replace("{name}", name))) {
                setUploading(false); return;
            }
        }

        setMessage(t.reading);

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                let ws = wb.Sheets["Лист1"] || wb.Sheets[wb.SheetNames[0]];
                const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
                
                const headers = (data[0] as any[]).map(h => h?.toString().trim().toLowerCase());
                const columnMapping: Record<string, number> = {};
                taskFields.forEach(f => {
                    const idx = headers.findIndex(h => h === f.title.toLowerCase());
                    if (idx !== -1) columnMapping[f.key] = idx;
                });

                const missing = taskFields.filter(f => f.required && columnMapping[f.key] === undefined);
                if (missing.length > 0) throw new Error(`${t.infoColsTitle} ${missing.map(f=>f.title).join(", ")}`);

                const rows = data.slice(1);
                const parsedTasks: any[] = [];
                const vErrors: string[] = [];

                rows.forEach((row, i) => {
                    const r = row as any[]; if (!r || r.length === 0) return;
                    const isEmpty = Object.values(columnMapping).every(idx => !r[idx]); if (isEmpty) return;

                    const task: any = {}; let rowOk = true;
                    taskFields.forEach(f => {
                        if (!rowOk) return;
                        
                        // Игнорируем системные поля, которых нет в Excel
                        if (f.key === 'original_time_spent' || f.key === 'is_edited') return;

                        const colIdx = columnMapping[f.key];
                        if (colIdx === undefined) {
                            if (f.required) { vErrors.push(`${t.row} ${i+2}: ${t.infoColsTitle} '${f.title}'`); rowOk = false; }
                            return;
                        }

                        const val = r[colIdx];
                        if (f.required && (val === undefined || val === null || val === "")) { 
                            vErrors.push(`${t.row} ${i+2}: '${f.title}' ${t.fieldIsEmpty}`); rowOk = false; return; 
                        }
                        
                        if (f.type === 'number') {
                            const num = Number(val?.toString().replace(',', '.'));
                            if (isNaN(num)) { vErrors.push(`${t.row} ${i+2}: '${f.title}' ${t.mustBeNumber}`); rowOk = false; }
                            task[f.key] = num || 0;
                        } else if (f.type === 'date') {
                            task[f.key] = parseDateStrict(val) || new Date(fileDate).toISOString();
                        } else if (f.key === 'status') {
                            if (val && !validStatuses.includes(val.toString().trim())) {
                                vErrors.push(`${t.row} ${i+2}: '${f.title}' ${t.invalidValue}`); rowOk = false;
                            }
                            task[f.key] = val?.toString().trim() || "";
                        } else task[f.key] = val?.toString().trim() || "";
                    });
                    if (rowOk) parsedTasks.push(task);
                });

                if (vErrors.length > 0) { setError(t.validationFailed); setDetailedErrors(vErrors); setUploading(false); return; }

                const formData = new FormData();
                formData.append('excel_file', file);
                formData.append('file_name', file.name);
                formData.append('file_date', new Date(fileDate).toISOString());
                formData.append('data', JSON.stringify(parsedTasks));
                formData.append('user', targetUserId || '');
                if (isSuperAdmin && currentUser) formData.append('uploaded_by', currentUser.id);

                await pb.collection('tasks').create(formData);
                clearRankingCache(); 
                
                if (isSuperAdmin && currentUser) {
                    try {
                        await pb.collection('upload_logs').create({ file_name: file.name, uploaded_by: currentUser.id, target_user: targetUserId });
                    } catch (logErr) {
                        console.error("Failed to create upload log:", logErr);
                        // Non-blocking error
                    }
                }

                setMessage(`${t.successMsg} ${parsedTasks.length} ${t.tasksCount}.`);
                setRefreshStats(prev => prev + 1); 
            } catch (err: any) { setError(handleApiError(err, t)); } finally { setUploading(false); }
        };
        reader.readAsBinaryString(file);
    };

    let statusContent;
    if (uploading) {
        statusContent = (
            <div className="status-card processing-card" style={{height: '100%', justifyContent: 'center'}}>
                <div className="spinner"></div>
                <p>{message}</p>
            </div>
        );
    } else if (error) {
        statusContent = (
            <div className="status-card error" style={{height: '100%'}}>
                <div className="status-card-header" style={{display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem'}}>
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
            <div className="status-card success" style={{height: '100%', justifyContent: 'center'}}>
                <div style={{display: 'flex', gap: '0.5rem', alignItems: 'center'}}>
                    <svg className="status-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    <span className="status-title">{message}</span>
                </div>
            </div>
        );
    } else {
        const requiredFieldsText = taskFields.filter(f => f.required).map(f => f.title).join(", ");
        statusContent = (
            <div className="status-card info" style={{height: '100%'}}>
                <div style={{display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem'}}>
                    <div style={{padding: '4px', background: '#dbeafe', borderRadius: '50%', color: '#1e40af', display: 'flex'}}>
                        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <span className="status-title" style={{fontWeight: 600, fontSize: '0.9rem'}}>{t.infoTitle}</span>
                </div>
                <ul className="info-list">
                    <li>{t.ruleName}</li>
                    <li>{t.ruleLimit}</li>
                    <li>{t.ruleUnique}</li>
                    <li>{t.infoColsTitle} {requiredFieldsText}</li>
                </ul>
            </div>
        );
    }

    return (
        <div className="upload-grid">
            <div className="dashboard-card grid-cell-upload" style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
                <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                        <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                            <div style={{padding: '6px', background: '#eff6ff', borderRadius: '6px', color: 'var(--primary)'}}>
                                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                            </div>
                            <h3 style={{margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)'}}>{t.uploadTitle}</h3>
                        </div>
                        <div style={{display: 'flex', gap: '0.5rem', alignItems: 'center'}}>
                            {isSuperAdmin && users.length > 0 && <select className="input input-compact" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} style={{maxWidth: '150px'}}>{users.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}</select>}
                            {isSuperAdmin && <select className="input input-compact" value={uploadMode} onChange={(e) => setUploadMode(e.target.value as any)} style={{ maxWidth: '120px' }}><option value="upload">{t.modeUpload}</option><option value="delete">{t.modeDelete}</option></select>}
                            <input className="input input-date-compact" type="date" value={fileDate} onChange={(e) => setFileDate(e.target.value)} disabled={!isSuperAdmin} />
                        </div>
                    </div>
                    {uploadMode === 'upload' ? (
                        <div className={`drop-zone ${dragActive ? 'active' : ''}`} onDragOver={(e)=>{e.preventDefault(); setDragActive(true)}} onDragLeave={()=>setDragActive(false)} onDrop={(e)=>{e.preventDefault(); setDragActive(false); handleFiles(e.dataTransfer.files)}} onClick={()=>inputRef.current?.click()} style={{minHeight: '120px'}}>
                            <input ref={inputRef} type="file" accept=".xlsx, .xls" onChange={(e)=>handleFiles(e.target.files)} style={{ display: 'none' }} disabled={uploading} />
                            <svg className="drop-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                            <p className="drop-text">{uploading ? t.processing : t.dragDrop}</p>
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
                </div>
                <div style={{flex: 1}}>{statusContent}</div>
            </div>
            <ComparisonStats lang={lang} refreshTrigger={refreshStats} className="grid-cell-comp" />
            <div className="grid-cell-daily"><DailyStats lang={lang} refreshTrigger={refreshStats} /></div>
            <MonthlyStats lang={lang} refreshTrigger={refreshStats} className="grid-cell-monthly" />
        </div>
    );
}
