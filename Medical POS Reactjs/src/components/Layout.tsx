import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../state/store';
import { AuthService } from '../services/authService';

interface LayoutProps {
    children: React.ReactNode;
    activeScreen?: string;
}

export const Layout: React.FC<LayoutProps> = ({ children, activeScreen }) => {
    const { user, session } = useSelector((state: RootState) => state.auth);
    const { statusMessage, isLoading } = useSelector((state: RootState) => state.ui);
    const [time, setTime] = useState(new Date().toLocaleTimeString());

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
        return () => clearInterval(timer);
    }, []);

    const handleLogout = () => {
        AuthService.logout();
    };

    return (
        <div style={{ display: 'flex', height: '100vh', width: '100vw', background: 'var(--bg-main)' }}>
            {/* SIDEBAR */}
            <aside style={{
                width: '240px',
                background: 'var(--bg-sidebar)',
                borderRight: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column'
            }}>
                <div style={{ padding: 'var(--space-lg)', borderBottom: '1px solid var(--border-color)' }}>
                    <h2 style={{ fontSize: 'var(--size-lg)', color: 'var(--brand-primary)' }}>MedPOS Pro</h2>
                </div>
                <nav style={{ flex: 1, padding: 'var(--space-md)' }}>
                    <NavItem label="F1 - Billing" active={activeScreen === 'BILLING'} />
                    <NavItem label="F2 - Inventory" active={activeScreen === 'INVENTORY'} />
                    <NavItem label="F3 - Purchase" active={activeScreen === 'PURCHASE'} />
                    <NavItem label="F4 - Expenses" active={activeScreen === 'EXPENSES'} />
                    <NavItem label="F5 - Customers" active={activeScreen === 'CUSTOMERS'} />
                    <NavItem label="F6 - Reports" active={activeScreen === 'REPORTS'} />
                </nav>
                <div style={{ padding: 'var(--space-md)', borderTop: '1px solid var(--border-color)' }}>
                    <button
                        onClick={handleLogout}
                        style={{
                            width: '100%',
                            padding: 'var(--space-sm)',
                            background: 'transparent',
                            border: '1px solid var(--brand-error)',
                            color: 'var(--brand-error)',
                            borderRadius: 'var(--radius-sm)',
                            cursor: 'pointer'
                        }}
                    >
                        Logout (Esc)
                    </button>
                </div>
            </aside>

            {/* MAIN CONTENT */}
            <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                {/* HEADER */}
                <header style={{
                    height: '64px',
                    background: 'var(--bg-header)',
                    borderBottom: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 var(--space-lg)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-lg)' }}>
                        <span style={{ fontSize: 'var(--size-md)', fontWeight: 'var(--weight-bold)' }}>
                            {session?.is_offline_session ? '🔴 OFFLINE MODE' : '🟢 ONLINE MODE'}
                        </span>
                        <span style={{ color: 'var(--text-secondary)' }}>Operator: <strong>{user?.name}</strong></span>
                    </div>
                    <div style={{ fontSize: 'var(--size-lg)', fontWeight: 'var(--weight-bold)', fontVariantNumeric: 'tabular-nums' }}>
                        {time}
                    </div>
                </header>

                {/* CONTENT AREA */}
                <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-lg)' }}>
                    {children}
                </div>

                {/* STATUS BAR */}
                <footer style={{
                    height: '32px',
                    background: 'var(--bg-sidebar)',
                    borderTop: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 var(--space-md)',
                    fontSize: 'var(--size-xs)'
                }}>
                    <div>
                        System: <span className="text-success">Ready</span> | Last Sync: 2 mins ago
                    </div>
                    <div>
                        {statusMessage} {isLoading && '(Processing...)'}
                    </div>
                </footer>
            </main>
        </div>
    );
};

const NavItem: React.FC<{ label: string; active?: boolean }> = ({ label, active }) => (
    <div style={{
        padding: 'var(--space-md)',
        borderRadius: 'var(--radius-md)',
        background: active ? 'var(--brand-primary)' : 'transparent',
        color: active ? 'var(--bg-main)' : 'var(--text-primary)',
        fontWeight: active ? 'var(--weight-bold)' : 'var(--weight-normal)',
        marginBottom: 'var(--space-sm)',
        cursor: 'pointer'
    }}>
        {label}
    </div>
);
