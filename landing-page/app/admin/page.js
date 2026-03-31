'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import LoadingState from './ui/LoadingState';
import { adminFetch, clearAdminTokens, setAdminTokens } from './lib/adminAuth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';
const ENABLE_BOOTSTRAP = process.env.NEXT_PUBLIC_ENABLE_ADMIN_BOOTSTRAP === 'true';

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
        const response = await fetch(`${API_URL}/api/admin/status`);
        const data = await response.json();
        setHasAdmin(Boolean(data.has_admin));
      } catch {
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
        router.push(isAdmin ? '/admin/admin-dashboard' : '/admin/dashboard');
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

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (statusLoading) return;

    setIsSubmitting(true);
    setMessage('');
    setMessageTone('info');

    try {
      if (hasAdmin === null) {
        setMessageTone('warning');
        throw new Error('Checking admin status. Please wait…');
      }

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
          <div>
            <div className="admin-auth-brand">
              <div className="admin-auth-mark">GF</div>
              <div style={{ minWidth: 0 }}>
                <h1 className="admin-auth-title">GlucoForager Portal</h1>
                <p className="admin-auth-subtitle">Staff & admin workspace for operations, content, and support.</p>
              </div>
            </div>

            <div className="admin-auth-kpis">
              <div className="admin-auth-kpi">
                <div className="admin-auth-kpi-label">Access</div>
                <div className="admin-auth-kpi-value">Role-based permissions</div>
              </div>
              <div className="admin-auth-kpi">
                <div className="admin-auth-kpi-label">Security</div>
                <div className="admin-auth-kpi-value">MFA + expiring sessions</div>
              </div>
              <div className="admin-auth-kpi">
                <div className="admin-auth-kpi-label">HR</div>
                <div className="admin-auth-kpi-value">Attendance & payroll</div>
              </div>
              <div className="admin-auth-kpi">
                <div className="admin-auth-kpi-label">Content</div>
                <div className="admin-auth-kpi-value">Blog + newsletter</div>
              </div>
            </div>
          </div>

          <div className="admin-auth-footer">
            Tip: Use your staff email. If you don’t have access, contact an admin to create a staff account.
          </div>
        </section>

        <section className="admin-card" style={{ padding: 22 }}>
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
                  required={!mfaRequired}
                  disabled={mfaRequired}
                />
              </div>

              {mfaRequired ? (
                <div className="admin-field">
                  <label>Verification code</label>
                  <input value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} placeholder="123456" required />
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
                <button className="admin-button" type="submit" disabled={isSubmitting || statusLoading || (hasAdmin === false && !ENABLE_BOOTSTRAP)}>
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
        </section>
      </div>
    </div>
  );
}
