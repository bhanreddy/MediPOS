import { Link, useRouteError, isRouteErrorResponse } from 'react-router-dom';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { AuthFrame } from './auth/AuthFrame';
import { Button } from './ui/Button';

export function RouteError() {
  const error = useRouteError();
  const missing = isRouteErrorResponse(error) && error.status === 404;
  return <AuthFrame title={missing ? 'Page not found' : 'This page couldn’t load'} subtitle={missing ? 'Check the address or return to your dashboard.' : 'Your login is saved. Reload this page to try again.'}>
    <div className="flex flex-wrap items-center gap-4">
      {!missing && <Button onClick={() => window.location.reload()}><RefreshCw size={16} aria-hidden /> Reload page</Button>}
      <Link className="inline-flex items-center gap-2 text-primary text-sm font-semibold" to="/dashboard">Go to dashboard <ArrowRight size={16} aria-hidden /></Link>
    </div>
  </AuthFrame>;
}
