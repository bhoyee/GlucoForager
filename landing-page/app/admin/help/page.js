'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

export default function HelpPage() {
  const router = useRouter();
  const token = useMemo(() => (typeof window === 'undefined' ? null : localStorage.getItem('adminToken')), []);

  const [tickets, setTickets] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const [newSubject, setNewSubject] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [reply, setReply] = useState('');

  const loadTickets = async () => {
    if (!token) {
      router.push('/admin');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/help/tickets`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTickets(Array.isArray(data.items) ? data.items : []);
    } catch {
      setMessage('Failed to load tickets.');
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
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSelected(data.ticket || null);
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch {
      setMessage('Failed to load ticket.');
    }
  };

  useEffect(() => {
    loadTickets();
  }, [token]);

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      setMessages([]);
      return;
    }
    loadTicket(selectedId);
  }, [selectedId]);

  const createTicket = async (event) => {
    event.preventDefault();
    if (!token) return;
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/help/tickets`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: newSubject, message: newMessage }),
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
      await loadTickets();
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
    } catch (e) {
      setMessage(e?.message || 'Failed to send.');
    }
  };

  const closeTicket = async () => {
    if (!token || !selectedId) return;
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/help/tickets/${selectedId}/close`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error();
      loadTicket(selectedId);
      loadTickets();
    } catch {
      setMessage('Failed to close ticket.');
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-card">
        <h2 className="admin-title">Help Tickets</h2>
        <p className="admin-subtitle">Internal support tickets for staff collaboration.</p>
        {message && <p className="admin-subtitle">{message}</p>}
      </div>

      <div className="admin-grid" style={{ marginTop: 16 }}>
        <div className="admin-card" style={{ padding: 16 }}>
          <h3>Tickets</h3>
          {loading ? (
            <p className="admin-subtitle">Loading...</p>
          ) : tickets.length === 0 ? (
            <p className="admin-subtitle">No tickets yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tickets.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`admin-button secondary${selectedId === t.id ? ' active' : ''}`}
                  onClick={() => setSelectedId(t.id)}
                  style={{ textAlign: 'left' }}
                >
                  <strong>#{t.id}</strong> {t.subject}{' '}
                  <span style={{ opacity: 0.7 }}>({t.status})</span>
                </button>
              ))}
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
            <p className="admin-subtitle">Select a ticket to view messages.</p>
          ) : (
            <>
              <p className="admin-subtitle">
                <strong>#{selected.id}</strong> {selected.subject} — {selected.status}
              </p>
              <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12, maxHeight: 420, overflow: 'auto' }}>
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
                  <button className="admin-button secondary" type="button" onClick={closeTicket} disabled={selected.status !== 'open'}>
                    Close ticket
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

