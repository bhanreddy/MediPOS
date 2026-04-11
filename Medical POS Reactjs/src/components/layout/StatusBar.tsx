import React from 'react';
import { useSelector } from 'react-redux';
import { type RootState } from '../../state/store';

export const StatusBar: React.FC = () => {
    const { statusMessage, isLoading } = useSelector((state: RootState) => state.ui);

    return (
        <footer className="relative h-10 shrink-0 z-10 flex items-center justify-between px-4 sm:px-5 text-xs font-semibold tracking-tight border-t border-border/80 bg-surface/90 backdrop-blur-sm">
            <div
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent"
                aria-hidden
            />
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 uppercase text-[10px] font-bold tracking-wide">
                    <span className="text-muted">System</span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-success/15 text-success px-1.5 py-px ring-1 ring-success/25">
                        <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" aria-hidden />
                        Ready
                    </span>
                </div>
                <div className="h-3 w-px bg-border/60" />
                <div className="flex items-center gap-1.5 uppercase text-[10px] font-bold tracking-wide">
                    <span className="text-muted">Sync</span>
                    <span className="text-warning">2m ago</span>
                </div>
            </div>

            <div className="flex-1 px-6 truncate text-center uppercase tracking-widest text-[10px] font-bold text-muted">
                {isLoading ? (
                    <span className="text-primary animate-pulse">Processing transaction…</span>
                ) : (
                    statusMessage || 'POS terminal secure • Local encryption'
                )}
            </div>

            <div className="flex items-center gap-3 sm:gap-4">
                <div
                    className="hidden lg:flex items-center gap-1 text-[10px] font-mono text-muted tracking-tight"
                    title="Global shortcuts when focus is not on Purchase or Inventory local keys"
                >
                    <kbd className="rounded-md border border-border/80 px-1.5 py-px bg-surface-elevated shadow-sm">F1–F12</kbd>
                    <span>nav</span>
                    <span className="text-border">·</span>
                    <kbd className="rounded-md border border-border/80 px-1.5 py-px bg-surface-elevated shadow-sm">Esc</kbd>
                    <span>home</span>
                    <span className="text-border">·</span>
                    <span className="uppercase font-sans text-[9px]">Stock/In: F6/F4/F12</span>
                </div>
                <div className="h-3 w-px bg-border/60 hidden lg:block" />
                <div className="flex items-center gap-1.5 uppercase text-[10px] font-bold">
                    <span className="text-muted hidden sm:inline">DB</span>
                    <span className="text-foreground-strong">IndexedDB</span>
                </div>
                <div className="h-3 w-px bg-border/60" />
                <div className="text-muted uppercase text-[10px] font-bold tabular-nums">v1.0.4</div>
            </div>
        </footer>
    );
};
