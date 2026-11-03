import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CircleAlert, CircleCheck, LoaderCircle, LockKeyhole } from 'lucide-react';
import { LoginExperience } from './LoginExperience';
import { supabase } from '../../lib/supabase';
import { sessionClient } from '../../lib/sessionClient';

/** Landing page for the password recovery link sent by Supabase. */
export function ResetPasswordScreen() {
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!cancelled && event === 'PASSWORD_RECOVERY' && session) { setReady(true); setChecking(false); }
    });
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (cancelled) return;
      setChecking(false);
      setReady(Boolean(data.session) && !sessionError);
    }).catch(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setSaving(true);
    setError('');
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      await sessionClient.signOut();
      setComplete(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'Password could not be updated. Try again.'); }
    finally { setSaving(false); }
  };
  return <LoginExperience recovery>
    {checking ? <p role="status" className="login-field-note">Checking your reset link…</p> : complete ? <div className="login-success" role="status"><CircleCheck size={18} /><span>Password updated. You can now log in.</span></div> : ready ? <form className="login-form" onSubmit={submit} aria-busy={saving}>
      <div className="login-field"><label htmlFor="reset-password">New password</label><div className="login-input-wrap"><LockKeyhole size={18} aria-hidden="true" /><input id="reset-password" type="password" autoComplete="new-password" placeholder="At least 8 characters" minLength={8} required value={password} onChange={event => setPassword(event.target.value)} readOnly={saving} /></div></div>
      <div className="login-field"><label htmlFor="reset-confirm">Confirm password</label><div className="login-input-wrap"><LockKeyhole size={18} aria-hidden="true" /><input id="reset-confirm" type="password" autoComplete="new-password" required value={confirm} onChange={event => setConfirm(event.target.value)} readOnly={saving} /></div></div>
      {error && <div className="login-error" role="alert"><CircleAlert size={18} /><span>{error}</span></div>}
      <button className="login-submit" type="submit" disabled={saving}>{saving && <LoaderCircle className="animate-spin" size={18} />}{saving ? 'Updating password…' : 'Update password'}</button>
    </form> : <div className="login-error" role="alert"><CircleAlert size={18} /><span>This reset link is invalid or has expired. Request a new link from the login page.</span></div>}
    <div className="login-switch"><Link className="login-text-button" to="/login">Back to login</Link></div>
  </LoginExperience>;
}
