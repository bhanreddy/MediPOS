import toast, { Toaster, resolveValue } from 'react-hot-toast';
import { Notification } from './Notification';

/** One compact, opaque message style for notifications from every workflow. */
export function AppToaster() {
  return <Toaster position="top-right" gutter={8} containerClassName="message-toaster" toastOptions={{ duration: 4500, error: { duration: 6000 } }}>
    {item => <div className={`message-toast ${item.visible ? 'is-visible' : 'is-leaving'}`}>
      <Notification tone={item.type === 'blank' || item.type === 'custom' ? 'info' : item.type} onClose={() => toast.dismiss(item.id)} {...item.ariaProps}>
        {resolveValue(item.message, item)}
      </Notification>
    </div>}
  </Toaster>;
}
