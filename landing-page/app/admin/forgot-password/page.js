'use client';

import { useState } from 'react';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/staff/password-reset/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      await res.json().catch(() => ({}));
      setMessage('If that email exists, we sent a reset code. Check your inbox.');
    } catch {
      setMessage('Could not send reset code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-container">
      <div className="admin-card">
        <h1 className="admin-title">Reset password</h1>
        <p className="admin-subtitle">We’ll email you a one-time code.</p>

        <form onSubmit={submit}>
          <div className="admin-field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@glucoforager.com"
              required
            />
          </div>

          {message ? <p className="admin-subtitle">{message}</p> : null}

          <div className="admin-actions">
            <button className="admin-button" type="submit" disabled={loading}>
              {loading ? 'Sending…' : 'Send code'}
            </button>
            <Link className="admin-link" href="/admin/reset-password">
              I have a code
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

