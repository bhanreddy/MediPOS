import React from 'react';
import { cn } from '../../utils/cn';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    variant?: 'success' | 'warning' | 'danger' | 'neutral' | 'primary';
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'neutral', className, ...props }) => {
    const variants = {
        primary: "bg-primary/15 text-primary border-primary/25 shadow-sm",
        success: "bg-success/15 text-success border-success/25 shadow-sm",
        warning: "bg-warning/15 text-warning border-warning/25 shadow-sm",
        danger: "bg-danger/15 text-danger border-danger/25 shadow-sm",
        neutral: "bg-surface-elevated text-muted border-border/80",
    };

    return (
        <span 
            className={cn(`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-widest border ${variants[variant]}`, className)} 
            {...props}
        >
            {children}
        </span>
    );
};

