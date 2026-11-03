import { Component, Suspense, useEffect, type ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { RefreshCw, WifiOff } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { PageLoading } from '../ui/PageLoading';
import { Button } from '../ui/Button';

class PageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error('Workspace page failed', error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div role="alert" className="premium-card p-8 space-y-4">
      <h1>This page couldn’t load</h1>
      <p className="text-muted">Your session is saved. Try reloading, or open another page from the navigation.</p>
      <Button onClick={() => window.location.reload()}><RefreshCw size={16} aria-hidden /> Reload page</Button>
    </div>;
  }
}

const subscribe = (notify: () => void) => {
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);
  return () => { window.removeEventListener('online', notify); window.removeEventListener('offline', notify); };
};

export function ConnectionStatus() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  return online ? null : <div role="status" className="connection-banner"><WifiOff size={16} aria-hidden /> You’re offline. Reconnect to load current data and save changes.</div>;
}

/** Keep navigation mounted during lazy loads and recoverable page crashes. */
export function WorkspaceRoute({ label }: { label?: string }) {
  const location = useLocation();
  useEffect(() => {
    const title = label || location.pathname.split('/').filter(Boolean).at(-1)?.replaceAll('-', ' ') || 'Workspace';
    document.title = `${title} · Nexsyrus`;
    const main = document.getElementById('workspace-content');
    main?.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.pathname, label]);
  return <PageBoundary key={location.pathname}><Suspense fallback={<PageLoading />}><Outlet /></Suspense></PageBoundary>;
}
