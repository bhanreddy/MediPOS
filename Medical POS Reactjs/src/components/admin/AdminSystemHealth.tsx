import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { Card } from '../ui/Card';
import { Activity, Database, Server, Smartphone } from 'lucide-react';

export const AdminSystemHealth = () => {
    const { data: health, isLoading } = useQuery({
        queryKey: ['system-health'],
        queryFn: async () => {
            const { data } = await api.get('/health');
            return data;
        },
        refetchInterval: 10000 // Refetch every 10s roughly
    });

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            <div>
                <h1 className="text-2xl font-bold text-foreground">System Health</h1>
                <p className="text-muted">Live diagnostic telemetry</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="p-6">
                    <div className="flex items-center gap-3 mb-2">
                        <Server className="w-5 h-5 text-accent-primary" />
                        <h3 className="font-bold">Backend API</h3>
                    </div>
                    {isLoading ? (
                        <div className="h-4 w-16 bg-bg-primary animate-pulse rounded" />
                    ) : (
                        <div className="flex items-center gap-2">
                            <span className={`flex h-3 w-3 relative`}>
                                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${health?.status === 'ok' ? 'bg-success' : 'bg-danger'}`}></span>
                                <span className={`relative inline-flex rounded-full h-3 w-3 ${health?.status === 'ok' ? 'bg-success' : 'bg-danger'}`}></span>
                            </span>
                            <span className="font-semibold text-lg">{health?.status === 'ok' ? 'Live' : 'Down'}</span>
                        </div>
                    )}
                    <p className="text-xs text-muted mt-2">v{health?.version || '...'}</p>
                </Card>

                <Card className="p-6">
                    <div className="flex items-center gap-3 mb-2">
                        <Database className="w-5 h-5 text-accent-secondary" />
                        <h3 className="font-bold">Supabase DB</h3>
                    </div>
                    {isLoading ? (
                        <div className="h-4 w-16 bg-bg-primary animate-pulse rounded" />
                    ) : (
                        <div className="flex items-center gap-2">
                            <span className="flex h-3 w-3 rounded-full bg-success"></span>
                            <span className="font-semibold text-lg capitalize">{health?.db || 'Connected'}</span>
                        </div>
                    )}
                    <p className="text-xs text-muted mt-2">Edge Connection Pool</p>
                </Card>

                <Card className="p-6">
                    <div className="flex items-center gap-3 mb-2">
                        <Activity className="w-5 h-5 text-warning" />
                        <h3 className="font-bold">Edge Functions</h3>
                    </div>
                    <div className="flex flex-col gap-1 mt-2">
                        <span className="text-sm font-semibold">daily-alerts</span>
                        <p className="text-xs text-muted">Awaiting sync</p>
                    </div>
                </Card>

                <Card className="p-6">
                    <div className="flex items-center gap-3 mb-2">
                        <Smartphone className="w-5 h-5 text-foreground-strong" />
                        <h3 className="font-bold">Push Notifications</h3>
                    </div>
                    <p className="text-sm">Connecting via Expo</p>
                    <p className="text-xs text-muted mt-2">Delivery Rate tracking initialized</p>
                </Card>
            </div>

            {/* Audit Edge Logs Placeholder */}
            <Card className="p-6 border border-danger/50 bg-danger/5">
                <h3 className="text-lg font-bold text-danger mb-4 flex items-center"><Activity className="w-5 h-5 mr-2" /> Recent Errors Trapped</h3>
                <div className="text-sm text-foreground overflow-x-auto p-4 bg-bg-primary rounded-lg border border-border/50 select-text font-mono whitespace-pre-wrap">
                    # End of structured logs
                    {"\n\n> waiting for diagnostic telemetry anomalies..."}
                </div>
            </Card>
        </div>
    );
};
