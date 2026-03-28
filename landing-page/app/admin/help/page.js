'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

function formatRelativeMs(ms) {
  if (ms == null || Number.isNaN(ms)) return '';
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function parseIso(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export default function HelpPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useMemo(() => (typeof window === 'undefined' ? null : localStorage.getItem('adminToken')), []);

  const [session, setSession] = useState(null);
  const permissions = Array.isArray(session?.permissions) ? session.permissions : [];
  const ticketsManage = permissions.includes('*') || permissions.includes('tickets.manage');

  const [tickets, setTickets] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const [staffUsers, setStaffUsers] = useState([]);

  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterAssignedTo, setFilterAssignedTo] = useState('');
  const [filterMine, setFilterMine] = useState(false);
  const [filterQ, setFilterQ] = useState('');

  const [newSubject, setNewSubject] = useState('');
  const [newPriority, setNewPriority] = useState('normal');
  const [newMessage, setNewMessage] = useState('');
  const [reply, setReply] = useState('');

  const [notifications, setNotifications] = useState([]);

  const loadSession = async () => {
    if (!token) {
      router.push('/admin');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/admin/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.ok) setSession(data);
    } catch {
      setSession(null);
    }
  };

  const loadStaff = async () => {
    if (!token || !ticketsManage) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/staff/users`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error();
      setStaffUsers(Array.isArray(data.items) ? data.items : []);
    } catch {
      // ignore
    }
  };

  const loadNotifications = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/help/notifications?unread_only=1&limit=20`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) return;
      const data = await res.json().catch(() => ({}));
      if (res.ok) setNotifications(Array.isArray(data.items) ? data.items : []);
    } catch {
      // ignore
    }
  };

  const loadTickets = async () => {
    if (!token) {
      router.push('/admin');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status_filter', filterStatus);
      if (filterPriority) params.set('priority', filterPriority);
      if (filterAssignedTo) params.set('assigned_to', filterAssignedTo);
      if (filterMine) params.set('mine', '1');
      if (filterQ) params.set('q', filterQ);

      const res = await fetch(`${API_URL}/api/admin/help/tickets?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load tickets.');
      setTickets(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setMessage(e?.message || 'Failed to load tickets.');
    } finally {
      setLoading(false);
    }
  };

  const loadTicket = async (id) => {
    if (!token) return;
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/help/tickets/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load ticket.');
      setSelected(data.ticket || null);
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch (e) {
      setMessage(e?.message || 'Failed to load ticket.');
    }
  };

  useEffect(() => {
    loadSession();
  }, [token]);

  useEffect(() => {
    loadStaff();
  }, [token, ticketsManage]);

  useEffect(() => {
    loadTickets();
    loadNotifications();
  }, [token, filterStatus, filterPriority, filterAssignedTo, filterMine]);

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      setMessages([]);
      return;
    }
    loadTicket(selectedId);
  }, [selectedId]);

  useEffect(() => {
    const fromUrl = searchParams?.get('ticket');
    if (fromUrl) {
      const n = Number(fromUrl);
      if (!Number.isNaN(n) && n > 0) setSelectedId(n);
    }
  }, [searchParams]);

  const createTicket = async (event) => {
    event.preventDefault();
    if (!token) return;
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/help/tickets`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: newSubject, message: newMessage, priority: newPriority }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error(data.detail || 'Failed to create ticket.');
      setNewSubject('');
      setNewMessage('');
      setNewPriority('normal');
      await loadTickets();
      await loadNotifications();
    } catch (e) {
      setMessage(e?.message || 'Failed to create ticket.');
    }
  };

  const sendReply = async () => {
    if (!token || !selectedId) return;
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/help/tickets/${selectedId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: reply }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error(data.detail || 'Failed to send.');
      setReply('');
      loadTicket(selectedId);
      loadTickets();
      loadNotifications();
    } catch (e) {
      setMessage(e?.message || 'Failed to send.');
    }
  };

  const setTicketStatus = async (newStatus) => {
    if (!token || !selectedId) return;
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/help/tickets/${selectedId}/status`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to update status.');
      loadTicket(selectedId);
      loadTickets();
    } catch (e) {
      setMessage(e?.message || 'Failed to update status.');
    }
  };

  const setTicketPriority = async (newP) => {
    if (!token || !selectedId) return;
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/help/tickets/${selectedId}/priority`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: newP }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to update priority.');
      loadTicket(selectedId);
      loadTickets();
    } catch (e) {
      setMessage(e?.message || 'Failed to update priority.');
    }
  };

  const assignTicket = async (assigneeId) => {
    if (!token || !selectedId) return;
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/help/tickets/${selectedId}/assign`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_user_id: assigneeId ? Number(assigneeId) : null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to assign ticket.');
      loadTicket(selectedId);
      loadTickets();
      loadNotifications();
    } catch (e) {
      setMessage(e?.message || 'Failed to assign ticket.');
    }
  };

  const markNotificationRead = async (id) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/help/notifications/${id}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) loadNotifications();
    } catch {
      // ignore
    }
  };

  const staffMap = useMemo(() => {
    const m = new Map();
    staffUsers.forEach((u) => m.set(String(u.id), u.email));
    return m;
  }, [staffUsers]);

  return (
    <div className="admin-page">
      <div className="admin-card">
        <h2 className="admin-title">Help Tickets</h2>
        <p className="admin-subtitle">Assign tickets, track priority/status, and monitor SLA (HR/support/developer).</p>
        {message && <p className="admin-subtitle">{message}</p>}

        {notifications.length > 0 ? (
          <details style={{ marginTop: 10 }}>
            <summary>Notifications ({notifications.length})</summary>
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {notifications.map((n) => (
                <div key={n.id} className="admin-card" style={{ padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{n.title}</div>
                      {n.body ? <div className="admin-subtitle">{n.body}</div> : null}
                    </div>
                    <button className="admin-button secondary" type="button" onClick={() => markNotificationRead(n.id)}>
                      Mark read
                    </button>
                  </div>
                  <div className="admin-subtitle" style={{ marginTop: 6 }}>
                    {n.created_at}
                  </div>
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </div>

      <div className="admin-card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Filters</h3>
        <div className="admin-actions" style={{ gap: 10, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            Status
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">All</option>
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="waiting">Waiting</option>
              <option value="closed">Closed</option>
            </select>
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            Priority
            <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
              <option value="">All</option>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>
          {ticketsManage ? (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              Assigned to
              <select value={filterAssignedTo} onChange={(e) => setFilterAssignedTo(e.target.value)}>
                <option value="">Any</option>
                {staffUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.email}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={filterMine} onChange={(e) => setFilterMine(e.target.checked)} /> Mine
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            Search
            <input value={filterQ} onChange={(e) => setFilterQ(e.target.value)} placeholder="Subject..." />
          </label>
          <button className="admin-button secondary" type="button" onClick={loadTickets}>
            Refresh
          </button>
        </div>
      </div>

      <div className="admin-grid" style={{ marginTop: 16 }}>
        <div className="admin-card" style={{ padding: 16 }}>
          <h3>Tickets</h3>
          {loading ? (
            <p className="admin-subtitle">Loading...</p>
          ) : tickets.length === 0 ? (
            <p className="admin-subtitle">No tickets.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tickets.map((t) => {
                const createdAt = parseIso(t.created_at);
                const age = createdAt ? formatRelativeMs(Date.now() - createdAt.getTime()) : '';
                const sla = t.sla || null;
                const slaBad = Boolean(sla?.first_response_breached || sla?.resolve_breached);
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`admin-button secondary${selectedId === t.id ? ' active' : ''}`}
                    onClick={() => setSelectedId(t.id)}
                    style={{ textAlign: 'left', borderColor: slaBad ? 'rgba(255,99,71,0.65)' : undefined }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <div>
                        <strong>#{t.id}</strong> {t.subject}{' '}
                        <span style={{ opacity: 0.7 }}>
                          ({t.status}, {t.priority})
                        </span>
                      </div>
                      <div style={{ opacity: 0.7 }}>{age}</div>
                    </div>
                    {ticketsManage && t.assigned_to_staff_user_id ? (
                      <div className="admin-subtitle" style={{ marginTop: 4 }}>
                        Assigned: {staffMap.get(String(t.assigned_to_staff_user_id)) || `Staff #${t.assigned_to_staff_user_id}`}
                      </div>
                    ) : null}
                    {sla && ticketsManage ? (
                      <div className="admin-subtitle" style={{ marginTop: 4 }}>
                        SLA: first due {sla.first_response_due_at} {sla.first_response_breached ? ' (BREACHED)' : ''} • resolve due {sla.resolve_due_at}{' '}
                        {sla.resolve_breached ? ' (BREACHED)' : ''}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}

          <hr style={{ margin: '16px 0', opacity: 0.2 }} />

          <h3>Create Ticket</h3>
          <form onSubmit={createTicket}>
            <div className="admin-field">
              <label>Subject</label>
              <input value={newSubject} onChange={(e) => setNewSubject(e.target.value)} required />
            </div>
            <div className="admin-field">
              <label>Priority</label>
              <select value={newPriority} onChange={(e) => setNewPriority(e.target.value)}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div className="admin-field">
              <label>Message</label>
              <textarea value={newMessage} onChange={(e) => setNewMessage(e.target.value)} rows={4} required />
            </div>
            <button className="admin-button" type="submit">
              Create
            </button>
          </form>
        </div>

        <div className="admin-card" style={{ padding: 16 }}>
          <h3>Ticket Detail</h3>
          {!selected ? (
            <p className="admin-subtitle">Select a ticket.</p>
          ) : (
            <>
              <p className="admin-subtitle">
                <strong>#{selected.id}</strong> {selected.subject}
              </p>
              <div className="admin-actions" style={{ gap: 10, flexWrap: 'wrap' }}>
                <span className="admin-subtitle">Status: {selected.status}</span>
                <span className="admin-subtitle">Priority: {selected.priority}</span>
                {selected.assigned_to_staff_user_id ? (
                  <span className="admin-subtitle">
                    Assigned: {staffMap.get(String(selected.assigned_to_staff_user_id)) || `Staff #${selected.assigned_to_staff_user_id}`}
                  </span>
                ) : (
                  <span className="admin-subtitle">Assigned: —</span>
                )}
              </div>

              {ticketsManage ? (
                <div className="admin-actions" style={{ gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    Assign
                    <select
                      value={selected.assigned_to_staff_user_id ? String(selected.assigned_to_staff_user_id) : ''}
                      onChange={(e) => assignTicket(e.target.value)}
                    >
                      <option value="">Unassigned</option>
                      {staffUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.email}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    Priority
                    <select value={selected.priority} onChange={(e) => setTicketPriority(e.target.value)}>
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </label>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    Status
                    <select value={selected.status} onChange={(e) => setTicketStatus(e.target.value)}>
                      <option value="open">Open</option>
                      <option value="in_progress">In progress</option>
                      <option value="waiting">Waiting</option>
                      <option value="closed">Closed</option>
                    </select>
                  </label>
                </div>
              ) : null}

              {selected.sla && ticketsManage ? (
                <div className="admin-card" style={{ padding: 12, marginTop: 12, borderColor: selected.sla.first_response_breached || selected.sla.resolve_breached ? 'rgba(255,99,71,0.65)' : undefined }}>
                  <p className="admin-subtitle" style={{ margin: 0 }}>
                    SLA: first due {selected.sla.first_response_due_at} {selected.sla.first_response_breached ? ' (BREACHED)' : ''} • resolve due{' '}
                    {selected.sla.resolve_due_at} {selected.sla.resolve_breached ? ' (BREACHED)' : ''}
                  </p>
                </div>
              ) : null}

              <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12, maxHeight: 420, overflow: 'auto', marginTop: 12 }}>
                {messages.length === 0 ? (
                  <p className="admin-subtitle">No messages yet.</p>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        Staff #{m.author_staff_user_id} · {m.created_at}
                      </div>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{m.message}</div>
                    </div>
                  ))
                )}
              </div>

              <div style={{ marginTop: 12 }}>
                <div className="admin-field">
                  <label>Reply</label>
                  <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} placeholder="Type a message..." />
                </div>
                <div className="admin-actions">
                  <button className="admin-button" type="button" onClick={sendReply} disabled={!reply.trim()}>
                    Send
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
