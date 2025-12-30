import React from 'react';

type CardProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> & {
    children: React.ReactNode;
    title?: string | React.ReactNode;
    extra?: React.ReactNode;
};

export const Card = ({ children, title, extra, style, className = '', ...props }: CardProps) => {
    return (
        <div className={`dashboard-card ${className}`} style={{ ...style, marginTop: 0 }} {...props}>
            {(title || extra) && (
                <div style={{
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between', 
                    marginBottom: '1rem'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {typeof title === 'string' ? (
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)' }}>
                                {title}
                            </h3>
                        ) : (
                            title
                        )}
                    </div>
                    {extra && <div>{extra}</div>}
                </div>
            )}
            {children}
        </div>
    );
};
