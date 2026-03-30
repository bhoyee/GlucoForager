'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import RichTextEditor from '../ui/RichTextEditor';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

export default function InboxPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useMemo(() => (typeof window === 'undefined' ? null : localStorage.getItem('adminToken')), []);

  const formatDateTime = (value) => {
    if (!value) return '';
    try {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return String(value);
      return new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: 'numeric',
        minute: '2-digit',
      }).format(date);
    } catch {
      return String(value);
    }
  };

  const initialTab = (searchParams?.get('tab') || '').toLowerCase() === 'mail' ? 'mail' : 'notifications';
  const initialBox = (searchParams?.get('box') || '').toLowerCase() === 'sent' ? 'sent' : 'inbox';

  const [tab, setTab] = useState(initialTab);
  const [mailBox, setMailBox] = useState(initialBox);

  const [notifUnreadOnly, setNotifUnreadOnly] = useState(true);
  const [notifItems, setNotifItems] = useState([]);
  const [notifLoading, setNotifLoading] = useState(true);

  const [mailItems, setMailItems] = useState([]);
  const [mailLoading, setMailLoading] = useState(true);
  const [mailUnreadOnly, setMailUnreadOnly] = useState(true);
  const [mailViewAll, setMailViewAll] = useState(false);
  const [mailIncludeDeleted, setMailIncludeDeleted] = useState(false);

  const [mailThread, setMailThread] = useState(null);
  const [mailThreadLoading, setMailThreadLoading] = useState(false);
  const [replyHtml, setReplyHtml] = useState('');
  const [replySending, setReplySending] = useState(false);
  const [replyAttachment, setReplyAttachment] = useState(null);
  const [attachmentDownloadingId, setAttachmentDownloadingId] = useState(null);

  const [session, setSession] = useState(null);
  const [message, setMessage] = useState('');

  const permissions = Array.isArray(session?.permissions) ? session.permissions : [];
  const roles = Array.isArray(session?.roles) ? session.roles : [];
  const isAdmin = permissions.includes('*') || permissions.includes('admin.manage') || roles.includes('admin');

  const replaceInboxUrl = (next) => {
    const params = new URLSearchParams(searchParams?.toString() || '');

    const nextTab = String(next?.tab || '').toLowerCase();
    if (nextTab === 'mail') params.set('tab', 'mail');
    else params.set('tab', 'notifications');

    const nextBox = String(next?.box || '').toLowerCase();
    if (nextTab === 'mail') params.set('box', nextBox === 'sent' ? 'sent' : 'inbox');
    else params.delete('box');

    const nextMessage = next?.message;
    if (nextMessage) params.set('message', String(nextMessage));
    else params.delete('message');

    const qs = params.toString();
    router.replace(qs ? `/admin/inbox?${qs}` : '/admin/inbox');
  };

  const messageIdFromUrl = useMemo(() => {
    const raw = searchParams?.get('message');
    if (!raw) return null;
    const num = Number(raw);
    if (!num || Number.isNaN(num)) return null;
    return num;
  }, [searchParams]);

  useEffect(() => {
    const urlTab = (searchParams?.get('tab') || '').toLowerCase() === 'mail' ? 'mail' : 'notifications';
    const urlBox = (searchParams?.get('box') || '').toLowerCase() === 'sent' ? 'sent' : 'inbox';
    if (urlTab !== tab) setTab(urlTab);
    if (urlBox !== mailBox) setMailBox(urlBox);
  }, [searchParams, tab, mailBox]);

  const loadSession = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) return;
      const data = await res.json().catch(() => ({}));
      if (res.ok) setSession(data);
    } catch {
      setSession(null);
    }
  };

  useEffect(() => {
    loadSession();
  }, [token]);

  const loadNotifications = async () => {
    if (!token) {
      router.push('/admin');
      return;
    }
    setNotifLoading(true);
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/staff-notifications?unread_only=${notifUnreadOnly ? '1' : '0'}&limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load notifications.');
      setNotifItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setMessage(e?.message || 'Failed to load notifications.');
    } finally {
      setNotifLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, [token, notifUnreadOnly]);

  const loadMail = async () => {
    if (!token) {
      router.push('/admin');
      return;
    }
    setMailLoading(true);
    setMessage('');
    try {
      const params = new URLSearchParams();
      params.set('limit', '80');
      params.set('box', mailBox);
      if (mailBox === 'inbox') {
        if (mailUnreadOnly) params.set('unread_only', '1');
        if (mailIncludeDeleted) params.set('include_deleted', '1');
        if (mailViewAll && isAdmin) params.set('all', '1');
      }
      const res = await fetch(`${API_URL}/api/admin/inbox/messages?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load mail.');
      setMailItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setMessage(e?.message || 'Failed to load mail.');
    } finally {
      setMailLoading(false);
    }
  };

  useEffect(() => {
    if (tab !== 'mail') return;
    loadMail();
  }, [tab, token, mailUnreadOnly, mailIncludeDeleted, mailViewAll, isAdmin, mailBox]);

  const openMail = async (messageId) => {
    if (!token || !messageId) return;
    setMailThreadLoading(true);
    setMessage('');
    try {
      if (mailBox === 'inbox' && !mailViewAll) {
        fetch(`${API_URL}/api/admin/inbox/messages/${messageId}/read`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
      }

      const res = await fetch(`${API_URL}/api/admin/inbox/messages/${messageId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to open mail.');
      setMailThread(data);
      setReplyHtml('');
      loadMail();
      if (mailBox === 'inbox' && typeof window !== 'undefined') window.dispatchEvent(new Event('admin-inbox-updated'));
    } catch (e) {
      setMessage(e?.message || 'Failed to open mail.');
    } finally {
      setMailThreadLoading(false);
    }
  };

  useEffect(() => {
    if (tab !== 'mail') return;
    if (!messageIdFromUrl) return;
    openMail(messageIdFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, messageIdFromUrl]);

  const sendReply = async () => {
    if (!token || !mailThread?.messages?.length) return;
    const rootId = Number(mailThread.messages[0].id);
    const stripped = String(replyHtml || '').replace(/<[^>]*>/g, '').trim();
    if (!stripped) {
      setMessage('Reply cannot be empty.');
      return;
    }
    setReplySending(true);
    try {
      const fd = new FormData();
      fd.set('body_html', replyHtml);
      if (replyAttachment) fd.set('attachment', replyAttachment);

      const res = await fetch(`${API_URL}/api/admin/inbox/messages/${rootId}/reply/form`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error(data.detail || 'Failed to send reply.');
      setReplyHtml('');
      setReplyAttachment(null);
      await openMail(rootId);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('admin-inbox-updated'));
    } catch (e) {
      setMessage(e?.message || 'Failed to send reply.');
    } finally {
      setReplySending(false);
    }
  };

  const downloadAttachment = async (msg) => {
    const att = msg?.attachment;
    if (!token || !msg?.id || !att?.url) return;
    setAttachmentDownloadingId(msg.id);
    try {
      const res = await fetch(`${API_URL}/api/admin/inbox/messages/${encodeURIComponent(String(msg.id))}/attachment/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Download failed.');
      }
      const blob = await res.blob();
      const href = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = String(att.original_name || att.filename || 'attachment');
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(href);
    } catch (e) {
      setMessage(`Download failed: ${e?.message || 'unknown error'}`);
    } finally {
      setAttachmentDownloadingId(null);
    }
  };

  const softDeleteMail = async (id) => {
    if (!token) return;
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/inbox/messages/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to delete.');
      loadMail();
    } catch (e) {
      setMessage(e?.message || 'Failed to delete.');
    }
  };

  const purgeMail = async (id) => {
    if (!token) return;
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/inbox/messages/${id}/purge`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to delete.');
      loadMail();
    } catch (e) {
      setMessage(e?.message || 'Failed to delete.');
    }
  };

  const markRead = async (id) => {
    if (!token) return;
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/staff-notifications/${id}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to mark read.');
      loadNotifications();
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('admin-inbox-updated'));
    } catch (e) {
      setMessage(e?.message || 'Failed to mark read.');
    }
  };

  const markReadOptimistic = (id) => {
    if (!id) return;
    const nowIso = new Date().toISOString();
    setNotifItems((prev) => (Array.isArray(prev) ? prev.map((n) => (n?.id === id ? { ...n, read_at: n.read_at || nowIso } : n)) : prev));
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('admin-inbox-updated'));
  };

  const markAllRead = async () => {
    if (!token) return;
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/staff-notifications/read-all`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to mark all read.');
      loadNotifications();
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('admin-inbox-updated'));
    } catch (e) {
      setMessage(e?.message || 'Failed to mark all read.');
    }
  };

  const openFromNotification = (n) => {
    if (n?.id && !n?.read_at) {
      markReadOptimistic(n.id);
      // Best-effort server sync (do not block navigation).
      fetch(`${API_URL}/api/admin/staff-notifications/${encodeURIComponent(String(n.id))}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(() => loadNotifications())
        .catch(() => {});
    }

    let data = n?.data;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        data = {};
      }
    }
    if (!data || typeof data !== 'object') data = {};
    if (data?.message_id) {
      router.push(`/admin/inbox?tab=mail&box=inbox&message=${encodeURIComponent(String(data.message_id))}`);
      return;
    }
    if (data?.ticket_id) {
      router.push(`/admin/help?ticket=${encodeURIComponent(String(data.ticket_id))}`);
      return;
    }
    if (data?.work_log_id) {
      router.push(`/admin/work-logs?log=${encodeURIComponent(String(data.work_log_id))}`);
      return;
    }
    if (data?.work_date) {
      router.push(`/admin/work-logs?date=${encodeURIComponent(String(data.work_date))}`);
      return;
    }
    router.push('/admin/help');
  };

  return (
    <div className="admin-page">
      <div className="admin-card">
        <h2 className="admin-title">Inbox</h2>
        <p className="admin-subtitle">In-app notifications and internal staff mail.</p>
        {message && <p className="admin-subtitle">{message}</p>}

        <div className="admin-actions" style={{ gap: 10, flexWrap: 'wrap' }}>
          <button
            className={`admin-button ${tab === 'notifications' ? 'info' : 'secondary'}`}
            type="button"
            onClick={() => {
              setTab('notifications');
              replaceInboxUrl({ tab: 'notifications' });
            }}
          >
            Notifications
          </button>
          <button
            className={`admin-button ${tab === 'mail' ? 'info' : 'secondary'}`}
            type="button"
            onClick={() => {
              setTab('mail');
              setMailBox('inbox');
              replaceInboxUrl({ tab: 'mail', box: 'inbox' });
            }}
          >
            Mail
          </button>
          <Link className="admin-button warning" href="/admin/inbox/compose">
            Compose mail
          </Link>

          {tab === 'notifications' ? (
            <>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={notifUnreadOnly} onChange={(e) => setNotifUnreadOnly(e.target.checked)} /> Unread only
              </label>
              <button className="admin-button neutral" type="button" onClick={loadNotifications}>
                Refresh
              </button>
              <button className="admin-button" type="button" onClick={markAllRead}>
                Mark all read
              </button>
            </>
          ) : (
            <>
              <button
                className="admin-button"
                type="button"
                onClick={() => {
                  const next = mailBox === 'sent' ? 'inbox' : 'sent';
                  setMailBox(next);
                  replaceInboxUrl({ tab: 'mail', box: next });
                }}
              >
                {mailBox === 'sent' ? 'Back to Mail' : 'Sent'}
              </button>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={mailUnreadOnly} disabled={mailBox !== 'inbox'} onChange={(e) => setMailUnreadOnly(e.target.checked)} /> Unread only
              </label>
              {isAdmin ? (
                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="checkbox" checked={mailViewAll} disabled={mailBox !== 'inbox'} onChange={(e) => setMailViewAll(e.target.checked)} /> View all
                </label>
              ) : null}
              {isAdmin ? (
                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="checkbox" checked={mailIncludeDeleted} disabled={mailBox !== 'inbox'} onChange={(e) => setMailIncludeDeleted(e.target.checked)} /> Include deleted
                </label>
              ) : null}
              <button className="admin-button neutral" type="button" onClick={loadMail}>
                Refresh mail
              </button>
            </>
          )}
        </div>
      </div>

      <div className="admin-card" style={{ marginTop: 16 }}>
        {tab === 'notifications' ? (
          notifLoading ? (
            <p className="admin-subtitle">Loading...</p>
          ) : notifItems.length === 0 ? (
            <p className="admin-subtitle">No notifications.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {notifItems.map((n) => (
                <div key={n.id} className="admin-card" style={{ padding: 14, borderColor: n.read_at ? 'rgba(255,255,255,0.08)' : 'rgba(15,183,165,0.35)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start' }}>
                    <div>
                      <div style={{ fontWeight: 800 }}>{n.title}</div>
                      {n.body ? <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{n.body}</div> : null}
                      <div className="admin-subtitle" style={{ marginTop: 8 }}>
                        {n.type} • {formatDateTime(n.created_at)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <button className="admin-button secondary" type="button" onClick={() => openFromNotification(n)}>
                        Open
                      </button>
                      {!n.read_at ? (
                        <button className="admin-button" type="button" onClick={() => markRead(n.id)}>
                          Mark read
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : mailLoading ? (
          <p className="admin-subtitle">Loading...</p>
        ) : mailItems.length === 0 ? (
          <p className="admin-subtitle">No mail.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table" style={{ minWidth: 760 }}>
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>{mailBox === 'sent' ? 'To' : 'From'}</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {mailItems.map((m) => (
                  <tr key={m.id} style={{ opacity: m.is_deleted ? 0.6 : 1 }}>
                    <td style={{ fontWeight: m.read_at ? 500 : 800 }}>{m.subject}</td>
                    <td className="admin-subtitle">{mailBox === 'sent' ? m.to : m.from}</td>
                    <td className="admin-subtitle">{formatDateTime(m.created_at)}</td>
                    <td>{m.read_at ? <span className="admin-badge secondary">Read</span> : <span className="admin-badge warning">Unread</span>}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button className="admin-button secondary" type="button" onClick={() => openMail(m.id)}>
                          View
                        </button>
                        {mailBox === 'inbox' && !m.is_deleted ? (
                          <button className="admin-button danger" type="button" onClick={() => softDeleteMail(m.id)}>
                            Soft delete
                          </button>
                        ) : null}
                        {mailBox === 'inbox' && isAdmin ? (
                          <button className="admin-button danger" type="button" onClick={() => purgeMail(m.id)}>
                            Hard delete
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {tab === 'mail' && (mailThreadLoading || mailThread) ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => {
            setMailThread(null);
            replaceInboxUrl({ tab: 'mail', box: mailBox });
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 1000,
          }}
        >
          <div className="admin-card" onClick={(e) => e.stopPropagation()} style={{ width: 'min(980px, 98vw)', maxHeight: '92vh', overflow: 'auto', padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <div>
                <h3 style={{ marginTop: 0, marginBottom: 6 }}>{mailThread?.messages?.[0]?.subject || 'Mail'}</h3>
                <p className="admin-subtitle" style={{ margin: 0 }}>
                  Thread #{mailThread?.thread_id || ''}
                </p>
              </div>
              <button
                className="admin-button danger"
                type="button"
                onClick={() => {
                  setMailThread(null);
                  replaceInboxUrl({ tab: 'mail', box: mailBox });
                }}
              >
                Close
              </button>
            </div>

            {mailThreadLoading ? <p className="admin-subtitle" style={{ marginTop: 12 }}>Loading...</p> : null}

            {Array.isArray(mailThread?.messages) ? (
              <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                {mailThread.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className="admin-card admin-card--subtle admin-card--compact"
                    style={{
                      padding: 12,
                      borderColor: msg.is_mine ? 'rgba(25,118,210,0.35)' : 'rgba(46,125,50,0.28)',
                      background: msg.is_mine ? 'rgba(25,118,210,0.06)' : 'rgba(46,125,50,0.06)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <div className="admin-subtitle">
                        From <strong>{msg.from}</strong> to <strong>{msg.to}</strong>
                      </div>
                      <div className="admin-subtitle">{formatDateTime(msg.created_at)}</div>
                    </div>
                    <div style={{ marginTop: 10 }} dangerouslySetInnerHTML={{ __html: String(msg.body_html || '') }} />
                    {msg.attachment?.url ? (
                      <div className="admin-actions" style={{ marginTop: 10, justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
                        <div className="admin-subtitle" style={{ marginRight: 'auto' }}>
                          Attachment: {String(msg.attachment.original_name || msg.attachment.filename || '')}
                        </div>
                        <button className="admin-button info" type="button" onClick={() => downloadAttachment(msg)} disabled={attachmentDownloadingId === msg.id}>
                          {attachmentDownloadingId === msg.id ? 'Downloading...' : 'Download'}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="admin-card admin-card--subtle admin-card--compact" style={{ padding: 12, marginTop: 12 }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>Reply</div>
              <RichTextEditor value={replyHtml} onChange={setReplyHtml} minHeight={140} />
              <div className="admin-field" style={{ marginTop: 10 }}>
                <label>Attachment (optional)</label>
                <input type="file" onChange={(e) => setReplyAttachment(e.target.files?.[0] || null)} accept=".pdf,.jpg,.jpeg,.png,.webp,.mp4" />
              </div>
              <div className="admin-actions" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
                <button className="admin-button info" type="button" onClick={sendReply} disabled={replySending}>
                  {replySending ? 'Sending...' : 'Send reply'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
