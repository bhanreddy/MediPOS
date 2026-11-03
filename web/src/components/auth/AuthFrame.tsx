import type { ReactNode } from 'react';
import { Plus, ShieldCheck } from 'lucide-react';
import { BRANDING } from '../../config/appContent';

export function AuthFrame({ title, subtitle, children }: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <main className="auth-workspace">
      <div className="auth-brand">
        <span className="auth-brand-mark" aria-hidden="true"><Plus size={24} /></span>
        <span>{BRANDING.productName}</span>
      </div>
      <section className="auth-frame">
        <span className="text-xs font-semibold text-primary">Your pharmacy workspace</span>
        <h2>{title}</h2>
        <p>{subtitle}</p>
        {children}
      </section>
      <footer className="auth-footer">
        <span>{BRANDING.shortProductName}</span>
        <span><ShieldCheck size={14} aria-hidden /> Secure account access</span>
      </footer>
    </main>
  );
}
