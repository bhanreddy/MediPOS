import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { LoginExperience } from "./LoginExperience";
import {
  ArrowRight,
  ArrowUpRight,
  CircleAlert,
  CircleCheck,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
} from "lucide-react";
import { supabase, SUPABASE_AUTH_STORAGE_KEY } from "../../lib/supabase";
import { remembersSession, setSessionPersistence } from "../../lib/store";
import { uiSlice } from "../../state/slices";
import type { RootState } from "../../state/store";
import { CloudAuthService } from "../../services/cloudAuthService";
import { routeAfterPasswordLogin } from "../../services/authGateService";
import type { AuthGate } from "../../services/authGateService";

type LoginScreenProps = {
  onNavigate: (gate: AuthGate) => void;
};

/**
 * Cloud login (email/password) only. Offline-first shadowing has been retired.
 */
export function LoginScreen({ onNavigate }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [rememberMe, setRememberMe] = useState(remembersSession);
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const dispatch = useDispatch();
  const { isLoading } = useSelector((s: RootState) => s.ui);

  const submitCloud = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isLoading) return;
    setError("");
    dispatch(uiSlice.actions.setLoading(true));
    try {
      if (resetMode) {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (resetError) throw resetError;
        setResetSent(true);
        return;
      }
      await setSessionPersistence(rememberMe, SUPABASE_AUTH_STORAGE_KEY);
      await CloudAuthService.signInAndPersist({
        email: email.trim(),
        password,
      });
      await CloudAuthService.persistSessionFromClient();
      const next = await routeAfterPasswordLogin();
      onNavigate(next);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      dispatch(uiSlice.actions.setLoading(false));
    }
  };

  return (
    <LoginExperience>
      <form onSubmit={submitCloud} className="login-form" aria-busy={isLoading}>
        <div className="login-field">
          <label htmlFor="login-email">Email address</label>
          <div className="login-input-wrap">
            <Mail size={18} aria-hidden="true" />
            <input
              id="login-email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError("");
              }}
              required
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="you@pharmacy.com"
              readOnly={isLoading}
            />
          </div>
        </div>
        {resetMode && <p className="login-field-note">Enter your account email to receive a password reset link.</p>}
        {!resetMode && <><div className="login-field">
          <label htmlFor="login-password">Password</label>
          <div className="login-input-wrap">
            <LockKeyhole size={18} aria-hidden="true" />
            <input
              id="login-password"
              name="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              onKeyUp={(e) => setCapsLock(e.getModifierState("CapsLock"))}
              onKeyDown={(e) => setCapsLock(e.getModifierState("CapsLock"))}
              onBlur={() => setCapsLock(false)}
              required
              autoComplete="current-password"
              placeholder="Enter your password"
              readOnly={isLoading}
              aria-describedby={
                error ? "login-error" : capsLock ? "login-caps-lock" : undefined
              }
            />
            <button
              type="button"
              className="login-password-toggle"
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {capsLock && (
            <span
              id="login-caps-lock"
              className="login-field-note"
              role="status"
            >
              Caps Lock is on
            </span>
          )}
        </div>
        </>}
        {resetMode ? (
          <button type="button" className="login-text-button" onClick={() => { setResetMode(false); setResetSent(false); setError(""); }}>Back to login</button>
        ) : (
          <div className="login-options">
            <label className="login-remember"><input type="checkbox" checked={rememberMe} onChange={event => setRememberMe(event.target.checked)} disabled={isLoading} />Remember me</label>
            <button type="button" className="login-text-button" disabled={isLoading} onClick={() => { setResetMode(true); setError(""); }}>Forgot password?</button>
          </div>
        )}
        {resetSent && <div className="login-success" role="status"><CircleCheck size={18} aria-hidden="true" /><span>If an account exists for this email, a password reset link is on its way.</span></div>}
        {error && (
          <div id="login-error" className="login-error" role="alert">
            <CircleAlert size={18} aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
        <button type="submit" className="login-submit" disabled={isLoading}>
          {isLoading ? (
            <>
              <LoaderCircle
                size={19}
                className="animate-spin"
                aria-hidden="true"
              />{" "}
              {resetMode ? "Sending reset link…" : "Signing you in…"}
            </>
          ) : (
            <>
              {resetMode ? "Send reset link" : "Login"}{" "}
              <ArrowRight size={18} aria-hidden="true" />
            </>
          )}
        </button>
      </form>

      <div className="login-switch">
        <span>New to Nexsyrus?</span>
        <button
          type="button"
          disabled={isLoading}
          onClick={() => onNavigate("signup")}
        >
          Create an account <ArrowUpRight size={14} aria-hidden="true" />
        </button>
      </div>
    </LoginExperience>
  );
}
