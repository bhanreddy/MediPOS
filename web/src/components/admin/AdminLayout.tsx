import { Link, useLocation } from 'react-router-dom';
import { ConnectionStatus, WorkspaceRoute } from '../layout/WorkspaceRoute';
import { useAuth } from '../../lib/auth';
import { LayoutDashboard, Building2, Users, Activity, LogOut } from 'lucide-react';
import { Button } from '../ui/Button';

export const AdminLayout = () => {
    const { signOut } = useAuth();
    const location = useLocation();

    const navLinks = [
        { name: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
        { name: 'All Clinics', path: '/admin/clinics', icon: Building2 },
        { name: 'All Users', path: '/admin/users', icon: Users },
        { name: 'System Health', path: '/admin/system', icon: Activity },
    ];

    return (
        <div className="admin-workspace flex h-screen bg-background text-foreground overflow-hidden">
            <a href="#workspace-content" className="skip-link">Skip to page content</a>
            {/* Sidebar */}
            <aside className="w-64 bg-bg-surface border-r border-border flex flex-col">
                <div className="p-6 border-b border-border">
                    <h1 className="text-lg font-semibold text-foreground-strong">Nexsyrus</h1>
                    <p className="text-xs text-muted mt-1 uppercase tracking-wider">Super Admin</p>
                </div>
                
                <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                    {navLinks.map((link) => {
                        const isActive = location.pathname.startsWith(link.path);
                        const Icon = link.icon;
                        return (
                            <Link
                                key={link.path}
                                to={link.path}
                                title={link.name}
                                aria-current={isActive ? 'page' : undefined}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                                    isActive 
                                        ? 'bg-accent-primary/10 text-accent-primary font-medium' 
                                        : 'text-muted hover:bg-bg-card hover:text-foreground'
                                }`}
                            >
                                <Icon className="w-5 h-5" />
                                <span>{link.name}</span>
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-border">
                    <Button 
                        variant="ghost" 
                        className="w-full justify-start text-muted hover:text-danger hover:bg-danger/10"
                        onClick={() => signOut()}
                    >
                        <LogOut className="w-5 h-5 mr-3" />
                        Sign Out
                    </Button>
                </div>
            </aside>

            {/* Main Content */}
            <main id="workspace-content" tabIndex={-1} className="premium-content flex-1 min-w-0 overflow-y-auto relative">
                <ConnectionStatus />
                <WorkspaceRoute />
            </main>
        </div>
    );
};
