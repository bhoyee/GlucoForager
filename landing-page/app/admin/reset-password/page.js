'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clearAdminTokens } from '../lib/adminAuth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/staff/password-reset/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, new_password: password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Unable to reset password.');

      // Best UX: take them back to login.
      clearAdminTokens();
      setMessage('Password updated. You can now log in.');
      setTimeout(() => router.push('/admin'), 700);
    } catch (err) {
      setMessage(err.message || 'Unable to reset password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-container">
      <div className="admin-card">
        <h1 className="admin-title">Enter reset code</h1>
        <p className="admin-subtitle">Use the code from your email and choose a new password.</p>

        <form onSubmit={submit}>
          <div className="admin-field">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="admin-field">
            <label>Code</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="12345678" required />
          </div>
          <div className="admin-field">
            <label>New password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              required
            />
          </div>

          {message ? <p className="admin-subtitle">{message}</p> : null}

          <div className="admin-actions">
            <button className="admin-button" type="submit" disabled={loading}>
              {loading ? 'Updating…' : 'Update password'}
            </button>
            <Link className="admin-link" href="/admin/forgot-password">
              Resend code
            </Link>
            <Link className="admin-link" href="/admin">
              Back to login
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
