import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { type RootState } from '../../state/store';
import { useTheme } from '../../hooks/useTheme';
import { AuthService } from '../../services/authService';
import { Badge } from '../ui/Badge';
import { BRANDING, HEADER_COPY } from '../../config/appContent';

export const Header: React.FC = () => {
    const { user, session } = useSelector((state: RootState) => state.auth);
    const { alertExpiryCount, alertLowStockCount } = useSelector((state: RootState) => state.ui);
    const [time, setTime] = useState(new Date().toLocaleTimeString());
    const { toggleTheme } = useTheme();

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
        return () => clearInterval(timer);
    }, []);

    return (
        <header className="relative h-20 shrink-0 z-10 flex items-center justify-between px-6 border-b border-border/80 bg-surface-elevated/85 backdrop-blur-md supports-[backdrop-filter]:bg-surface-elevated/70 shadow-[0_1px_0_rgb(255_255_255/0.04)_inset]">
            <div
                className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/35 to-transparent"
                aria-hidden
            />
            <div className="flex items-center gap-6">
                <div className="flex items-center gap-3">
                    <span
                        className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-lg shadow-inner ring-1 ring-primary/20"
                        aria-hidden
                    >
                        ⚕
                    </span>
                    <div>
                        <h1 className="text-lg font-extrabold text-foreground-strong tracking-tight leading-none">
                            {BRANDING.productName}
                        </h1>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted mt-1">
                            {BRANDING.poweredByLine}
                        </p>
                    </div>
                </div>
                <div className="h-10 w-px bg-gradient-to-b from-transparent via-border to-transparent" />
                <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted font-bold uppercase tracking-widest">{HEADER_COPY.operatorCaption}</span>
                    <span className="text-sm font-semibold text-foreground-strong">{user?.name || HEADER_COPY.operatorFallback}</span>
                </div>
            </div>

            <div className="flex items-center gap-6">
                {(alertExpiryCount > 0 || alertLowStockCount > 0) && (
                    <div className="flex items-center gap-2">
                        {alertExpiryCount > 0 && (
                            <span title={HEADER_COPY.expiryBadgeTitle}>
                                <Badge variant="danger">EXP {alertExpiryCount}</Badge>
                            </span>
                        )}
                        {alertLowStockCount > 0 && (
                            <span title={HEADER_COPY.lowStockBadgeTitle}>
                                <Badge variant="warning">LOW {alertLowStockCount}</Badge>
                            </span>
                        )}
                    </div>
                )}
                <div className="flex flex-col items-end gap-0.5">
                    <span className="text-[10px] text-muted font-bold uppercase tracking-widest">{HEADER_COPY.sessionCaption}</span>
                    <span className={`text-xs font-bold ${session?.is_offline_session ? 'text-danger' : 'text-success'}`}>
                        {session?.is_offline_session ? HEADER_COPY.offlineMode : HEADER_COPY.stableConnect}
                    </span>
                </div>
                <button
                    type="button"
                    onClick={() => void AuthService.logout()}
                    className="text-[10px] font-bold uppercase tracking-widest text-muted hover:text-danger border border-border/80 rounded-lg px-3 py-2 bg-surface/50 hover:bg-danger/10 hover:border-danger/30 transition-colors"
                >
                    {HEADER_COPY.logout}
                </button>
                <div className="h-10 w-px bg-gradient-to-b from-transparent via-border to-transparent" />
                <div className="text-right">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted">Local time</div>
                    <div className="text-xl font-black text-foreground-strong tabular-nums tracking-tight font-mono leading-none mt-0.5">
                        {time}
                    </div>
                </div>
                <button
                    type="button"
                    title="Toggle theme"
                    aria-label="Toggle theme"
                    onMouseDown={e => e.preventDefault()}
                    onClick={toggleTheme}
                    className="h-10 w-10 rounded-xl border border-border/80 bg-surface hover:bg-surface-alt text-foreground flex items-center justify-center transition-colors shadow-sm hover:shadow-md"
                >
                    <span className="theme-toggle-icon text-lg" aria-hidden="true" />
                </button>
            </div>
        </header>
    );
};
