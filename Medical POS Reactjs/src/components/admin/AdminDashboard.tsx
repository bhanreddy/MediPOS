import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { Card } from '../ui/Card';
import { Building2, Users, Receipt, Activity } from 'lucide-react';
import { BarChart, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export const AdminDashboard = () => {
    const { data: stats, isLoading } = useQuery({
        queryKey: ['admin-stats'],
        queryFn: async () => {
            const { data } = await api.get('/admin/stats');
            return data;
        }
    });

    if (isLoading) {
        return (
            <div className="space-y-6">
                <h1 className="text-2xl font-bold text-foreground">Platform Overview</h1>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="h-32 bg-bg-card animate-pulse rounded-xl border border-border" />
                    ))}
                </div>
            </div>
        );
    }

    const COLORS = ['#00C9A7', '#0077B6', '#F59E0B'];

    return (
        <div className="space-y-8 max-w-7xl mx-auto">
            <div>
                <h1 className="text-2xl font-bold text-foreground">Platform Overview</h1>
                <p className="text-muted">Live metrics across all multitenant instances.</p>
            </div>

            {/* StatCards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="p-6 flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-muted uppercase text-xs font-bold tracking-wider">
                        <Building2 className="w-4 h-4 text-accent-primary" /> Active Clinics
                    </div>
                    <div className="text-3xl font-black">{stats?.active_clinics} <span className="text-sm font-normal text-muted">/ {stats?.total_clinics} total</span></div>
                </Card>
                <Card className="p-6 flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-muted uppercase text-xs font-bold tracking-wider">
                        <Activity className="w-4 h-4 text-warning" /> Trial Clinics
                    </div>
                    <div className="text-3xl font-black">{stats?.trial_clinics}</div>
                </Card>
                <Card className="p-6 flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-muted uppercase text-xs font-bold tracking-wider">
                        <Receipt className="w-4 h-4 text-success" /> Paid Clinics
                    </div>
                    <div className="text-3xl font-black">{stats?.paid_clinics}</div>
                </Card>
                <Card className="p-6 flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-muted uppercase text-xs font-bold tracking-wider">
                        <Users className="w-4 h-4 text-accent-secondary" /> Total Users
                    </div>
                    <div className="text-3xl font-black">{stats?.total_users}</div>
                </Card>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="p-6">
                    <h3 className="text-lg font-bold mb-6">Plan Distribution</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={stats?.plan_distribution || []}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="count"
                                    nameKey="plan"
                                >
                                    {(stats?.plan_distribution || []).map((_: any, index: number) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={{ backgroundColor: '#0F1117', borderColor: '#ffffff1a' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="flex justify-center gap-6 mt-4">
                        {(stats?.plan_distribution || []).map((entry: any, index: number) => (
                            <div key={entry.plan} className="flex items-center gap-2 text-sm capitalize">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                                {entry.plan}: {entry.count}
                            </div>
                        ))}
                    </div>
                </Card>

                {/* Placeholder for Revenue Chart */}
                <Card className="p-6 flex flex-col items-center justify-center text-muted border-dashed">
                    <BarChart className="w-12 h-12 mb-4 opacity-50" />
                    <p>New Clinics (Last 12 Months)</p>
                    <p className="text-xs mt-1">Collecting aggregated data point metrics...</p>
                </Card>
            </div>
        </div>
    );
};
