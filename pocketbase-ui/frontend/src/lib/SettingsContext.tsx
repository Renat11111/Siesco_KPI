import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import pb from './pocketbase';
import { Language } from './translations';

export interface TaskField {
    id: string;
    key: string;
    title: string;
    type: string;
    width: string;
    required: boolean;
    filterable: boolean;
    order: number;
}

export interface Status {
    id: string;
    title: string;
    slug: string;
    color: string;
    type: 'final' | 'in_progress' | 'return' | string;
}

interface SettingsContextType {
    statuses: Status[];
    fields: TaskField[];
    lang: Language;
    setLang: (lang: Language) => void;
    loading: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
    const [statuses, setStatuses] = useState<Status[]>([]);
    const [fields, setFields] = useState<TaskField[]>([]);
    const [lang, setLang] = useState<Language>('ru');
    const [loading, setLoading] = useState(true);

    const refreshConfig = async () => {
        try {
            // Load both statuses and fields in parallel
            const [statusesRes, fieldsRes] = await Promise.all([
                pb.collection('statuses').getFullList<Status>({ sort: 'created' }),
                pb.collection('task_fields').getFullList<TaskField>({ sort: 'order' })
            ]);
            setStatuses(statusesRes);
            setFields(fieldsRes);
        } catch (e) {
            console.error("Failed to load settings:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        refreshConfig();

        // Subscribe to real-time changes in statuses and fields
        pb.collection('statuses').subscribe('*', () => refreshConfig());
        pb.collection('task_fields').subscribe('*', () => refreshConfig());

        return () => {
            // Cleanup subscriptions on unmount
            pb.collection('statuses').unsubscribe();
            pb.collection('task_fields').unsubscribe();
        };
    }, []);

    return (
        <SettingsContext.Provider value={{ statuses, fields, lang, setLang, loading }}>
            {children}
        </SettingsContext.Provider>
    );
};

export const useSettings = () => {
    const context = useContext(SettingsContext);
    if (!context) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
};
