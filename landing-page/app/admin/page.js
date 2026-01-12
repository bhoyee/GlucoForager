'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasAdmin, setHasAdmin] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await fetch(`${API_URL}/api/admin/status`);
        const data = await response.json();
        setHasAdmin(Boolean(data.has_admin));
      } catch (error) {
        setHasAdmin(false);
      }
    };
    checkStatus();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage('');

    try {
      const endpoint = hasAdmin ? '/api/admin/login' : '/api/admin/bootstrap';
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Unable to continue.');
      }

      if (!hasAdmin) {
        setHasAdmin(true);
        setMessage('Admin created. Please log in.');
        return;
      }

      localStorage.setItem('adminToken', data.access_token);
      router.push('/admin/dashboard');
    } catch (error) {
      setMessage(error.message || 'Something went wrong.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="admin-container">
      <div className="admin-card">
        <h1 className="admin-title">GlucoForager Admin</h1>
        <p className="admin-subtitle">
          {hasAdmin ? 'Log in to manage recipes.' : 'Create the first admin account.'}
        </p>

        <form onSubmit={handleSubmit}>
          <div className="admin-field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@glucoforager.com"
              required
            />
          </div>
          <div className="admin-field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {message && <p className="admin-subtitle">{message}</p>}

          <div className="admin-actions">
            <button className="admin-button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Please wait...' : hasAdmin ? 'Log in' : 'Create admin'}
            </button>
            {hasAdmin && (
              <Link className="admin-link" href="/admin/dashboard">
                Go to dashboard
              </Link>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
