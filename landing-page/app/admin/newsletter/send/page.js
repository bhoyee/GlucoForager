'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AdminTinyEditor from '../../../../components/AdminTinyEditor';

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

export default function AdminNewsletterSendPage() {
  const router = useRouter();
  const token = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('adminToken');
  }, []);

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const send = async (mode) => {
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

    setBusy(true);
    setMessage('');
    try {
      const payload = {
        subject: subject.trim(),
        body: body.trim(),
        body_html: true,
        test_email: mode === 'test' ? testEmail.trim() : null,
      };
      const response = await fetch(`${API_URL}/api/admin/newsletter/send`, {
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
      setMessage(`Sent (${data?.mode || mode}): ${data?.sent ?? 0}`);
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
          <h2 className="admin-title">Send newsletter</h2>
          <p className="admin-subtitle">Send an email update to subscribers.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Link className="admin-link" href="/admin/newsletter">
            Back to subscribers
          </Link>
          <Link className="admin-link" href="/admin/newsletter/history">
            View history
          </Link>
        </div>
      </div>

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

      <div className="admin-field">
        <label>Test email (optional)</label>
        <input value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="you@example.com" />
        <p className="admin-help">Send a test first to confirm formatting.</p>
      </div>

      {message ? <div className="admin-message">{message}</div> : null}

      <div className="admin-actions">
        <button type="button" className="admin-button secondary" disabled={busy} onClick={() => send('test')}>
          {busy ? 'Please wait…' : 'Send test'}
        </button>
        <button
          type="button"
          className="admin-button"
          disabled={busy}
          onClick={() => {
            if (!confirm('Send this message to all subscribed users?')) return;
            send('broadcast');
          }}
        >
          {busy ? 'Sending…' : 'Send to all'}
        </button>
      </div>
      <p className="admin-help">
        Note: email sending requires your email provider credentials (Resend or SMTP) configured on the backend.
      </p>
    </div>
  );
}
