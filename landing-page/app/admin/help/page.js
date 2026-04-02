'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import EmptyState from '../ui/EmptyState';
import LoadingState from '../ui/LoadingState';

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
  // Backend stores timestamps as naive UTC (no timezone suffix). Treat "no tz" strings as UTC to avoid 1h offsets.
  let normalized = String(iso);
  if (normalized.includes(' ') && !normalized.includes('T')) normalized = normalized.replace(' ', 'T');
  const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized);
  if (!hasTz && /^\d{4}-\d{2}-\d{2}T/.test(normalized)) normalized = `${normalized}Z`;

  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function formatDateTime(iso) {
  const d = parseIso(iso);
  if (!d) return String(iso || '');
  try {
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(iso || '');
  }
}

function roleKeyToLabel(key) {
  const k = String(key || '').trim().toLowerCase();
  if (!k) return '';
  if (k === 'hr') return 'HR';
  if (k === 'admin') return 'Admin';
  return k.charAt(0).toUpperCase() + k.slice(1);
}

function firstNameFromFullName(fullName) {
  const s = String(fullName || '').trim();
  if (!s) return '';
  const parts = s.split(/\s+/).filter(Boolean);
  return parts[0] || '';
}

function nameFromEmail(email) {
  const e = String(email || '').trim();
  if (!e || !e.includes('@')) return e;
  const local = e.split('@')[0];
  if (!local) return e;
  const cleaned = local.replace(/[._-]+/g, ' ').trim();
  const first = cleaned.split(/\s+/)[0];
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : e;
}

function authorLabel(author, fallbackId) {
  const roles = Array.isArray(author?.roles) ? author.roles.filter(Boolean) : [];
  const roleLabel = roleKeyToLabel(roles[0] || 'staff') || 'Staff';
  const name = firstNameFromFullName(author?.full_name) || nameFromEmail(author?.email) || `Staff #${fallbackId}`;
  return `${name} (${roleLabel})`;
}

function bubblePalette() {
  return [
    { bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.28)' }, // blue
    { bg: 'rgba(34, 197, 94, 0.12)', border: 'rgba(34, 197, 94, 0.28)' }, // green
    { bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.28)' }, // amber
    { bg: 'rgba(168, 85, 247, 0.12)', border: 'rgba(168, 85, 247, 0.28)' }, // purple
    { bg: 'rgba(236, 72, 153, 0.12)', border: 'rgba(236, 72, 153, 0.28)' }, // pink
    { bg: 'rgba(14, 165, 233, 0.12)', border: 'rgba(14, 165, 233, 0.28)' }, // sky
  ];
}

function bubbleColorsForAuthorId(authorId) {
  const palette = bubblePalette();
  const id = Number(authorId || 0);
  const idx = Number.isFinite(id) ? Math.abs(id) % palette.length : 0;
  return palette[idx] || palette[0];
}

