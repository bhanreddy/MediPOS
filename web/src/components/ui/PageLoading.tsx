export function PageLoading() {
  return (
    <div className="page-loading space-y-6" role="status" aria-live="polite" aria-label="Loading page">
      <span className="sr-only">Loading your workspace…</span>
      <div className="space-y-3"><div className="skeleton h-7 w-48" /><div className="skeleton h-4 w-72 max-w-full" /></div>
      <div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map(i => <div key={i} className="skeleton h-28" />)}</div>
      <div className="premium-card p-5 space-y-5">{[0, 1, 2, 3, 4].map(i => <div key={i} className="skeleton h-9" />)}</div>
    </div>
  );
}
