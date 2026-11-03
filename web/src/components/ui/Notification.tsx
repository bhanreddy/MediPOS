import type { ReactNode } from 'react';
import { CircleCheck, CircleAlert, Info, LoaderCircle, X } from 'lucide-react';

export type NotificationTone = 'success' | 'warning' | 'error' | 'info' | 'loading';
export function Notification({ tone = 'info', title, children, onClose, ...props }: {
  tone?: NotificationTone; title?: string; children: ReactNode; onClose?: () => void;
  role?: 'alert' | 'status'; 'aria-live'?: 'polite' | 'assertive' | 'off';
}) {
  const Icon = tone === 'loading' ? LoaderCircle : tone === 'success' ? CircleCheck : tone === 'error' || tone === 'warning' ? CircleAlert : Info;
  return <div className={`message-notification message-${tone}`} {...props}>
    <span className="message-notification-icon" aria-hidden="true"><Icon size={18} className={tone === 'loading' ? 'animate-spin' : undefined} /></span>
    <div className="message-notification-copy">{title && <strong>{title}</strong>}<div>{children}</div></div>
    {onClose && <button type="button" className="message-notification-close" aria-label="Dismiss notification" onClick={onClose}><X size={15} /></button>}
  </div>;
}
