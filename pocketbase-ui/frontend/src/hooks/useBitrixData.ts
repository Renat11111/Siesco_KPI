import { useState, useEffect, useRef } from 'react';
import pb from '../lib/pocketbase';
import { BitrixTask, BitrixUser, BitrixGroup } from '../types/bitrix';

export const useBitrixData = () => {
    const [tasks, setTasks] = useState<BitrixTask[]>([]);
    const [userMap, setUserMap] = useState<Map<string, BitrixUser>>(new Map());
    const [groupMap, setGroupMap] = useState<Map<string, BitrixGroup>>(new Map());
    
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState('');

    const currentUser = pb.authStore.model;
    const isSpecialUser = currentUser?.superadmin || currentUser?.is_coordinator;
    const userBitrixRecordId = currentUser?.bitrix_user;

    // We keep track of "allowed" users (IT Dept) to filter incoming realtime events efficiently
    const allowedUserIdsRef = useRef<Set<string>>(new Set());

    const loadData = async (triggerSync = false) => {
        setLoading(true);
        setError('');
        try {
            if (triggerSync) {
                setSyncing(true);
                try {
                    await pb.send('/api/bitrix/sync-incremental', { method: 'POST' });
                } catch (syncErr) {
                    console.warn('Sync failed:', syncErr);
                } finally {
                    setSyncing(false);
                }
            }

            // 1. Fetch IT Dept users and CTO
            const targetUsers = await pb.collection('bitrix_users').getFullList<BitrixUser>({
                filter: 'bitrix_id = 7 || departments.bitrix_id ?= 5',
                expand: 'departments'
            });

            const uMap = new Map<string, BitrixUser>();
            const ids = new Set<string>();
            targetUsers.forEach(u => {
                uMap.set(u.id, u);
                ids.add(u.id);
            });
            setUserMap(uMap);
            allowedUserIdsRef.current = ids;

            // 2. Fetch all groups (projects)
            const groups = await pb.collection('bitrix_groups').getFullList<BitrixGroup>();
            const gMap = new Map<string, BitrixGroup>();
            groups.forEach(g => gMap.set(g.id, g));
            setGroupMap(gMap);

            // 3. Fetch Tasks
            const resultList = await pb.collection('bitrix_tasks_active').getFullList<BitrixTask>({
                sort: '-created_date',
            });

            // 4. Filter logic based on role
            let filtered = resultList.filter(t => ids.has(t.responsible));
            if (!isSpecialUser) {
                filtered = filtered.filter(t => t.responsible === userBitrixRecordId);
            }
            setTasks(filtered);

        } catch (err: any) {
            console.error(err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();

        pb.collection('bitrix_tasks_active').subscribe('*', async (e) => {
            if (e.action === 'delete') {
                setTasks(prev => prev.filter(t => t.id !== e.record.id));
                return;
            }

            try {
                // If the responsible person is not in our "allowed" list (IT dept), ignore
                if (!allowedUserIdsRef.current.has(e.record.responsible)) return;

                const record = e.record as BitrixTask;

                setTasks(prev => {
                    const exists = prev.find(t => t.id === record.id);
                    if (exists) {
                        return prev.map(t => t.id === record.id ? record : t);
                    } else {
                        return [record, ...prev];
                    }
                });
            } catch (err) {
                console.error(err);
            }
        });

        return () => {
            pb.collection('bitrix_tasks_active').unsubscribe('*');
        };
    }, [isSpecialUser, userBitrixRecordId]);

    return {
        tasks,
        userMap,
        groupMap,
        loading,
        syncing,
        error,
        refresh: (sync: boolean) => loadData(sync),
        currentUser,
        isSpecialUser,
        userBitrixRecordId
    };
};
