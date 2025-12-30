import { useState, useEffect } from 'react';
import pb, { getUserFiles, clearRankingCache, handleApiError } from '../lib/pocketbase';
import { translations, Language } from '../lib/translations';
import { TaskField, User } from '../types/tasks';
import * as XLSX from 'xlsx';

export const useTaskUpload = (lang: Language) => {
    const t = translations[lang];
    const [uploading, setUploading] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [detailedErrors, setDetailedErrors] = useState<string[]>([]);
    
    const [currentUser, setCurrentUser] = useState(pb.authStore.record);
    const [isSuperAdmin, setIsSuperAdmin] = useState(false);
    const [users, setUsers] = useState<User[]>([]);
    const [selectedUserId, setSelectedUserId] = useState<string>('');
    const [fileDate, setFileDate] = useState(() => {
        const d = new Date();
        const offset = d.getTimezoneOffset() * 60000;
        return (new Date(d.getTime() - offset)).toISOString().slice(0, 10);
    });

    const [validStatuses, setValidStatuses] = useState<string[]>([]);
    const [taskFields, setTaskFields] = useState<TaskField[]>([]);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    useEffect(() => {
        let unsub: any;
        const subscribe = async () => {
            unsub = await pb.collection('ranking_updates').subscribe('*', () => {
                setRefreshTrigger(prev => prev + 1);
            });
        };
        subscribe();
        return () => { if (unsub) unsub(); };
    }, []);

    useEffect(() => {
        const unsubscribe = pb.authStore.onChange((_token, record) => {
            setCurrentUser(record);
        });
        return () => unsubscribe();
    }, []);

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
                    key: r.key, title: r.title, type: r.type, required: r.required, width: r.width, order: r.order, filterable: r.filterable
                })));
            } catch (err) { console.error(err); }
        };
        loadInitialData();
    }, [currentUser?.id]);

    const getFormattedDateForCheck = (iso: string) => {
        const parts = iso.split('-');
        return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : "";
    };

    const processFile = async (file: File) => {
        setUploading(true); setMessage(t.validating); setError(''); setDetailedErrors([]);
        
        const targetUserId = selectedUserId || currentUser?.id;
        const requiredPrefix = getFormattedDateForCheck(fileDate);

        if (!file.name.startsWith(requiredPrefix)) {
            setError(`${t.errorPrefix} "${requiredPrefix}"`); setUploading(false); return;
        }

        try {
            const existingFiles = await pb.collection('tasks').getFullList({
                filter: `user = "${targetUserId}" && file_date >= "${fileDate} 00:00:00" && file_date <= "${fileDate} 23:59:59"`,
                requestKey: null
            });

            if (existingFiles.some(f => f.file_name === file.name)) {
                setError(t.fileAlreadyExists); setUploading(false); return;
            }

            if (existingFiles.length >= 2 && !isSuperAdmin) {
                setError(t.limitReached); setUploading(false); return;
            }

            const reader = new FileReader();
            reader.onload = async (evt) => {
                try {
                    const bstr = evt.target?.result;
                    const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
                    let ws = wb.Sheets["Лист1"] || wb.Sheets[wb.SheetNames[0]];
                    const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
                    
                    if (!data || data.length === 0) throw new Error("File is empty");

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
                            if (!rowOk || f.key === 'original_time_spent' || f.key === 'is_edited') return;
                            const colIdx = columnMapping[f.key];
                            const val = r[colIdx];
                            if (f.required && (val === undefined || val === null || val === "")) { 
                                vErrors.push(`${t.row} ${i+2}: '${f.title}' ${t.fieldIsEmpty}`); rowOk = false; return; 
                            }
                            
                            if (f.type === 'number') {
                                const num = Number(val?.toString().replace(',', '.'));
                                if (isNaN(num)) { vErrors.push(`${t.row} ${i+2}: '${f.title}' ${t.mustBeNumber}`); rowOk = false; }
                                task[f.key] = num || 0;
                            } else if (f.type === 'date' && val instanceof Date) {
                                task[f.key] = val.toISOString().split('T')[0];
                            } else if (f.key === 'status') {
                                if (val && !validStatuses.includes(val.toString().trim())) {
                                    vErrors.push(`${t.row} ${i+2}: '${f.title}' ${t.invalidValue}`); rowOk = false;
                                }
                                task[f.key] = val?.toString().trim() || "";
                            } else {
                                task[f.key] = val?.toString().trim() || "";
                            }
                        });
                        if (rowOk) parsedTasks.push(task);
                    });

                    if (vErrors.length > 0) { setError(t.validationFailed); setDetailedErrors(vErrors); setUploading(false); return; }

                    const formData = new FormData();
                    formData.append('excel_file', file);
                    formData.append('file_name', file.name);
                    formData.append('file_date', fileDate + " 12:00:00");
                    formData.append('data', JSON.stringify(parsedTasks));
                    formData.append('user', targetUserId || '');
                    if (isSuperAdmin && currentUser) formData.append('uploaded_by', currentUser.id);

                    await pb.collection('tasks').create(formData);
                    
                    if (isSuperAdmin && currentUser) {
                        await pb.collection('upload_logs').create({ file_name: file.name, uploaded_by: currentUser.id, target_user: targetUserId });
                    }

                    setMessage(`${t.successMsg} ${parsedTasks.length} ${t.tasksCount}.`);
                    clearRankingCache();
                } catch (err: any) { setError(handleApiError(err, t)); } finally { setUploading(false); }
            };
            reader.readAsBinaryString(file);
        } catch (err: any) { 
            setError(handleApiError(err, t)); 
            setUploading(false); 
        }
    };

    const deleteFile = async (fileId: string, reason: string, availableFiles: any[]) => {
        const fileRecord = availableFiles.find(f => f.id === fileId);
        if (!fileRecord || !confirm(`${t.confirmDelete} "${fileRecord.file_name}"?`)) return;

        setUploading(true);
        try {
            const record = await pb.collection('tasks').getOne(fileId);
            const fileUrl = pb.files.getUrl(record, record.excel_file);
            const res = await fetch(fileUrl);
            const blob = await res.blob();

            const formData = new FormData();
            formData.append('file_name', record.file_name);
            formData.append('reason', reason);
            if (currentUser) formData.append('deleted_by', currentUser.id);
            formData.append('excel_file', blob, record.excel_file); 

            await pb.collection('deletion_logs').create(formData);
            await pb.collection('tasks').delete(record.id);
            clearRankingCache();
            setMessage(t.fileDeleted);
        } catch (err: any) { setError(handleApiError(err, t)); } finally { setUploading(false); }
    };

    return {
        uploading, setUploading,
        message, setMessage,
        error, setError,
        detailedErrors, setDetailedErrors,
        currentUser, isSuperAdmin,
        users, selectedUserId, setSelectedUserId,
        fileDate, setFileDate,
        validStatuses, taskFields,
        processFile, deleteFile,
        refreshTrigger
    };
};
