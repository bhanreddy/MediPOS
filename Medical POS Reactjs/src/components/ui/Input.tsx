import React, { forwardRef } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    icon?: string;
    containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({
    label,
    error,
    icon,
    containerClassName = '',
    className = '',
    ...props
}, ref) => {
    return (
        <div className={`w-full flex flex-col gap-2 ${containerClassName}`}>
            {label && (
                <label className="text-label font-extrabold uppercase text-muted tracking-widest ml-1">
                    {label}
                </label>
            )}
            <div className="relative group">
                {icon && (
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted group-focus-within:text-primary transition-colors">
                        {icon}
                    </span>
                )}
                <input
                    ref={ref}
                    className={`w-full bg-surface-elevated border border-border/90 text-foreground px-4 py-3 rounded-lg font-medium text-base placeholder:text-muted transition-all focus:border-primary focus:ring-2 focus:ring-focus/40 focus:ring-offset-2 focus:ring-offset-background focus:outline-none disabled:opacity-50 shadow-sm
            ${icon ? 'pl-11' : ''}
            ${error ? 'border-danger ring-danger/20' : ''}
            ${className}`}
                    {...props}
                />
                {error && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-danger text-xl" title={error}>
                        ⚠️
                    </div>
                )}
            </div>
            {error && <span className="text-small font-bold text-danger uppercase tracking-tight px-1">{error}</span>}
        </div>
    );
});

Input.displayName = 'Input';
