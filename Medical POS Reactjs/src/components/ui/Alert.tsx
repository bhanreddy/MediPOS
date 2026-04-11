import React from 'react';

type AlertType = 'success' | 'warning' | 'error' | 'info';

interface AlertProps {
    type: AlertType;
    title?: string;
    message: string;
    onClose?: () => void;
}

export const Alert: React.FC<AlertProps> = ({ type, title, message, onClose }) => {
    const colors = {
        success: "border-success bg-success/10 text-success",
        warning: "border-warning bg-warning/10 text-warning",
        error: "border-danger bg-danger/10 text-danger",
        info: "border-primary bg-primary/10 text-primary",
    };

    const icons = {
        success: "✅",
        warning: "⚠️",
        error: "🚫",
        info: "ℹ️",
    };

    return (
        <div className={`flex gap-4 p-4 border-2 rounded-lg ${colors[type]} animate-slideIn`}>
            <span className="text-2xl pt-0.5">{icons[type]}</span>
            <div className="flex-1">
                {title && <h4 className="font-black uppercase tracking-widest text-[11px] mb-1">{title}</h4>}
                <p className="text-sm font-medium leading-relaxed font-sans">{message}</p>
            </div>
            {onClose && (
                <button onClick={onClose} className="opacity-60 hover:opacity-100 text-xl font-light self-start">
                    ×
                </button>
            )}
        </div>
    );
};
