import React from 'react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    label?: string;
    error?: string;
    options: { value: string; label: string }[];
}

export const Select: React.FC<SelectProps> = ({
    label,
    error,
    options,
    className = '',
    ...props
}) => {
    return (
        <div className="w-full flex flex-col gap-1.5">
            {label && (
                <label className="text-[10px] font-black uppercase text-muted tracking-widest ml-1">
                    {label}
                </label>
            )}
            <div className="relative">
                <select
                    className={`w-full bg-surface-elevated border-2 border-border text-foreground px-4 py-3 rounded-md font-medium appearance-none transition-all focus:border-primary focus:ring-4 focus:ring-focus/20 focus:outline-none disabled:opacity-50
            ${error ? 'border-error text-error ring-error/20' : ''}
            ${className}`}
                    {...props}
                >
                    {options.map((opt) => (
                        <option key={opt.value} value={opt.value} className="bg-surface-elevated">
                            {opt.label}
                        </option>
                    ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-muted">
                    ▼
                </div>
            </div>
            {error && <span className="text-[11px] font-bold text-error uppercase tracking-tight px-1">{error}</span>}
        </div>
    );
};
