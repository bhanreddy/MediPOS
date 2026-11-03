import { Alert as InlineAlert } from '../ui/Alert';

export function Alert({ type, message, onClose }: {
  type: 'SUCCESS' | 'WARNING' | 'ERROR' | 'INFO'; message: string; onClose?: () => void;
}) {
  return <div className="legacy-notification"><InlineAlert type={type.toLowerCase() as 'success' | 'warning' | 'error' | 'info'} message={message} onClose={onClose} /></div>;
}
