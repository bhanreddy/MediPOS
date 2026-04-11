import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { BRANDING } from '../../config/appContent';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { uiSlice } from '../../state/slices';
import type { RootState } from '../../state/store';
import { CloudAuthService } from '../../services/cloudAuthService';
import type { AuthGate } from '../../services/authGateService';

export function SignupScreen({ onNavigate }: { onNavigate: (gate: AuthGate) => void }) {
  const [name, setName] = useState('');
  const [shopName, setShopName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const dispatch = useDispatch();
  const { isLoading } = useSelector((s: RootState) => s.ui);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');
    dispatch(uiSlice.actions.setLoading(true));
    try {
      await CloudAuthService.signUpAndPersist({
        email: email.trim(),
        password,
        name: name.trim(),
        shopName: shopName.trim(),
        phone: phone.trim(),
      });
      onNavigate('payment');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign up failed');
    } finally {
      dispatch(uiSlice.actions.setLoading(false));
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6 select-none font-sans relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-50 dark:opacity-40"
        aria-hidden
        style={{
          backgroundImage: `
            radial-gradient(ellipse 70% 50% at 50% -10%, rgb(var(--primary) / 0.18), transparent 50%),
            radial-gradient(ellipse 50% 40% at 100% 100%, rgb(var(--primary) / 0.08), transparent 45%)
          `,
        }}
      />
      <div className="w-full max-w-md relative bg-surface/95 dark:bg-surface/90 backdrop-blur-md border border-border/80 rounded-2xl shadow-xl p-8 ring-1 ring-black/5 dark:ring-white/10">
        <div className="mb-6">
          <Badge variant="primary">New account</Badge>
          <h2 className="text-2xl font-black text-foreground-strong mt-2 tracking-tighter uppercase italic">
            {BRANDING.productName}
          </h2>
          <p className="text-muted text-sm font-medium mt-1">Create your shop owner account, then activate a plan.</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <Input label="Full name" value={name} onChange={e => setName(e.target.value)} required autoComplete="name" />
          <Input label="Shop name" value={shopName} onChange={e => setShopName(e.target.value)} required />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <Input
            label="Phone"
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            required
            autoComplete="tel"
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            error={error}
          />

          <Button type="submit" className="w-full h-12" isLoading={isLoading}>
            Create account & continue
          </Button>
        </form>

        <p className="text-center text-xs text-muted mt-6">
          Already registered?{' '}
          <button
            type="button"
            className="text-primary font-black uppercase tracking-widest underline-offset-2 hover:underline"
            onClick={() => onNavigate('login')}
          >
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
