'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import LoadingState from './ui/LoadingState';
import { adminFetch, clearAdminTokens, setAdminTokens } from './lib/adminAuth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';
const ENABLE_BOOTSTRAP = process.env.NEXT_PUBLIC_ENABLE_ADMIN_BOOTSTRAP === 'true';
const DEMO_ADMIN_EMAIL = process.env.NEXT_PUBLIC_DEMO_ADMIN_EMAIL || 'demo@glucoforager.com';
const DEMO_ADMIN_PASSWORD = process.env.NEXT_PUBLIC_DEMO_ADMIN_PASSWORD || 'DemoAccess2026!';
const SHOW_DEMO_ADMIN_LOGIN = process.env.NEXT_PUBLIC_SHOW_DEMO_ADMIN_LOGIN !== 'false';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [hasAdmin, setHasAdmin] = useState(null); // null while loading
  const [statusLoading, setStatusLoading] = useState(true);

  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('info'); // info | success | warning | danger

  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaChallengeId, setMfaChallengeId] = useState(null);
  const [mfaCode, setMfaCode] = useState('');

  const authMode = useMemo(() => {
    if (statusLoading) return 'loading';
    if (mfaRequired) return 'mfa';
    if (hasAdmin === false && ENABLE_BOOTSTRAP) return 'bootstrap';
    return 'login';
  }, [ENABLE_BOOTSTRAP, hasAdmin, mfaRequired, statusLoading]);

  useEffect(() => {
    clearAdminTokens();
    const checkStatus = async () => {
      setStatusLoading(true);
      try {
        if (typeof window !== 'undefined') {
          const host = window.location.hostname;
          const isLocalHost = host === 'localhost' || host === '127.0.0.1';
          if (!isLocalHost && String(API_URL || '').includes('localhost')) {
            setMessageTone('warning');
            setMessage(
              `Admin is misconfigured: NEXT_PUBLIC_API_URL points to ${API_URL}. It must point to your API domain (e.g. https://api.glucoforager.com).`
            );
          }
        }
        const response = await fetch(`${API_URL}/api/admin/status`);
        const data = await response.json();
        setHasAdmin(Boolean(data.has_admin));
      } catch {
        setMessageTone('danger');
        setMessage(`Unable to reach Admin API at ${API_URL}. Check NEXT_PUBLIC_API_URL and your API uptime.`);
        setHasAdmin(true);
      } finally {
        setStatusLoading(false);
      }
    };
    checkStatus();
  }, []);

  const redirectAfterLogin = async () => {
    try {
      const res = await adminFetch(`${API_URL}/api/admin/me`);
      if (res.ok) {
        const me = await res.json().catch(() => ({}));
        const perms = Array.isArray(me?.permissions) ? me.permissions : [];
        const roles = Array.isArray(me?.roles) ? me.roles : [];
        const isAdmin = perms.includes('*') || perms.includes('admin.manage') || roles.includes('admin');
        const isDemo = Boolean(me?.is_demo) || roles.includes('demo_admin') || roles.includes('demo');
        router.push(isDemo || isAdmin ? '/admin/admin-dashboard' : '/admin/dashboard');
        return;
      }
    } catch {
      // Ignore and fall back.
    }

    router.push('/admin/dashboard');
  };

  const dismissMessage = () => {
    setMessage('');
    setMessageTone('info');
  };

  const useDemoCredentials = () => {
    setEmail(DEMO_ADMIN_EMAIL);
    setPassword(DEMO_ADMIN_PASSWORD);
    setMessage('Demo credentials added. Sign in to open the read-only demo account.');
    setMessageTone('warning');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (statusLoading || hasAdmin === null) {
      setMessageTone('info');
      setMessage('Checking access… Please try again in a moment.');
      return;
    }

    setIsSubmitting(true);
    setMessage('');
    setMessageTone('info');

    try {
      if (!hasAdmin && !ENABLE_BOOTSTRAP) {
        setMessageTone('danger');
        throw new Error('Admin setup is disabled. Please contact support.');
      }

      if (mfaRequired && mfaChallengeId) {
        const response = await fetch(`${API_URL}/api/admin/staff/mfa/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ challenge_id: mfaChallengeId, code: mfaCode }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setMessageTone('danger');
          throw new Error(data.detail || 'Unable to verify code.');
        }
        setAdminTokens({ accessToken: data.access_token, refreshToken: data.refresh_token });
        await redirectAfterLogin();
        return;
      }

      const endpoint = hasAdmin ? '/api/admin/staff/login' : '/api/admin/bootstrap';
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessageTone('danger');
        throw new Error(data.detail || 'Unable to continue.');
      }

      if (!hasAdmin) {
        setHasAdmin(true);
        setMessage('Admin created. Please sign in.');
        setMessageTone('success');
        return;
      }

      if (data.mfa_required) {
        setMfaRequired(true);
        setMfaChallengeId(data.challenge_id);
        setMessage('Enter the verification code sent to your email.');
        setMessageTone('info');
        return;
      }

      setAdminTokens({ accessToken: data.access_token, refreshToken: data.refresh_token });
      await redirectAfterLogin();
    } catch (error) {
      setMessageTone('danger');
      setMessage(error?.message || 'Something went wrong.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const title =
    authMode === 'loading'
      ? 'Sign in'
      : authMode === 'mfa'
        ? 'Verify code'
        : authMode === 'bootstrap'
          ? 'Create admin'
          : 'Sign in';

  const subtitle =
    authMode === 'loading'
      ? 'Checking access…'
      : authMode === 'mfa'
        ? 'Enter the verification code sent to your email.'
        : authMode === 'bootstrap'
          ? 'No admin found yet. Create the first admin account.'
          : 'Enter your credentials to continue.';

  return (
    <div className="admin-container admin-auth-container">
      <div className="admin-auth-layout">
        <section className="admin-auth-panel">
          <div className="admin-auth-panel-top">
            <div className="admin-auth-brand-block">
              <img className="admin-auth-logo" src="/images/logo.png" alt="GlucoForager" />
              <div>
                <p className="admin-auth-eyebrow">Private admin portal</p>
                <h1 className="admin-auth-title">GlucoForager Admin</h1>
                <p className="admin-auth-subtitle">Sign in to manage content, users, support, and platform operations.</p>
              </div>
            </div>

            <ul className="admin-auth-highlights">
              <li>
                <span className="admin-auth-highlight-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </span>
                <span>Manage users, subscriptions &amp; access</span>
              </li>
              <li>
                <span className="admin-auth-highlight-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </span>
                <span>Review &amp; publish recipes and blog content</span>
              </li>
              <li>
                <span className="admin-auth-highlight-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none"><path d="M3 12h4l3 8 4-16 3 8h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </span>
                <span>Monitor AI usage, queues &amp; system health</span>
              </li>
              <li>
                <span className="admin-auth-highlight-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </span>
                <span>Support tools: newsletters, requests &amp; logs</span>
              </li>
            </ul>
          </div>

          <p className="admin-auth-panel-footer">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2 4 5v6c0 5 3.4 8.7 8 11 4.6-2.3 8-6 8-11V5l-8-3Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Access is limited to authorised GlucoForager staff and is logged for security.
          </p>
        </section>

        <section className="admin-card admin-auth-form-card">
          <h2 className="admin-title" style={{ marginBottom: 6 }}>
            {title}
          </h2>
          <p className="admin-subtitle" style={{ marginTop: 0 }}>
            {subtitle}
          </p>

          {statusLoading ? (
            <div style={{ marginTop: 12 }}>
              <LoadingState label="Preparing sign-in…" />
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="admin-field">
                <label>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  inputMode="email"
                  placeholder="you@glucoforager.com"
                  required
                  disabled={mfaRequired}
                />
              </div>

              <div className="admin-field">
                <label>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required={!mfaRequired}
                  disabled={mfaRequired}
                />
              </div>

              {mfaRequired ? (
                <div className="admin-field">
                  <label>Verification code</label>
                  <input
                    value={mfaCode}
                    onChange={(event) => setMfaCode(event.target.value)}
                    placeholder="123456"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    required
                  />
                  <p className="admin-help">This code expires in ~10 minutes.</p>
                </div>
              ) : null}

              {message ? (
                <div className={`admin-alert admin-alert--dismissible ${messageTone || 'info'}`} style={{ marginTop: 12, marginBottom: 12 }}>
                  <div style={{ minWidth: 0 }}>{message}</div>
                  <button type="button" className="admin-alert-close" aria-label="Dismiss message" onClick={dismissMessage}>
                    <span aria-hidden="true">×</span>
                  </button>
                </div>
              ) : null}

              <div className="admin-actions" style={{ alignItems: 'center' }}>
                <button
                  className="admin-button"
                  type="submit"
                  disabled={isSubmitting || statusLoading || hasAdmin === null || (hasAdmin === false && !ENABLE_BOOTSTRAP)}
                >
                  {isSubmitting ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                      <span className="admin-spinner" aria-hidden="true" style={{ borderTopColor: 'rgba(255,255,255,0.95)', borderColor: 'rgba(255,255,255,0.35)' }} />
                      {mfaRequired ? 'Verifying…' : 'Signing in…'}
                    </span>
                  ) : mfaRequired ? (
                    'Verify'
                  ) : hasAdmin ? (
                    'Sign in'
                  ) : (
                    'Create admin'
                  )}
                </button>

                {hasAdmin && !mfaRequired ? (
                  <Link className="admin-link" href="/admin/forgot-password">
                    Forgot password?
                  </Link>
                ) : null}
              </div>

              {hasAdmin ? (
                <p className="admin-help" style={{ marginTop: 12 }}>
                  You’ll be redirected to your dashboard after sign-in.
                </p>
              ) : null}
            </form>
          )}

          {SHOW_DEMO_ADMIN_LOGIN && hasAdmin && !mfaRequired ? (
            <div className="admin-demo-login-card">
              <div>
                <p className="admin-demo-login-eyebrow">Demo account</p>
                <h3>Try the read-only dashboard</h3>
                <p>
                  Use seeded demo data to explore users, recipes, AI jobs, logs, newsletters, and engineering screens without changing live records.
                </p>
              </div>

              <div className="admin-demo-login-credentials" aria-label="Demo login credentials">
                <div>
                  <span>Email</span>
                  <strong>{DEMO_ADMIN_EMAIL}</strong>
                </div>
                <div>
                  <span>Password</span>
                  <strong>{DEMO_ADMIN_PASSWORD}</strong>
                </div>
              </div>

              <button className="admin-button secondary" type="button" onClick={useDemoCredentials} disabled={statusLoading || isSubmitting}>
                Use demo login
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
