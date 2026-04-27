'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminTinyEditor from '../../../components/AdminTinyEditor';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

const parseErrorResponse = async (response) => {
  try {
    const data = await response.json();
    const detail = data?.detail;
    if (typeof detail === 'string') return detail;
    return data?.message || 'Request failed.';
  } catch {
    return 'Request failed.';
  }
};

export default function AdminUserEmailPage() {
  const router = useRouter();
  const token = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('adminToken');
  }, []);

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [mode, setMode] = useState('test');
  const [testEmail, setTestEmail] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const send = async () => {
    if (!token) {
      router.push('/admin');
      return;
    }
    if (!subject.trim() || !body.trim()) {
      setMessage('Subject and message are required.');
      return;
    }
    if (mode === 'test' && !testEmail.trim()) {
      setMessage('Enter a test email.');
      return;
    }
    if (mode === 'single' && !recipientEmail.trim()) {
      setMessage('Enter a recipient email.');
      return;
    }
    if (mode === 'broadcast') {
      if (!confirm('Send this email to all app users?')) return;
    }

    setBusy(true);
    setMessage('');
    try {
      const payload = {
        subject: subject.trim(),
        body: body.trim(),
        body_html: true,
        mode,
        test_email: mode === 'test' ? testEmail.trim() : null,
        recipient_email: mode === 'single' ? recipientEmail.trim() : null,
      };
      const response = await fetch(`${API_URL}/api/admin/user-email/send`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) {
        setMessage(await parseErrorResponse(response));
        return;
      }
      const data = await response.json().catch(() => ({}));
      if (data?.queued) {
        const total = typeof data?.total === 'number' ? data.total : null;
        const suffix = typeof total === 'number' ? ` (total ${total})` : '';
        setMessage(`Broadcast queued${suffix}. Check history for progress.`);
        return;
      }
      const sent = data?.sent ?? 0;
      const total = data?.total;
      const suffix = typeof total === 'number' ? ` (total ${total})` : '';
      setMessage(`Sent (${data?.mode || mode}): ${sent}${suffix}`);
    } catch {
      setMessage('Failed to send.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-card">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="admin-title">User email</h2>
          <p className="admin-subtitle">Send an email to app users (test, single recipient, or broadcast).</p>
        </div>
        <a className="admin-link" href="/admin/user-email/history">
          View history
        </a>
      </div>

      <div className="admin-grid" style={{ alignItems: 'start' }}>
        <div>
          <div className="admin-field">
            <label>Subject</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
          </div>

          <div className="admin-field">
            <label>Message</label>
            <AdminTinyEditor
              height={420}
              value={body}
              onChange={(next) => setBody(next)}
              placeholder="Write your update..."
            />
          </div>
        </div>

        <div>
          <div className="admin-card">
            <h3 className="admin-title">Send options</h3>

            <div className="admin-field">
              <label>Mode</label>
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="test">Test</option>
                <option value="single">Single user</option>
                <option value="broadcast">Broadcast (all users)</option>
              </select>
            </div>

            {mode === 'test' ? (
              <div className="admin-field">
                <label>Test email</label>
                <input value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="you@example.com" />
              </div>
            ) : null}

            {mode === 'single' ? (
              <div className="admin-field">
                <label>Recipient email</label>
                <input
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="user@example.com"
                />
              </div>
            ) : null}

            {message ? <div className="admin-message">{message}</div> : null}

            <div className="admin-actions">
              <button type="button" className="admin-button" disabled={busy} onClick={send}>
                {busy ? 'Sending...' : 'Send'}
              </button>
            </div>

            <p className="admin-help">
              Note: broadcast is limited to the most recent 2,000 users and is rate-limited. Broadcast sends run in the
              background; check history for progress.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
