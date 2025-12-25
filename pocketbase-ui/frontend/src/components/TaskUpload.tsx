import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import pb, { getUserFiles } from '../lib/pocketbase';
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
    
    // Use local date string YYYY-MM-DD to match user's timezone
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
    
    // Delete Mode States
    const [availableFiles, setAvailableFiles] = useState<{id: string, file_name: string}[]>([]);
    const [selectedFileToDelete, setSelectedFileToDelete] = useState<string>('');
    const [deletionReason, setDeletionReason] = useState('');

    const inputRef = useRef<HTMLInputElement>(null);

    // Fetch files when entering delete mode or changing filters
    useEffect(() => {
        if (uploadMode === 'delete') {
            const targetUser = selectedUserId || pb.authStore.record?.id;
            if (targetUser && fileDate) {
                // Clear state immediately to show feedback
                setAvailableFiles([]);
                setSelectedFileToDelete('');
                setError('');
                setDetailedErrors([]);
                
                // Set loading state
                setUploading(true);
                setMessage(t.loading);

                getUserFiles(targetUser, fileDate).then(files => {
                    setAvailableFiles(files);
                    if (files.length > 0) {
                        setSelectedFileToDelete(files[0].id);
                        setMessage(''); // Clear loading message if files found
                    } else {
                        // If no files, we can either keep a message or clear it
                        setMessage(''); 
                    }
                }).catch(err => {
                    console.error("Error in useEffect fetching files:", err);
                    setError(t.genericError);
                }).finally(() => {
                    setUploading(false);
                });
            }
        } else {
            // If switched back to upload, clear messages that might be from delete mode
            if (message === t.loading) setMessage('');
        }
    }, [uploadMode, fileDate, selectedUserId, refreshStats]); // Refresh stats trigger re-fetch too

    useEffect(() => {
        const loadInitialData = async () => {
            const currentUser = pb.authStore.record;
            if (currentUser) {
                setSelectedUserId(currentUser.id);
                if (currentUser.superadmin) {
                    setIsSuperAdmin(true);
                    try {
                        const allUsers = await pb.collection('users').getFullList({
                            sort: 'name',
                            requestKey: null
                        });
                        setUsers(allUsers.map(u => ({ id: u.id, name: u.name, email: u.email })));
                    } catch (e) {
                        console.error("Failed to load users list", e);
                    }
                }
            }

            try {
                // Load Statuses
                const statusRecords = await pb.collection('statuses').getFullList({ requestKey: null });
                setValidStatuses(statusRecords.map(r => r.title));

                // Load Task Fields
                const fieldRecords = await pb.collection('task_fields').getFullList({
                    sort: 'order',
                    requestKey: null
                });
                
                const fields: TaskField[] = fieldRecords.map(r => ({
                    key: r.key,
                    title: r.title,
                    type: r.type,
                    required: r.required,
                    width: r.width
                }));
                setTaskFields(fields);

            } catch (err) {
                console.error("Failed to load initial data", err);
            }
        };

        loadInitialData();
    }, []);

    const handleFiles = (files: FileList | null) => {
        const file = files?.[0];
        
        if (inputRef.current) {
            inputRef.current.value = '';
        }

        if (!file) return;

        processFile(file);
    };

    const handleDeleteExisting = async () => {
        if (!selectedFileToDelete || !deletionReason.trim()) {
            alert("Please select a file and enter a reason.");
            return;
        }

        const fileRecord = availableFiles.find(f => f.id === selectedFileToDelete);
        if (!fileRecord) return;

        if (!confirm(`${t.confirmDelete} "${fileRecord.file_name}"?`)) {
            return;
        }

        setUploading(true);
        setMessage(t.searchingDeleting);
        setError('');

        try {
            // 1. Fetch the full record to get the file
            const record = await pb.collection('tasks').getOne(selectedFileToDelete);
            const currentUser = pb.authStore.record;

            // 2. Fetch the file blob to archive it
            const fileUrl = pb.files.getUrl(record, record.excel_file);
            const res = await fetch(fileUrl);
            if (!res.ok) throw new Error("Failed to download file for archiving");
            const blob = await res.blob();

            // 3. Create Log entry
            const formData = new FormData();
            formData.append('file_name', record.file_name);
            formData.append('reason', deletionReason);
            if (currentUser) {
                formData.append('deleted_by', currentUser.id);
            }
            formData.append('excel_file', blob, record.excel_file); // Re-upload

            await pb.collection('deletion_logs').create(formData);

            // 4. Delete original record
            await pb.collection('tasks').delete(record.id);

            setMessage(`${t.fileDeleted} "${record.file_name}"`);
            setDeletionReason(''); // Clear reason
            setRefreshStats(prev => prev + 1); // This will trigger useEffect to reload file list
            
        } catch (err: any) {
            console.error("Delete error:", err);
            setError(err.message || t.genericError);
        } finally {
            setUploading(false);
        }
    };

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFiles(e.dataTransfer.files);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            handleFiles(e.target.files);
        }
    };

    const onButtonClick = () => {
        inputRef.current?.click();
    };

    const getFormattedDateForCheck = (isoDateString: string) => {
        if (!isoDateString) return "";
        const parts = isoDateString.split('-');
        if (parts.length !== 3) return "";
        const [year, month, day] = parts;
        return `${day}.${month}.${year}`;
    };

    const parseDateStrict = (excelDate: any): string | null => {
        if (!excelDate) return null;
        
        try {
            if (typeof excelDate === 'number') {
                 const date = new Date(Math.round((excelDate - 25569)*86400*1000));
                 if (isNaN(date.getTime())) return null;
                 return date.toISOString();
            }
            if (typeof excelDate === 'string') {
                const trimmed = excelDate.trim();
                const parts = trimmed.split('.');
                if (parts.length === 3) {
                    const day = parseInt(parts[0], 10);
                    const month = parseInt(parts[1], 10) - 1;
                    const year = parseInt(parts[2], 10);
                    
                    const d = new Date(year, month, day);
                    if (d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) {
                        d.setHours(12); 
                        return d.toISOString();
                    }
                }
                
                const d = new Date(excelDate);
                if (!isNaN(d.getTime())) return d.toISOString();
            }
        } catch (e) {
            return null;
        }
        return null;
    };

    const processFile = (file: File) => {
        setUploading(true);
        setMessage(t.validating);
        setError('');
        setDetailedErrors([]);

        if (validStatuses.length === 0 || taskFields.length === 0) {
            setError("Configuration error: Initial data not loaded. Refresh the page.");
            setUploading(false);
            if (inputRef.current) inputRef.current.value = '';
            return;
        }

        const requiredDatePrefix = getFormattedDateForCheck(fileDate);
        if (!file.name.startsWith(requiredDatePrefix)) {
            setError(`${t.errorPrefix} "${requiredDatePrefix}" (e.g., "${requiredDatePrefix}_report.xlsx").`);
            setUploading(false);
            if (inputRef.current) inputRef.current.value = '';
            return;
        }

        setMessage(t.reading);

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                
                let ws = wb.Sheets["Лист1"];
                if (!ws) {
                     ws = wb.Sheets[wb.SheetNames[0]];
                }

                if (!ws) {
                    throw new Error("No sheets found in the Excel file.");
                }

                // Read all data
                const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
                
                if (data.length < 2) {
                    throw new Error("Sheet appears to be empty or missing data rows.");
                }

                // 1. Analyze Headers (Row 1)
                const headers = (data[0] as any[]).map(h => h?.toString().trim().toLowerCase());
                const columnMapping: Record<string, number> = {}; // fieldKey -> columnIndex

                // Map fields to columns
                taskFields.forEach(field => {
                    const targetTitle = field.title.toLowerCase();
                    const index = headers.findIndex(h => h === targetTitle);
                    if (index !== -1) {
                        columnMapping[field.key] = index;
                    }
                });

                console.log("DEBUG: Task Fields:", taskFields);
                console.log("DEBUG: Excel Headers:", headers);
                console.log("DEBUG: Column Mapping:", columnMapping);

                // 2. Validate Structure (Check required columns)
                const missingFields = taskFields
                    .filter(f => f.required && columnMapping[f.key] === undefined)
                    .map(f => f.title);

                if (missingFields.length > 0) {
                    throw new Error(`Missing required columns in Excel: ${missingFields.join(", ")}`);
                }

                const rows = data.slice(1);
                const user = pb.authStore.record;
                if (!user) {
                    throw new Error(t.mustLogin);
                }

                const parsedTasks: any[] = [];
                const validationErrors: string[] = [];

                rows.forEach((row, index) => {
                    const rowIndex = index + 2; 
                    const r = row as any[];
                    
                    if (!r || r.length === 0) return; 

                    // Check if row is effectively empty (all mapped columns are empty)
                    const isEmpty = Object.values(columnMapping).every(colIdx => {
                        const val = r[colIdx];
                        return val === undefined || val === null || val.toString().trim() === '';
                    });
                    if (isEmpty) return;

                    const taskData: any = {};
                    let rowIsValid = true;

                    // Iterate through ALL defined fields
                    taskFields.forEach((field) => {
                        if (!rowIsValid) return;

                        const colIdx = columnMapping[field.key];
                        
                        // If column not found (and optional), skip or set default
                        if (colIdx === undefined) {
                            if (field.type === 'number') taskData[field.key] = 0;
                            else taskData[field.key] = "";
                            return;
                        }

                        let rawValue = r[colIdx];
                        let finalValue: any = rawValue;

                        // 1. Check Required Value (Cell level)
                        if (field.required) {
                            if (rawValue === undefined || rawValue === null || rawValue.toString().trim() === "") {
                                validationErrors.push(`${t.row} ${rowIndex}: '${field.title}' ${t.fieldIsEmpty}`);
                                rowIsValid = false;
                                return;
                            }
                        }

                        // 2. Type Parsing & Validation
                        if (field.type === 'number') {
                            if (rawValue !== undefined && rawValue !== null && rawValue.toString().trim() !== "") {
                                const str = rawValue.toString().trim().replace(',', '.');
                                const num = Number(str);
                                if (isNaN(num)) {
                                    validationErrors.push(`${t.row} ${rowIndex}: '${field.title}' ("${rawValue}") ${t.mustBeNumber}`);
                                    rowIsValid = false;
                                    return;
                                }
                                finalValue = num;
                            } else {
                                finalValue = 0; // Default for numbers
                            }
                        } 
                        else if (field.type === 'date') {
                            const parsedDate = parseDateStrict(rawValue);
                            if (field.required && !parsedDate) {
                                validationErrors.push(`${t.row} ${rowIndex}: '${field.title}' ("${rawValue}") ${t.mustBeNumber}`); // Using same error for bad date
                                rowIsValid = false;
                                return;
                            }
                            finalValue = parsedDate || new Date(fileDate).toISOString();
                        }
                        else if (field.type === 'select') {
                            const strVal = rawValue?.toString().trim();
                            if (field.key === 'status') { // Specific validation for status field
                                if (strVal && !validStatuses.includes(strVal)) {
                                    validationErrors.push(`${t.row} ${rowIndex}: '${field.title}' ("${strVal}") - ${t.invalidValue}.`);
                                    rowIsValid = false;
                                    return;
                                }
                            }
                            finalValue = strVal || "";
                        }
                        else {
                            // Text
                            finalValue = rawValue?.toString().trim() || "";
                        }

                        taskData[field.key] = finalValue;
                    });

                    if (rowIsValid) {
                        parsedTasks.push(taskData);
                    }
                });

                if (validationErrors.length > 0) {
                    setError(t.validationFailed);
                    setDetailedErrors(validationErrors);
                    setUploading(false);
                    if (inputRef.current) inputRef.current.value = '';
                    return;
                }

                if (parsedTasks.length === 0) {
                    throw new Error(t.noValidTasks);
                }

                // --- LIMIT CHECK ---
                const checkDateStart = new Date(fileDate);
                checkDateStart.setHours(0, 0, 0, 0);
                const checkDateEnd = new Date(fileDate);
                checkDateEnd.setHours(23, 59, 59, 999);

                // Use selectedUserId for superadmin operations, fallback to current user logic just in case
                const targetUserId = selectedUserId || user.id;

                const dailyUploads = await pb.collection('tasks').getList(1, 10, {
                    filter: `user = "${targetUserId}" && file_date >= "${checkDateStart.toISOString()}" && file_date <= "${checkDateEnd.toISOString()}"`,
                });

                if (dailyUploads.totalItems >= 2) {
                    setError(t.limitReached);
                    setUploading(false);
                    if (inputRef.current) inputRef.current.value = '';
                    return;
                }

                // --- DUPLICATE CHECK ---
                const existingFiles = await pb.collection('tasks').getList(1, 1, {
                    filter: `file_name = "${file.name}"`,
                });

                if (existingFiles.totalItems > 0) {
                    setError(t.fileAlreadyExists);
                    setUploading(false);
                    if (inputRef.current) inputRef.current.value = '';
                    return;
                }

                const formData = new FormData();
                formData.append('excel_file', file);
                formData.append('file_name', file.name);
                
                const finalDate = fileDate ? new Date(fileDate) : new Date();
                formData.append('file_date', finalDate.toISOString());

                formData.append('data', JSON.stringify(parsedTasks));
                formData.append('user', targetUserId);

                if (isSuperAdmin && user) {
                    formData.append('uploaded_by', user.id);
                }

                setMessage(`${t.uploadingMsg} (${parsedTasks.length} ${t.tasksCount})...`);

                await pb.collection('tasks').create(formData);

                // --- AUDIT LOG FOR SUPERADMIN UPLOADS ---
                if (isSuperAdmin && user) {
                    try {
                        await pb.collection('upload_logs').create({
                            file_name: file.name,
                            uploaded_by: user.id,
                            target_user: targetUserId
                        });
                    } catch (logErr) {
                        console.error("Failed to create upload log:", logErr);
                        // We don't block the UI flow here, as the main task upload succeeded
                    }
                }

                setMessage(`${t.successMsg} ${parsedTasks.length} ${t.tasksCount}.`);
                setRefreshStats(prev => prev + 1); 
                
            } catch (err: any) {
                console.error("Upload error:", err);
                setError(err.message || t.genericError);
            } finally {
                setUploading(false);
                if (inputRef.current) inputRef.current.value = '';
            }
        };
        reader.readAsBinaryString(file);
    };

    // Determine content for Status Cell (Bottom Left)
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
                        {detailedErrors.map((err, idx) => (
                            <li key={idx}>{err}</li>
                        ))}
                    </ul>
                )}
            </div>
        );
    } else if (message && !message.includes("Validating") && !message.includes("Reading")) {
        statusContent = (
            <div className="status-card success" style={{height: '100%', justifyContent: 'center'}}>
                <div style={{display: 'flex', gap: '0.5rem', alignItems: 'center'}}>
                    <svg className="status-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    <span className="status-title">{message}</span>
                </div>
            </div>
        );
    } else {
        // Dynamic Info State
        const requiredFieldsText = taskFields
            .filter(f => f.required)
            .map(f => f.title)
            .join(", ");

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
                    <li>
                        {t.infoColsTitle} {requiredFieldsText}
                    </li>
                </ul>
            </div>
        );
    }

    return (
        <div className="upload-grid">
            
            {/* 1. Combined Upload & Status Card (Top Left) */}
            <div className="dashboard-card grid-cell-upload" style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
                {/* Header & Upload Zone */}
                <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                        <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                            <div style={{padding: '6px', background: '#eff6ff', borderRadius: '6px', color: 'var(--primary)'}}>
                                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                            </div>
                            <h3 style={{margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)', whiteSpace: 'nowrap'}}>{t.uploadTitle}</h3>
                        </div>
                        <div style={{display: 'flex', gap: '0.5rem', alignItems: 'center'}}>
                            {isSuperAdmin && users.length > 0 && (
                                <select 
                                    className="input input-compact"
                                    value={selectedUserId}
                                    onChange={(e) => setSelectedUserId(e.target.value)}
                                    style={{maxWidth: '150px'}}
                                >
                                    {users.map(u => (
                                        <option key={u.id} value={u.id}>
                                            {u.name || u.email}
                                        </option>
                                    ))}
                                </select>
                            )}
                            {isSuperAdmin && (
                                <select
                                    className="input input-compact"
                                    value={uploadMode}
                                    onChange={(e) => setUploadMode(e.target.value as 'upload' | 'delete')}
                                    style={{ 
                                        maxWidth: '120px', 
                                        borderColor: uploadMode === 'delete' ? '#ef4444' : undefined,
                                        color: uploadMode === 'delete' ? '#ef4444' : undefined
                                    }}
                                >
                                    <option value="upload">{t.modeUpload}</option>
                                    <option value="delete">{t.modeDelete}</option>
                                </select>
                            )}
                            {isSuperAdmin ? (
                                <input 
                                    className="input input-date-compact"
                                    type="date" 
                                    value={fileDate}
                                    onChange={(e) => setFileDate(e.target.value)}
                                />
                            ) : (
                                <small className="date-badge">
                                    {getFormattedDateForCheck(fileDate)}
                                </small>
                            )}
                        </div>
                    </div>
                    
                    {uploadMode === 'upload' ? (
                        <div 
                            className={`drop-zone ${dragActive ? 'active' : ''}`}
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                            onClick={onButtonClick}
                            style={{minHeight: '120px'}}
                        >
                            <input 
                                ref={inputRef}
                                type="file" 
                                accept=".xlsx, .xls" 
                                onChange={handleChange}
                                style={{ display: 'none' }} 
                                disabled={uploading}
                            />
                            
                            <svg className="drop-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                            
                            <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
                                <p className="drop-text">
                                    {uploading ? t.processing : t.dragDrop}
                                </p>
                                {!uploading && (
                                    <p className="drop-hint">
                                        {t.orBrowse}
                                    </p>
                                )}
                            </div>
                            
                            {!uploading && <button className="btn drop-btn">{t.selectFile}</button>}
                        </div>
                    ) : (
                        <div className="delete-zone" style={{
                            minHeight: '120px', 
                            border: '2px dashed #fca5a5', 
                            borderRadius: '12px', 
                            padding: '1.2rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '1rem',
                            background: '#fff1f1'
                        }}>
                            <div style={{
                                display: 'grid', 
                                gridTemplateColumns: '1fr 1fr', 
                                gap: '1rem',
                                alignItems: 'end' // Это выровняет колонки по нижнему краю
                            }}>
                                <div style={{display: 'flex', flexDirection: 'column', gap: '0.4rem', height: '100%', justifyContent: 'flex-end'}}>
                                    <label style={{
                                        fontSize: '0.7rem', 
                                        fontWeight: 800, 
                                        color: '#b91c1c', 
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.025em',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        marginBottom: 'auto' // Позволяет тексту занимать верхнюю часть, а инпуту оставаться внизу
                                    }}>
                                        <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                        {t.selectFile}
                                    </label>
                                    <select 
                                        className="input input-compact" 
                                        value={selectedFileToDelete} 
                                        onChange={(e) => setSelectedFileToDelete(e.target.value)}
                                        disabled={uploading || availableFiles.length === 0}
                                        style={{
                                            width: '100%', 
                                            borderColor: '#fecaca',
                                            height: '38px',
                                            fontSize: '0.85rem',
                                            background: 'white'
                                        }}
                                    >
                                        {availableFiles.length === 0 ? (
                                            <option value="">{t.noTasks}</option>
                                        ) : (
                                            availableFiles.map(f => (
                                                <option key={f.id} value={f.id}>{f.file_name}</option>
                                            ))
                                        )}
                                    </select>
                                </div>
                                
                                <div style={{display: 'flex', flexDirection: 'column', gap: '0.4rem', height: '100%', justifyContent: 'flex-end'}}>
                                    <label style={{
                                        fontSize: '0.7rem', 
                                        fontWeight: 800, 
                                        color: '#b91c1c', 
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.025em',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        marginBottom: 'auto'
                                    }}>
                                        <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                        {t.enterReason}
                                    </label>
                                    <input 
                                        className="input input-compact" 
                                        placeholder="..." 
                                        value={deletionReason} 
                                        onChange={(e) => setDeletionReason(e.target.value)}
                                        disabled={uploading || availableFiles.length === 0}
                                        style={{
                                            width: '100%', 
                                            borderColor: '#fecaca',
                                            height: '38px',
                                            fontSize: '0.85rem',
                                            background: 'white'
                                        }}
                                    />
                                </div>
                            </div>

                            <button 
                                className="btn" 
                                style={{
                                    background: (uploading || availableFiles.length === 0 || !deletionReason.trim()) ? '#fecaca' : '#ef4444', 
                                    color: 'white', 
                                    border: 'none',
                                    height: '38px',
                                    fontWeight: 700,
                                    fontSize: '0.85rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    boxShadow: '0 2px 4px rgba(239, 68, 68, 0.1)',
                                    transition: 'all 0.2s'
                                }}
                                onClick={handleDeleteExisting}
                                disabled={uploading || availableFiles.length === 0 || !deletionReason.trim()}
                            >
                                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                {uploading ? t.processing : t.modeDelete}
                            </button>
                        </div>
                    )}
                </div>

                {/* Status / Info Section (Fills remaining height) */}
                <div style={{flex: 1, minHeight: 0, overflowY: 'auto'}}> 
                    {statusContent}
                </div>
            </div>

            {/* 3. Comparison Stats (Bottom Left) */}
            <ComparisonStats lang={lang} refreshTrigger={refreshStats} style={{}} className="grid-cell-comp" />

            {/* 4. Daily Stats (Right Column - Spans Top & Middle) */}
            <div className="grid-cell-daily">
                <DailyStats lang={lang} refreshTrigger={refreshStats} />
            </div>

            {/* 5. Monthly Stats (Bottom Right) */}
            <MonthlyStats lang={lang} refreshTrigger={refreshStats} style={{}} className="grid-cell-monthly" />
        </div>
    );
}