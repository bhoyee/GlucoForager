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
  const [updatesEnabled, setUpdatesEnabled] = useState(false);
  const [androidLatestVersion, setAndroidLatestVersion] = useState('');
  const [iosLatestVersion, setIosLatestVersion] = useState('');
  const [androidStoreUrl, setAndroidStoreUrl] = useState('');
  const [iosStoreUrl, setIosStoreUrl] = useState('');
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
      const headers = { Authorization: `Bearer ${token}` };
      const [signupRes, updatesRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/settings/signup-notifications`, { headers }),
        fetch(`${API_URL}/api/admin/settings/app-updates`, { headers }),
      ]);
      if (signupRes.status === 401 || updatesRes.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const signup = await signupRes.json().catch(() => ({}));
      setEnabled(Boolean(signup.enabled));
      const list = Array.isArray(signup.recipients) ? signup.recipients : [];
      setRecipients(list.join(', '));

      const updates = await updatesRes.json().catch(() => ({}));
      setUpdatesEnabled(Boolean(updates.enabled));
      setAndroidLatestVersion(updates.android_latest_version || '');
      setIosLatestVersion(updates.ios_latest_version || '');
      setAndroidStoreUrl(updates.android_store_url || '');
      setIosStoreUrl(updates.ios_store_url || '');
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
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const [signupRes, updatesRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/settings/signup-notifications`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ enabled, recipients: parseRecipients() }),
        }),
        fetch(`${API_URL}/api/admin/settings/app-updates`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            enabled: updatesEnabled,
            android_latest_version: androidLatestVersion.trim() || null,
            ios_latest_version: iosLatestVersion.trim() || null,
            android_store_url: androidStoreUrl.trim() || null,
            ios_store_url: iosStoreUrl.trim() || null,
          }),
        }),
      ]);
      if (signupRes.status === 401 || updatesRes.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const signup = await signupRes.json().catch(() => ({}));
      const updates = await updatesRes.json().catch(() => ({}));
      if (!signupRes.ok || !updatesRes.ok) {
        setMessage(signup?.detail || updates?.detail || 'Failed to save notification settings.');
        return;
      }
      setEnabled(Boolean(signup.enabled));
      const list = Array.isArray(signup.recipients) ? signup.recipients : [];
      setRecipients(list.join(', '));

      setUpdatesEnabled(Boolean(updates.enabled));
      setAndroidLatestVersion(updates.android_latest_version || '');
      setIosLatestVersion(updates.ios_latest_version || '');
      setAndroidStoreUrl(updates.android_store_url || '');
      setIosStoreUrl(updates.ios_store_url || '');
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
            {busy ? 'Working...' : 'Save'}
          </button>
          <button className="admin-button secondary" type="button" onClick={sendTest} disabled={busy}>
            Send test email
          </button>
        </div>
      </div>

      <div className="admin-card" style={{ marginTop: 16 }}>
        <h3 className="admin-title">App updates</h3>
        <p className="admin-subtitle">
          Show an in-app prompt when a newer version is available on the App Store / Play Store.
        </p>

        <label className="admin-inline-toggle" style={{ marginTop: 8 }}>
          <input
            type="checkbox"
            checked={updatesEnabled}
            onChange={(event) => setUpdatesEnabled(event.target.checked)}
            disabled={busy}
          />
          <span>Enable in-app update prompt</span>
        </label>

        <div className="admin-grid" style={{ marginTop: 12 }}>
          <div className="admin-field">
            <label>Android latest version (e.g. 1.0.2)</label>
            <input
              type="text"
              value={androidLatestVersion}
              onChange={(event) => setAndroidLatestVersion(event.target.value)}
              placeholder="1.0.2"
              disabled={busy}
            />
          </div>
          <div className="admin-field">
            <label>iOS latest version (e.g. 1.0.2)</label>
            <input
              type="text"
              value={iosLatestVersion}
              onChange={(event) => setIosLatestVersion(event.target.value)}
              placeholder="1.0.2"
              disabled={busy}
            />
          </div>
        </div>

        <div className="admin-grid">
          <div className="admin-field">
            <label>Android store URL (optional)</label>
            <input
              type="text"
              value={androidStoreUrl}
              onChange={(event) => setAndroidStoreUrl(event.target.value)}
              placeholder="https://play.google.com/store/apps/details?id=com.glucoforager.app"
              disabled={busy}
            />
          </div>
          <div className="admin-field">
            <label>iOS store URL (optional)</label>
            <input
              type="text"
              value={iosStoreUrl}
              onChange={(event) => setIosStoreUrl(event.target.value)}
              placeholder="https://apps.apple.com/us/app/glucoforager/id6758808427"
              disabled={busy}
            />
          </div>
        </div>

        <div className="admin-actions" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="admin-button" type="button" onClick={save} disabled={busy}>
            {busy ? 'Working...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
