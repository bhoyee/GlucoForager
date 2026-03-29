'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

export default function InboxPage() {
  const router = useRouter();
  const token = useMemo(() => (typeof window === 'undefined' ? null : localStorage.getItem('adminToken')), []);

  const [unreadOnly, setUnreadOnly] = useState(true);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const load = async () => {
    if (!token) {
      router.push('/admin');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/staff-notifications?unread_only=${unreadOnly ? '1' : '0'}&limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load notifications.');
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setMessage(e?.message || 'Failed to load notifications.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [token, unreadOnly]);

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
      load();
    } catch (e) {
      setMessage(e?.message || 'Failed to mark read.');
    }
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
      load();
    } catch (e) {
      setMessage(e?.message || 'Failed to mark all read.');
    }
  };

  const openFromNotification = (n) => {
    const data = n?.data || {};
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
        <p className="admin-subtitle">In-app notifications for tickets, work log feedback, and reminders.</p>
        {message && <p className="admin-subtitle">{message}</p>}

        <div className="admin-actions" style={{ gap: 10, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} /> Unread only
          </label>
          <button className="admin-button info" type="button" onClick={load}>
            Refresh
          </button>
          <button className="admin-button" type="button" onClick={markAllRead}>
            Mark all read
          </button>
        </div>
      </div>

      <div className="admin-card" style={{ marginTop: 16 }}>
        {loading ? (
          <p className="admin-subtitle">Loading...</p>
        ) : items.length === 0 ? (
          <p className="admin-subtitle">No notifications.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map((n) => (
              <div key={n.id} className="admin-card" style={{ padding: 14, borderColor: n.read_at ? 'rgba(255,255,255,0.08)' : 'rgba(15,183,165,0.35)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start' }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>{n.title}</div>
                    {n.body ? <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{n.body}</div> : null}
                    <div className="admin-subtitle" style={{ marginTop: 8 }}>
                      {n.type} • {n.created_at}
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
        )}
      </div>
    </div>
  );
}
