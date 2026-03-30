'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import RichTextEditor from '../../ui/RichTextEditor';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

function isValidStaffEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  return Boolean(e) && e.includes('@') && e.endsWith('@glucoforager.com');
}

export default function ComposeMailPage() {
  const router = useRouter();
  const token = useMemo(() => (typeof window === 'undefined' ? null : localStorage.getItem('adminToken')), []);

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState('warning');

  useEffect(() => {
    const loadSession = async () => {
      if (!token) {
        router.push('/admin');
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/admin/me`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.status === 401) {
          localStorage.removeItem('adminToken');
          router.push('/admin');
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (res.ok) setSession(data);
      } finally {
        setLoading(false);
      }
    };
    loadSession();
  }, [token]);

  const send = async () => {
    if (!token) return;
    setMessage('');

    if (!isValidStaffEmail(to)) {
      setTone('danger');
      setMessage("Recipient must be a @glucoforager.com email.");
      return;
    }
    if (!String(subject || '').trim()) {
      setTone('danger');
      setMessage('Subject is required.');
      return;
    }
    const stripped = String(bodyHtml || '').replace(/<[^>]*>/g, '').trim();
    if (!stripped) {
      setTone('danger');
      setMessage('Message is required.');
      return;
    }

    setSending(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/inbox/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, body_html: bodyHtml }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error(data.detail || 'Failed to send.');
      setTone('info');
      setMessage('Sent.');
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('admin-inbox-updated'));
      router.push('/admin/inbox?tab=mail');
    } catch (e) {
      setTone('danger');
      setMessage(e?.message || 'Failed to send.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-card">
        <div className="admin-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 className="admin-title" style={{ marginBottom: 6 }}>
              Compose mail
            </h2>
            <p className="admin-subtitle" style={{ margin: 0 }}>
              Internal staff mail (only @glucoforager.com recipients).
            </p>
          </div>
          <Link className="admin-button secondary" href="/admin/inbox?tab=mail">
            Back to Inbox
          </Link>
        </div>
      </div>

      <div className="admin-card" style={{ marginTop: 16 }}>
        {loading ? <p className="admin-subtitle">Loading...</p> : null}
        {!loading && !session ? <div className="admin-alert danger">Not signed in.</div> : null}
        {message ? <div className={`admin-alert ${tone}`} style={{ marginTop: 12 }}>{message}</div> : null}

        {!loading && session ? (
          <div className="admin-grid" style={{ alignItems: 'start', marginTop: 12 }}>
            <div className="admin-card admin-card--subtle admin-card--compact">
              <div className="admin-field">
                <label>To</label>
                <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="someone@glucoforager.com" />
                <p className="admin-subtitle" style={{ marginTop: 6 }}>
                  Only @glucoforager.com is allowed.
                </p>
              </div>
              <div className="admin-field">
                <label>Subject</label>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
              </div>
            </div>

            <div className="admin-card admin-card--subtle admin-card--compact">
              <div className="admin-field">
                <label>Message</label>
                <RichTextEditor value={bodyHtml} onChange={setBodyHtml} />
              </div>
              <div className="admin-actions" style={{ justifyContent: 'flex-end' }}>
                <button className="admin-button info" type="button" onClick={send} disabled={sending}>
                  {sending ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
