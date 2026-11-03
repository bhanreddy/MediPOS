import React from 'react';
import { cn } from '../../utils/cn';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    variant?: 'success' | 'warning' | 'danger' | 'neutral' | 'primary';
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'neutral', className, ...props }) => {
    const variants = {
        primary: "bg-primary/8 text-primary border-primary/15",
        success: "bg-success/8 text-success border-success/15",
        warning: "bg-warning/8 text-warning border-warning/15",
        danger: "bg-danger/8 text-danger border-danger/15",
        neutral: "bg-surface-elevated text-muted border-border/80",
    };

    return (
        <span 
            className={cn(`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] leading-4 font-semibold border ${variants[variant]}`, className)}
            {...props}
        >
            {children}
        </span>
    );
};
