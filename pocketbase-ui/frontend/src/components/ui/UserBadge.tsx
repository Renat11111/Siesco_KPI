import React from 'react';

export const UserBadge = ({ user }: { user?: any }) => {
    const displayName = user?.full_name || user?.name || user?.email || 'Unknown';
    const initial = displayName[0]?.toUpperCase() || '?';

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#e2e8f0', fontSize: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#64748b' }}>
                {initial}
            </div>
            <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '12px', color: '#1e293b' }}>
                {displayName}
            </div>
        </div>
    );
};
