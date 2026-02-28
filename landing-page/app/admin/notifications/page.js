'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

export default function AdminNotificationsPage() {
  const router = useRouter();
  const token = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('adminToken');
  }, []);

  const [enabled, setEnabled] = useState(false);
  const [recipients, setRecipients] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const loadSettings = async () => {
    if (!token) {
      router.push('/admin');
      return;
    }
    setIsLoading(true);
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/admin/settings/signup-notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await response.json();
      setEnabled(Boolean(data.enabled));
      const list = Array.isArray(data.recipients) ? data.recipients : [];
      setRecipients(list.join(', '));
    } catch (error) {
      setMessage('Failed to load notification settings.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, [token]);

  const parseRecipients = () =>
    recipients
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

  const save = async () => {
    if (!token) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/admin/settings/signup-notifications`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, recipients: parseRecipients() }),
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await response.json();
      if (!response.ok) {
        setMessage(data?.detail || 'Failed to save notification settings.');
        return;
      }
      setEnabled(Boolean(data.enabled));
      const list = Array.isArray(data.recipients) ? data.recipients : [];
      setRecipients(list.join(', '));
      setMessage('Settings saved.');
    } catch (error) {
      setMessage('Failed to save notification settings.');
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    if (!token) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/admin/settings/signup-notifications/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await response.json();
      if (!response.ok) {
        setMessage(data?.detail || 'Failed to send test notification.');
        return;
      }
      setMessage(`Test email sent to: ${(data.recipients || []).join(', ')}`);
    } catch (error) {
      setMessage('Failed to send test notification.');
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="admin-card">
        <h2 className="admin-title">Notifications</h2>
        <p className="admin-loading">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="admin-card">
      <h2 className="admin-title">Notifications</h2>
      <p className="admin-subtitle">Configure admin email alerts for key events.</p>

      {message ? <p className="admin-subtitle">{message}</p> : null}

      <div className="admin-card" style={{ marginTop: 16 }}>
        <h3 className="admin-title">New user signups</h3>
        <p className="admin-subtitle">
          Send an email alert when a new user creates an account.
        </p>

        <label className="admin-inline-toggle" style={{ marginTop: 8 }}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            disabled={busy}
          />
          <span>Enable signup email alerts</span>
        </label>

        <div className="admin-field" style={{ marginTop: 12 }}>
          <label>Recipients (comma-separated)</label>
          <input
            type="text"
            placeholder="admin@glucoforager.com, support@glucoforager.com"
            value={recipients}
            onChange={(event) => setRecipients(event.target.value)}
            disabled={busy}
          />
        </div>

        <div className="admin-actions" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="admin-button" type="button" onClick={save} disabled={busy}>
            {busy ? 'Working…' : 'Save'}
          </button>
          <button className="admin-button secondary" type="button" onClick={sendTest} disabled={busy}>
            Send test email
          </button>
        </div>
      </div>
    </div>
  );
}