function HelpPageInner() {
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
  const [replyLoading, setReplyLoading] = useState(false);

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
    } catch (e) {
      setMessage(e?.message || 'Failed to create ticket.');
    }
  };

  const selectedClosed = String(selected?.status || '').toLowerCase() === 'closed';

  const statusBadge = (status) => {
    const s = String(status || '').toLowerCase();
    if (s === 'closed') return { label: 'Closed', tone: 'danger' };
    if (s === 'in_progress') return { label: 'In progress', tone: 'warning' };
    if (s === 'waiting') return { label: 'Waiting', tone: 'secondary' };
    return { label: s ? s.replace(/_/g, ' ') : 'Open', tone: 'success' };
  };

  const priorityBadge = (priority) => {
    const p = String(priority || '').toLowerCase();
    if (p === 'urgent') return { label: 'Urgent', tone: 'danger' };
    if (p === 'high') return { label: 'High', tone: 'danger' };
    if (p === 'low') return { label: 'Low', tone: 'secondary' };
    return { label: p ? p[0].toUpperCase() + p.slice(1) : 'Normal', tone: 'warning' };
  };

  const sendReply = async () => {
    if (!token || !selectedId) return;
    if (selectedClosed) {
      setMessage('Ticket is closed.');
      return;
    }
    setMessage('');
    setReplyLoading(true);
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
    } catch (e) {
      setMessage(e?.message || 'Failed to send.');
    } finally {
      setReplyLoading(false);
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
    } catch (e) {
      setMessage(e?.message || 'Failed to assign ticket.');
    }
  };

  const staffMap = useMemo(() => {
    const m = new Map();
    staffUsers.forEach((u) => {
      const roles = Array.isArray(u?.roles) ? u.roles.filter(Boolean) : [];
      const roleLabel = roleKeyToLabel(roles[0] || 'staff') || 'Staff';
      const label = `${firstNameFromFullName(u?.full_name) || nameFromEmail(u?.email) || u?.email} (${roleLabel})`;
      m.set(String(u.id), label);
    });
    return m;
  }, [staffUsers]);

  const formatStaffOption = (u) => {
    const roles = Array.isArray(u?.roles) ? u.roles.filter(Boolean) : [];
    const roleLabel = roles.length ? roles.join(', ') : 'staff';
    return `(${roleLabel}) ${u.email}`;
  };

  return (
    <div className="admin-page">
      <div className="admin-card">
        <h2 className="admin-title">Help Tickets</h2>
        {message && <p className="admin-subtitle">{message}</p>}
      </div>

      <div className="admin-card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Filters</h3>
        <div className="admin-toolbar-grid" style={{ marginTop: 12 }}>
          <div className="admin-toolbar-search">
            <input
              className="admin-search-input"
              value={filterQ}
              onChange={(e) => setFilterQ(e.target.value)}
              placeholder="Search by subject..."
            />
          </div>

          <div className="admin-toolbar-filters">
            <select className="admin-filter-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">All status</option>
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="waiting">Waiting</option>
              <option value="closed">Closed</option>
            </select>
            <select className="admin-filter-select" value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
              <option value="">All priority</option>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            {ticketsManage ? (
              <select className="admin-filter-select" value={filterAssignedTo} onChange={(e) => setFilterAssignedTo(e.target.value)}>
                <option value="">Any assignee</option>
                {staffUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {formatStaffOption(u)}
                  </option>
                ))}
              </select>
            ) : null}
          </div>

          <div className="admin-toolbar-actions" style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={filterMine} onChange={(e) => setFilterMine(e.target.checked)} /> Mine
            </label>
            <button className="admin-button info" type="button" onClick={loadTickets}>
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="admin-grid" style={{ marginTop: 16 }}>
        <div className="admin-card admin-card--subtle admin-card--compact">
          <h3>Tickets</h3>
          <div
            style={{
              marginTop: 10,
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12,
              padding: 10,
              maxHeight: 'clamp(260px, 46vh, 560px)',
              overflowY: 'auto',
              overscrollBehavior: 'contain',
            }}
          >
          {loading ? (
            <LoadingState label="Loading tickets…" />
          ) : tickets.length === 0 ? (
            <EmptyState title="No tickets yet" body="Create a ticket or wait for an assignment." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tickets.map((t) => {
                const createdAt = parseIso(t.created_at);
                const age = createdAt ? formatRelativeMs(Date.now() - createdAt.getTime()) : '';
                const sla = t.sla || null;
                const slaBad = Boolean(sla?.first_response_breached || sla?.resolve_breached);
                const st = statusBadge(t.status);
                const pr = priorityBadge(t.priority);
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
                        <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', marginLeft: 8, verticalAlign: 'middle' }}>
                          <span className={`admin-badge ${st.tone}`} style={{ fontWeight: 900 }}>
                            {st.label}
                          </span>
                          <span className={`admin-badge ${pr.tone}`} style={{ fontWeight: 900 }}>
                            {pr.label}
                          </span>
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
                        SLA: first due {formatDateTime(sla.first_response_due_at)} {sla.first_response_breached ? ' (BREACHED)' : ''} • resolve due{' '}
                        {formatDateTime(sla.resolve_due_at)}{' '}
                        {sla.resolve_breached ? ' (BREACHED)' : ''}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
          </div>

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
                <span className="admin-subtitle" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                  Status
                  <span className={`admin-badge ${statusBadge(selected.status).tone}`} style={{ fontWeight: 900 }}>
                    {statusBadge(selected.status).label}
                  </span>
                </span>
                <span className="admin-subtitle" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                  Priority
                  <span className={`admin-badge ${priorityBadge(selected.priority).tone}`} style={{ fontWeight: 900 }}>
                    {priorityBadge(selected.priority).label}
                  </span>
                </span>
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
                      className="admin-filter-select"
                      value={selected.assigned_to_staff_user_id ? String(selected.assigned_to_staff_user_id) : ''}
                      onChange={(e) => assignTicket(e.target.value)}
                    >
                      <option value="">Unassigned</option>
                      {staffUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {formatStaffOption(u)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    Priority
                    <select className="admin-filter-select" value={selected.priority} onChange={(e) => setTicketPriority(e.target.value)}>
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </label>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    Status
                    <select className="admin-filter-select" value={selected.status} onChange={(e) => setTicketStatus(e.target.value)}>
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
                    SLA: first due {formatDateTime(selected.sla.first_response_due_at)} {selected.sla.first_response_breached ? ' (BREACHED)' : ''} • resolve due{' '}
                    {formatDateTime(selected.sla.resolve_due_at)} {selected.sla.resolve_breached ? ' (BREACHED)' : ''}
                  </p>
                </div>
              ) : null}

              <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12, maxHeight: 420, overflow: 'auto', marginTop: 12 }}>
                {messages.length === 0 ? (
                  <p className="admin-subtitle">No messages yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {messages.map((m) => {
                      const authorId = m?.author_staff_user_id;
                      const isMe = Number(authorId) === Number(session?.id);
                      const colors = bubbleColorsForAuthorId(authorId);
                      const label = authorLabel(m?.author, authorId);
                      return (
                        <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                          <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 4 }}>
                            {label} · {formatDateTime(m.created_at)}
                          </div>
                          <div
                            style={{
                              maxWidth: '86%',
                              borderRadius: 14,
                              padding: '10px 12px',
                              background: colors.bg,
                              border: `1px solid ${colors.border}`,
                              boxShadow: '0 10px 30px rgba(0,0,0,0.22)',
                              whiteSpace: 'pre-wrap',
                              lineHeight: 1.35,
                            }}
                          >
                            {m.message}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={{ marginTop: 12 }}>
                <div className="admin-field">
                  <label>Reply</label>
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    rows={3}
                    placeholder={selectedClosed ? 'This ticket is closed.' : 'Type a message...'}
                    disabled={selectedClosed}
                  />
                </div>
                <div className="admin-actions">
                  <button
                    className={`admin-button ${selectedClosed ? 'danger' : ''}`.trim()}
                    type="button"
                    onClick={sendReply}
                    disabled={selectedClosed || replyLoading || !reply.trim()}
                  >
                    {selectedClosed ? 'Closed' : replyLoading ? 'Sending…' : 'Send'}
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

export default function HelpPage() {
  return (
    <Suspense
      fallback={
        <div className="admin-card">
          <LoadingState label="Loading…" />
        </div>
      }
    >
      <HelpPageInner />
    </Suspense>
  );
}
