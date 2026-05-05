import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';

/** `/` had no matching route, so the root Outlet rendered nothing. Send users to login or their dashboard. */
export function HomeRedirect() {
  const { session, role, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;
    if (!session) {
      navigate('/login', { replace: true });
      return;
    }
    if (role === 'SUPER_ADMIN') {
      navigate('/admin/dashboard', { replace: true });
      return;
    }
    navigate('/dashboard', { replace: true });
  }, [isLoading, session, role, navigate]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center space-y-4">
      <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
