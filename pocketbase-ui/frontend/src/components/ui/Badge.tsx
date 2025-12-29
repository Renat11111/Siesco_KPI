import React from 'react';

interface BadgeProps {
    children: React.ReactNode;
    color?: 'red' | 'gray' | 'blue' | 'green';
    variant?: 'soft' | 'solid';
}

export const Badge = ({ children, color = 'gray', variant = 'soft' }: BadgeProps) => {
    const getColorStyles = () => {
        switch (color) {
            case 'red':
                return { bg: '#ffe4e6', text: '#e11d48' };
            case 'blue':
                return { bg: '#e0f2fe', text: '#0369a1' };
            case 'green':
                return { bg: '#dcfce7', text: '#15803d' };
            default:
                return { bg: '#f1f5f9', text: '#64748b' };
        }
    };

    const styles = getColorStyles();

    return (
        <span style={{
            backgroundColor: styles.bg,
            color: styles.text,
            padding: '2px 8px',
            borderRadius: '12px',
            fontSize: '0.85rem',
            fontWeight: 700,
            display: 'inline-block',
            lineHeight: '1.2'
        }}>
            {children}
        </span>
    );
};
