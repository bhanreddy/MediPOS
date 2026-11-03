import { useAuth } from '../../lib/auth';
import { AuthFrame } from './AuthFrame';
import { Button } from '../ui/Button';
import { RefreshCw } from 'lucide-react';

/** Keep a saved login in recovery instead of bouncing between login and the app. */
export function SessionRecovery() {
  const { checkSession, signOut } = useAuth();
  return (
    <AuthFrame title="Your session is saved" subtitle="We couldn’t reconnect to your account. Check your connection and try again. You haven’t been signed out.">
      <div className="flex items-center gap-4">
        <Button
          onClick={() => void checkSession()}
        >
          <RefreshCw size={16} aria-hidden /> Try again
        </Button>
        <Button
          variant="ghost"
          onClick={() => void signOut()}
        >
          Sign out
        </Button>
      </div>
    </AuthFrame>
  );
}
