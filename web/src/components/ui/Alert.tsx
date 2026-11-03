import { Notification, type NotificationTone } from './Notification';

export function Alert({ type, title, message, onClose }: {
  type: Exclude<NotificationTone, 'loading'>; title?: string; message: string; onClose?: () => void;
}) {
  return <Notification tone={type} title={title} onClose={onClose} role={type === 'error' ? 'alert' : 'status'}>{message}</Notification>;
}
