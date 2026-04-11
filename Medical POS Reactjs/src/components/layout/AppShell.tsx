import React from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';
import type { NavItem } from '../../config/navigation';

interface AppShellProps {
    children: React.ReactNode;
    activeNavId?: string | null;
    onNavigate?: (id: string) => void;
    navItems: NavItem[];
}

export const AppShell: React.FC<AppShellProps> = ({ children, activeNavId, onNavigate, navItems }) => {
    return (
        <div className="h-full w-full min-h-0 flex flex-col overflow-hidden select-none text-foreground bg-background relative">
            <div
                className="pointer-events-none absolute inset-0 opacity-40 dark:opacity-25"
                aria-hidden
                style={{
                    backgroundImage: `
            radial-gradient(ellipse 80% 50% at 50% -20%, rgb(var(--primary) / 0.12), transparent 55%),
            radial-gradient(ellipse 60% 40% at 100% 50%, rgb(var(--primary) / 0.06), transparent 45%)
          `,
                }}
            />
            <div className="relative flex flex-col flex-1 min-h-0 z-0">
                <Header />

                <div className="flex-1 flex overflow-hidden min-h-0">
                    <Sidebar activeNavId={activeNavId} onNavigate={onNavigate} navItems={navItems} />

                    <main className="flex-1 relative flex flex-col overflow-hidden min-w-0">
                        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-surface-elevated/25 pointer-events-none" aria-hidden />
                        <div
                            className="flex-1 overflow-auto p-6 sm:p-8 focus:outline-none relative scroll-smooth"
                            tabIndex={-1}
                        >
                            {children}
                        </div>
                    </main>
                </div>

                <StatusBar />
            </div>
        </div>
    );
};
