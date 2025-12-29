import React, { useState, useEffect, useRef } from 'react';

interface MultiSelectProps {
    label: string;
    options: { value: string; label: string | React.ReactNode }[];
    selected: string[];
    onChange: (values: string[]) => void;
    placeholder?: string;
}

export const MultiSelect = ({ label, options, selected, onChange, placeholder = 'Выбрано' }: MultiSelectProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleOption = (value: string) => {
        if (selected.includes(value)) {
            onChange(selected.filter(v => v !== value));
        } else {
            onChange([...selected, value]);
        }
    };

    const displayText = selected.length === 0 
        ? label 
        : selected.length === 1 
            ? options.find(o => o.value === selected[0])?.label 
            : `${selected.length} выбр.`;

    return (
        <div ref={containerRef} style={{ position: 'relative', minWidth: '160px' }}>
            <div 
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    padding: '6px 10px',
                    fontSize: '13px',
                    borderRadius: '6px',
                    border: isOpen ? '1px solid #3b82f6' : '1px solid #cbd5e1',
                    background: 'white',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                    color: selected.length > 0 ? '#1e293b' : '#64748b'
                }}
            >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>
                    {typeof displayText === 'string' ? displayText : placeholder}
                </span>
                <span style={{ fontSize: '10px', color: '#94a3b8' }}>▼</span>
            </div>

            {isOpen && (
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    width: '220px',
                    marginTop: '4px',
                    background: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                    zIndex: 100, // Высокий z-index для перекрытия таблиц
                    maxHeight: '350px',
                    overflowY: 'auto',
                    padding: '4px'
                }}>
                    {selected.length > 0 && (
                        <div 
                            onClick={() => onChange([])} 
                            style={{ padding: '6px 8px', fontSize: '11px', color: '#ef4444', cursor: 'pointer', fontWeight: 600 }}
                        >
                            Сбросить выбор
                        </div>
                    )}
                    {options.map(option => (
                        <div 
                            key={option.value}
                            onClick={() => toggleOption(option.value)}
                            style={{
                                padding: '6px 8px',
                                fontSize: '13px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                borderRadius: '4px',
                                background: selected.includes(option.value) ? '#f0f9ff' : 'transparent',
                            }}
                            className="hover-option" // Класс для hover-эффекта из App.css или локального стиля
                        >
                            <input type="checkbox" checked={selected.includes(option.value)} readOnly style={{ pointerEvents: 'none' }} />
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{option.label}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
