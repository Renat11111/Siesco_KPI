import React from 'react';
import { RecordModel } from 'pocketbase';

interface UserWithFullName extends RecordModel {
    full_name: string;
}

export const UserBadge = ({ user }: { user?: UserWithFullName }) => {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#e2e8f0', fontSize: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {user?.full_name?.[0] || '?'}
            </div>
            <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '12px' }}>
                {user?.full_name || 'Unknown'}
            </div>
        </div>
    );
};
