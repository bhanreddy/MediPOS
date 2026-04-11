import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/auth';

export const AuthGuard = ({ children, requireRole }: { children: React.ReactNode, requireRole?: string[] }) => {
  const { session, role, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (isLoading) return;

    if (!session) {
      navigate('/login', { replace: true });
      return;
    }

    if (role === 'SUPER_ADMIN' && !location.pathname.startsWith('/admin')) {
      // Super admin trying to access clinic route directly is allowed per spec ("Super admin trying to access /clinic/* → allow")
      // But typically they go to /admin/first. If they go to / they should be routed to /admin/dashboard
      if (location.pathname === '/' || location.pathname === '/dashboard') {
        navigate('/admin/dashboard', { replace: true });
      }
    } else if (role !== 'SUPER_ADMIN' && location.pathname.startsWith('/admin')) {
      navigate('/403', { replace: true });
    } else if (requireRole && role && !requireRole.includes(role)) {
      navigate('/403', { replace: true });
    }
  }, [isLoading, session, role, navigate, location.pathname, requireRole]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Double check so we don't render children before redirect
  if (!session) return null;
  if (role !== 'SUPER_ADMIN' && location.pathname.startsWith('/admin')) return null;
  if (requireRole && role && !requireRole.includes(role)) return null;

  return children;
};
