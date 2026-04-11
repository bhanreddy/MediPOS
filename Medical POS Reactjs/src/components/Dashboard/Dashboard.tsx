import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../state/store';
import { Badge } from '../ui/Badge';
import { useDashboardMetrics } from '../../hooks/useDashboardMetrics';
import { ShoppingCart, Package, Download, Activity, AlertTriangle, Clock, Server, TrendingUp, Calendar, ArrowRight } from 'lucide-react';
import { cn } from '../../utils/cn';
import { DASHBOARD_COPY, DASHBOARD_QUICK_ACTIONS, METRICS_CONFIG } from '../../config/appContent';
import type { DashboardQuickActionId } from '../../config/appContent';

const QUICK_ACTION_ICONS: Record<DashboardQuickActionId, typeof ShoppingCart> = {
    billing: ShoppingCart,
    inventory: Package,
    purchase: Download,
};

interface DashboardProps {
    onNavigateById: (id: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigateById }) => {
    const { user } = useSelector((s: RootState) => s.auth);
    const { metrics, isLoading } = useDashboardMetrics();
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const getGreeting = () => {
        const hour = currentTime.getHours();
        if (hour < 12) return DASHBOARD_COPY.greetMorning;
        if (hour < 18) return DASHBOARD_COPY.greetAfternoon;
        return DASHBOARD_COPY.greetEvening;
    };

    const formattedTime = currentTime.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    });

    const formattedDate = currentTime.toLocaleDateString('en-IN', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
    });

    const displaySales = metrics.dailySales.toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 });

    const [primaryAction, ...secondaryActions] = DASHBOARD_QUICK_ACTIONS;
    const PrimaryIcon = QUICK_ACTION_ICONS[primaryAction.id];
    const operatorLabel = user?.name?.trim() || DASHBOARD_COPY.operatorRoleFallback;

    return (
        <div className="h-full flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-surface-elevated/50 p-6 rounded-2xl border border-border/50 backdrop-blur-md">
                <div className="flex items-center gap-6">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-primary to-primary/50 flex items-center justify-center text-on-primary shadow-lg shadow-primary/20">
                        <Activity className="w-8 h-8" />
                    </div>
                    <div className="space-y-1">
                        <h2 className="text-3xl font-black text-foreground-strong tracking-tight">
                            {getGreeting()}, <span className="text-primary italic">{operatorLabel}</span>
                        </h2>
                        <div className="flex items-center gap-3">
                            <span className="flex items-center gap-1.5 text-muted text-sm font-semibold bg-surface-alt px-2.5 py-1 rounded-full border border-border/50">
                                <Calendar className="w-3.5 h-3.5" />
                                {formattedDate} • {formattedTime}
                            </span>
                            <div className="flex items-center gap-1.5 text-sm font-semibold">
                                <span className="relative flex h-2.5 w-2.5">
                                    <span
                                        className={cn(
                                            'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
                                            isLoading ? 'bg-warning' : 'bg-success'
                                        )}
                                    />
                                    <span className={cn('relative inline-flex rounded-full h-2.5 w-2.5', isLoading ? 'bg-warning' : 'bg-success')} />
                                </span>
                                <span className={isLoading ? 'text-warning' : 'text-success'}>
                                    {isLoading ? DASHBOARD_COPY.statusSyncing : DASHBOARD_COPY.statusOnline}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                    <Badge variant="primary" className="px-3 py-1 text-sm shadow-sm">
                        {DASHBOARD_COPY.terminalBadge}
                    </Badge>
                    <span className="flex items-center gap-1.5 text-[10px] font-bold text-muted uppercase tracking-wider">
                        <Server className="w-3 h-3" />
                        {DASHBOARD_COPY.storageLabel}
                    </span>
                </div>
            </div>

            <section className="flex-1 flex flex-col lg:flex-row gap-6">
                <div
                    onClick={() => onNavigateById(primaryAction.navId)}
                    className="flex-[2] relative overflow-hidden group cursor-pointer rounded-3xl p-10 flex flex-col justify-between transition-all duration-300 hover:shadow-2xl hover:shadow-primary/30 active:scale-[0.98] border border-border/50 bg-gradient-to-br from-surface-elevated to-surface"
                >
                    <div className="absolute -inset-1 bg-gradient-to-r from-primary to-primary/50 rounded-3xl opacity-20 group-hover:opacity-40 blur-xl transition-opacity duration-500" />
                    <div className="absolute inset-0 bg-primary/5 group-hover:bg-primary/10 transition-colors duration-300" />

                    <div className="relative z-10 flex justify-between items-start">
                        <div className="p-4 bg-primary rounded-2xl shadow-lg shadow-primary/20 text-on-primary group-hover:scale-110 transition-transform duration-300">
                            <PrimaryIcon className="w-12 h-12" />
                        </div>
                        <kbd className="bg-surface/80 backdrop-blur px-3 py-1 rounded-md text-sm font-bold text-foreground border border-border shadow-sm flex items-center gap-1">
                            <span className="text-muted">{DASHBOARD_COPY.pressPrefix}</span> {primaryAction.kbd}
                        </kbd>
                    </div>

                    <div className="relative z-10 mt-12">
                        <h3 className="text-4xl md:text-5xl font-black text-foreground-strong tracking-tight group-hover:text-primary transition-colors flex items-center gap-3">
                            {primaryAction.title}
                            <ArrowRight className="w-8 h-8 opacity-0 -ml-4 group-hover:opacity-100 group-hover:ml-0 transition-all duration-300" />
                        </h3>
                        <p className="text-muted font-medium text-lg mt-3 flex items-center gap-2">{primaryAction.description}</p>
                    </div>
                </div>

                <div className="flex-1 grid grid-cols-1 gap-6">
                    {secondaryActions.map(action => {
                        const Icon = QUICK_ACTION_ICONS[action.id];
                        const isWarn = action.variant === 'warning';
                        return (
                            <div
                                key={action.id}
                                onClick={() => onNavigateById(action.navId)}
                                className={cn(
                                    'relative overflow-hidden bg-surface-elevated border border-border rounded-3xl p-6 flex flex-col justify-between group cursor-pointer transition-all duration-300 hover:shadow-xl active:scale-95',
                                    isWarn ? 'hover:border-warning/50 hover:shadow-warning/10' : 'hover:border-primary/50 hover:shadow-primary/10'
                                )}
                            >
                                <div
                                    className={cn(
                                        'absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl -mr-16 -mt-16 transition-opacity group-hover:opacity-100 opacity-0',
                                        isWarn ? 'bg-warning/10' : 'bg-primary/10'
                                    )}
                                />
                                <div className="relative z-10 flex justify-between items-start mb-6">
                                    <div
                                        className={cn(
                                            'p-3 rounded-xl group-hover:scale-110 transition-transform duration-300',
                                            isWarn ? 'bg-warning/10 text-warning' : 'bg-primary/10 text-primary'
                                        )}
                                    >
                                        <Icon className="w-8 h-8" />
                                    </div>
                                    <kbd className="bg-surface px-2 py-1 rounded-md text-xs font-bold text-muted border border-border">{action.kbd}</kbd>
                                </div>
                                <div className="relative z-10">
                                    <h4
                                        className={cn(
                                            'text-xl font-bold text-foreground-strong transition-colors',
                                            isWarn ? 'group-hover:text-warning' : 'group-hover:text-primary'
                                        )}
                                    >
                                        {action.title}
                                    </h4>
                                    <p className="text-sm text-muted mt-1">{action.description}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pb-6">
                <KpiCard
                    title={DASHBOARD_COPY.kpi.salesToday}
                    value={isLoading ? '...' : displaySales}
                    subValue={DASHBOARD_COPY.kpi.billsSuffix(metrics.dailyBillCount)}
                    variant="success"
                    icon={<TrendingUp className="w-5 h-5" />}
                />
                <KpiCard
                    title={DASHBOARD_COPY.kpi.lowStock}
                    value={isLoading ? '...' : metrics.lowStockCount.toString().padStart(2, '0')}
                    subValue={DASHBOARD_COPY.kpi.lowStockSub(METRICS_CONFIG.dashboardLowStockUnitThreshold)}
                    variant={metrics.lowStockCount > 0 ? 'danger' : 'neutral'}
                    icon={<AlertTriangle className="w-5 h-5" />}
                />
                <KpiCard
                    title={DASHBOARD_COPY.kpi.expiringSoon}
                    value={isLoading ? '...' : metrics.expiringSoonCount.toString().padStart(2, '0')}
                    subValue={DASHBOARD_COPY.kpi.expiringSoonSub(METRICS_CONFIG.dashboardExpiringWithinDays)}
                    variant={metrics.expiringSoonCount > 0 ? 'warning' : 'neutral'}
                    icon={<Clock className="w-5 h-5" />}
                />
                <KpiCard
                    title={DASHBOARD_COPY.kpi.syncQueue}
                    value={isLoading ? '...' : metrics.syncPendingCount.toString()}
                    subValue={metrics.syncPendingCount === 0 ? DASHBOARD_COPY.kpi.syncAllClear : DASHBOARD_COPY.kpi.syncPending}
                    variant={metrics.syncPendingCount > 0 ? 'primary' : 'neutral'}
                    icon={<Activity className="w-5 h-5" />}
                />
            </div>
        </div>
    );
};

const KpiCard = ({ title, value, subValue, variant, icon }: any) => {
    const config = {
        primary: { border: 'border-primary/30', bg: 'bg-primary/5', text: 'text-primary', glow: 'group-hover:shadow-primary/20' },
        success: { border: 'border-success/30', bg: 'bg-success/5', text: 'text-success', glow: 'group-hover:shadow-success/20' },
        warning: { border: 'border-warning/30', bg: 'bg-warning/5', text: 'text-warning', glow: 'group-hover:shadow-warning/20' },
        danger: { border: 'border-danger/30', bg: 'bg-danger/5', text: 'text-danger', glow: 'group-hover:shadow-danger/20' },
        neutral: { border: 'border-border', bg: 'bg-surface-elevated', text: 'text-muted', glow: 'group-hover:shadow-black/5' },
    };

    const style = config[variant as keyof typeof config] || config.neutral;

    return (
        <div
            className={cn(
                'relative overflow-hidden p-6 rounded-2xl border transition-all duration-300 group hover:shadow-xl hover:-translate-y-1 bg-surface-elevated',
                style.border,
                style.glow
            )}
        >
            <div className={cn('absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500', style.bg)} />

            <div className="relative z-10 flex justify-between items-start mb-4">
                <p className="text-sm font-bold uppercase tracking-wider text-muted group-hover:text-foreground transition-colors">{title}</p>
                <div className={cn('p-2 rounded-lg bg-surface', style.text)}>{icon}</div>
            </div>

            <div className="relative z-10 flex flex-col">
                <span className="text-3xl font-black text-foreground-strong tracking-tight tabular-nums">{value}</span>
                <span className={cn('text-xs font-semibold mt-1 flex items-center gap-1', style.text)}>{subValue}</span>
            </div>
        </div>
    );
};
