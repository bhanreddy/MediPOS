import React from 'react';

type AlertType = 'SUCCESS' | 'WARNING' | 'ERROR' | 'INFO';

interface AlertProps {
    type: AlertType;
    message: string;
    onClose?: () => void;
}

/**
 * PHASE 11: LOUD & CLEAR ALERTS
 * Designed to grab operator attention without interrupting keyboard flow.
 */
export const Alert: React.FC<AlertProps> = ({ type, message, onClose }) => {
    let color = 'var(--brand-info)';
    let bg = 'rgba(59, 130, 246, 0.1)';
    let border = 'var(--brand-info)';

    if (type === 'SUCCESS') {
        color = 'var(--brand-success)';
        bg = 'rgba(34, 197, 94, 0.1)';
        border = 'var(--brand-success)';
    } else if (type === 'WARNING') {
        color = 'var(--brand-warning)';
        bg = 'rgba(245, 158, 11, 0.1)';
        border = 'var(--brand-warning)';
    } else if (type === 'ERROR') {
        color = 'var(--brand-error)';
        bg = 'rgba(239, 68, 68, 0.1)';
        border = 'var(--brand-error)';
    }

    return (
        <div style={{
            position: 'fixed',
            top: 'var(--space-xl)',
            right: 'var(--space-xl)',
            minWidth: '300px',
            maxWidth: '500px',
            background: bg,
            border: `1px solid ${border}`,
            borderLeft: `8px solid ${border}`,
            padding: 'var(--space-md)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            zIndex: 9999,
            animation: 'slideIn 0.3s ease-out'
        }}>
            <div>
                <div style={{ fontSize: 'var(--size-xs)', fontWeight: 'bold', color: color, marginBottom: '2px' }}>{type}</div>
                <div style={{ fontSize: 'var(--size-md)', color: 'white' }}>{message}</div>
            </div>
            {onClose && (
                <button
                    onClick={onClose}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 'var(--size-lg)' }}
                >
                    ×
                </button>
            )}
        </div>
    );
};
