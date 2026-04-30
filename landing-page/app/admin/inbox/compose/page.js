'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import RichTextEditor from '../../ui/RichTextEditor';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

function isValidStaffEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  return Boolean(e) && e.includes('@') && e.includes('.');
}

export default function ComposeMailPage() {
  const router = useRouter();
  const token = useMemo(() => (typeof window === 'undefined' ? null : localStorage.getItem('adminToken')), []);

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleAtLocal, setScheduleAtLocal] = useState('');
  const [attachment, setAttachment] = useState(null);
  const attachmentInputId = useMemo(() => `attach-${Math.random().toString(16).slice(2)}`, []);
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

  const isAdmin = useMemo(() => {
    const roles = Array.isArray(session?.roles) ? session.roles : [];
    const perms = Array.isArray(session?.permissions) ? session.permissions : [];
    return perms.includes('*') || perms.includes('admin.manage') || roles.includes('admin');
  }, [session]);

  const defaultScheduleLocal = () => {
    const dt = new Date(Date.now() + 30 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    const yyyy = dt.getFullYear();
    const mm = pad(dt.getMonth() + 1);
    const dd = pad(dt.getDate());
    const hh = pad(dt.getHours());
    const mi = pad(dt.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  };

  const send = async () => {
    if (!token) return;
    setMessage('');

    if (!isValidStaffEmail(to)) {
      setTone('danger');
      setMessage('Enter a valid recipient email.');
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
      const fd = new FormData();
      fd.set('to', to);
      fd.set('subject', subject);
      fd.set('body_html', bodyHtml);
      if (scheduleEnabled) {
        if (!isAdmin) {
          setTone('danger');
          setMessage('Only admins can schedule mail.');
          setSending(false);
          return;
        }
        if (!scheduleAtLocal) {
          setTone('danger');
          setMessage('Pick a schedule date/time.');
          setSending(false);
          return;
        }
        const sendAt = new Date(scheduleAtLocal);
        if (!Number.isFinite(sendAt.valueOf())) {
          setTone('danger');
          setMessage('Invalid schedule date/time.');
          setSending(false);
          return;
        }
        if (sendAt.valueOf() <= Date.now() + 60 * 1000) {
          setTone('danger');
          setMessage('Schedule time must be at least 1 minute in the future.');
          setSending(false);
          return;
        }
        fd.set('send_at', sendAt.toISOString());
      }
      if (attachment) fd.set('attachment', attachment);

      const res = await fetch(`${API_URL}/api/admin/inbox/messages/form`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error(data.detail || 'Failed to send.');
      setTone('info');
      if (data?.scheduled) {
        setMessage('Scheduled.');
      } else {
        setMessage('Sent.');
      }
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
              Staff-to-staff mail (recipient must be a registered staff email).
            </p>
          </div>
          <Link className="admin-button secondary" href="/admin/inbox?tab=mail">
            Back to Inbox
          </Link>
        </div>
      </div>

      <div className="admin-card admin-compose-card" style={{ marginTop: 16 }}>
        {loading ? <p className="admin-subtitle">Loading...</p> : null}
        {!loading && !session ? <div className="admin-alert danger">Not signed in.</div> : null}
        {message ? <div className={`admin-alert ${tone}`} style={{ marginTop: 12 }}>{message}</div> : null}

        {!loading && session ? (
          <div className="admin-compose-form">
            <div className="admin-compose-fields">
              <div className="admin-field" style={{ marginBottom: 0 }}>
                <label>To</label>
                <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="someone@example.com" />
                <p className="admin-help">
                  Recipient must match an existing staff email in the system.
                </p>
              </div>

              <div className="admin-field" style={{ marginBottom: 0 }}>
                <label>Subject</label>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
              </div>

              <div className="admin-compose-options">
                <div className="admin-field admin-compose-attachment" style={{ marginBottom: 0 }}>
                  <label>Attachment</label>
                  <div className="admin-compose-attachment-row">
                    <input
                      id={attachmentInputId}
                      type="file"
                      style={{ display: 'none' }}
                      onChange={(e) => setAttachment(e.target.files?.[0] || null)}
                      accept=".pdf,.jpg,.jpeg,.png,.webp,.mp4,.xls,.xlsx"
                    />
                    <label className="admin-button secondary" htmlFor={attachmentInputId} style={{ cursor: 'pointer' }}>
                      Add attachment
                    </label>
                    {attachment ? (
                      <div className="admin-compose-attachment-pill">
                        <span title={attachment.name}>{attachment.name}</span>
                        <button className="admin-button secondary" type="button" onClick={() => setAttachment(null)} style={{ padding: '6px 10px' }}>
                          Remove
                        </button>
                      </div>
                    ) : (
                      <span className="admin-help">Optional PDF, image, video, or Excel file.</span>
                    )}
                  </div>
                </div>

                {isAdmin ? (
                  <div className="admin-field admin-compose-schedule" style={{ marginBottom: 0 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        type="checkbox"
                        checked={scheduleEnabled}
                        onChange={(e) => {
                          const checked = Boolean(e.target.checked);
                          setScheduleEnabled(checked);
                          if (checked && !scheduleAtLocal) setScheduleAtLocal(defaultScheduleLocal());
                        }}
                      />
                      Schedule send
                    </label>
                    {scheduleEnabled ? (
                      <>
                        <input type="datetime-local" value={scheduleAtLocal} onChange={(e) => setScheduleAtLocal(e.target.value)} />
                        <p className="admin-help">
                          Mail will be delivered automatically at the chosen time (your local time).
                        </p>
                      </>
                    ) : (
                      <p className="admin-help">
                        Optional: schedule this mail to send later.
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="admin-compose-message">
              <div className="admin-field" style={{ marginBottom: 10 }}>
                <label>Message</label>
                <RichTextEditor value={bodyHtml} onChange={setBodyHtml} minHeight={420} />
              </div>

              <div
                className="admin-actions"
                style={{
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 10,
                  flexWrap: 'wrap',
                }}
              >
                <span className="admin-help">Rich text formatting is supported for staff mail.</span>

                <button className="admin-button info" type="button" onClick={send} disabled={sending}>
                  {sending ? (scheduleEnabled ? 'Scheduling...' : 'Sending...') : scheduleEnabled ? 'Schedule' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
