import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
    size?: 'sm' | 'md' | 'lg' | 'icon';
    isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
    children,
    variant = 'primary',
    size = 'md',
    isLoading,
    className = '',
    ...props
}) => {
    const baseStyles =
        "inline-flex items-center justify-center font-extrabold uppercase tracking-widest text-[11px] sm:text-xs transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background shadow-sm";

    const variants = {
        primary:
            "bg-primary text-on-primary hover:brightness-110 shadow-md shadow-primary/20 border border-white/10 dark:border-white/5",
        secondary:
            "bg-surface-elevated text-foreground border border-border/90 hover:bg-surface-alt hover:border-border shadow-sm",
        danger: "bg-danger text-on-danger hover:brightness-110 shadow-md shadow-danger/15 border border-white/10",
        success: "bg-success text-on-success hover:brightness-110 shadow-md shadow-success/15 border border-white/10",
        ghost: "shadow-none bg-transparent text-muted hover:text-foreground hover:bg-surface-elevated/80 border border-transparent",
    };

    const sizes = {
        sm: "px-3 py-2 text-small rounded-lg",
        md: "px-5 py-2.5 text-base rounded-lg",
        lg: "px-8 py-3.5 text-heading rounded-xl",
        icon: "p-2 rounded-xl shadow-none",
    };

    return (
        <button
            className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
            disabled={isLoading || props.disabled}
            {...props}
        >
            {isLoading ? (
                <div className="flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Processing</span>
                </div>
            ) : children}
        </button>
    );
};
