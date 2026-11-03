import { ChevronLeft, ChevronRight, RefreshCw, SearchX } from 'lucide-react';
import { Button } from './Button';

export function LoadError({ onRetry }: { onRetry: () => void }) {
  return <div role="alert" className="list-feedback border border-danger/20 bg-danger/5 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
    <div><p className="font-semibold">We couldn’t load these records</p><p className="text-sm text-muted">Check your connection, then try again.</p></div>
    <Button variant="secondary" size="sm" onClick={onRetry}><RefreshCw size={14} aria-hidden /> Retry</Button>
  </div>;
}

export function NoSearchResults({ onClear }: { onClear: () => void }) {
  return <div className="flex flex-col items-center gap-3"><SearchX size={28} className="text-muted" aria-hidden />
    <p className="font-medium">No matching records</p><p className="text-sm text-muted">Try a shorter search or clear your filters.</p>
    <Button variant="secondary" size="sm" onClick={onClear}>Clear search</Button>
  </div>;
}

export function Pagination({ page, limit, total, onPage, busy = false }: { page: number; limit: number; total: number; onPage: (page: number) => void; busy?: boolean }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return <nav aria-label="Results pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
    <p className="text-xs text-muted" role="status">{total ? `${(page - 1) * limit + 1}–${Math.min(page * limit, total)} of ${total}` : '0 records'}</p>
    <div className="flex items-center gap-2"><Button variant="secondary" size="sm" disabled={busy || page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft size={16} aria-hidden /></Button>
      <span className="text-xs tabular-nums px-2">Page {page} of {pages}</span>
      <Button variant="secondary" size="sm" disabled={busy || page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight size={16} aria-hidden /></Button>
    </div>
  </nav>;
}
