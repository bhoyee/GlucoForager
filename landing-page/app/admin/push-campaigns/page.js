'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

const parseJsonSafe = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

  const emptyForm = {
    title: '',
    body: '',
    deeplink: '',
    audience: 'all',
    status: 'draft',
  };

export default function AdminPushCampaignsPage() {
  const router = useRouter();
  const token = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('adminToken');
  }, []);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const [provider, setProvider] = useState('expo');
  const [activeTokens, setActiveTokens] = useState(0);
  const [recentTokens, setRecentTokens] = useState([]);
  const [items, setItems] = useState([]);

  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [detail, setDetail] = useState(null);

  const loadList = async () => {
    if (!token) {
      router.push('/admin');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/push-campaigns`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data?.detail || 'Failed to load push campaigns.');
        return;
      }
      setProvider(data?.provider || 'expo');
      setActiveTokens(Number(data?.active_tokens) || 0);
      setRecentTokens(Array.isArray(data?.recent_tokens) ? data.recent_tokens : []);
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setMessage('Failed to load push campaigns.');
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (campaignId) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/push-campaigns/${campaignId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data?.detail || 'Failed to load campaign.');
        return;
      }
      setDetail(data);
    } catch {
      setMessage('Failed to load campaign.');
    }
  };

  useEffect(() => {
    void loadList();
  }, [token]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDetail(null);
    setShowEditor(true);
  };

  const IconButton = ({ title, danger, onClick, disabled, children }) => (
    <button
      type="button"
      className={`admin-icon-button${danger ? ' danger' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      style={{ width: 40, height: 40 }}
    >
      {children}
    </button>
  );

  const openEdit = async (item) => {
    const id = item?.id;
    if (!id) return;
    setEditingId(id);
    setForm({
      title: item?.title || '',
      body: item?.body || '',
      deeplink: item?.deeplink || '',
      audience: item?.audience || 'all',
      status: item?.status || 'draft',
    });
    setShowEditor(true);
    await loadDetail(id);
  };

  const closeEditor = () => {
    setShowEditor(false);
    setEditingId(null);
    setForm(emptyForm);
    setDetail(null);
  };

  const saveCampaign = async () => {
    if (!token) return;
    setBusy(true);
    setMessage('');
    try {
      const method = editingId ? 'PUT' : 'POST';
      const url = editingId
        ? `${API_URL}/api/admin/push-campaigns/${editingId}`
        : `${API_URL}/api/admin/push-campaigns`;

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: form.title,
          body: form.body,
          deeplink: form.deeplink.trim() || null,
          audience: form.audience || 'all',
          status: form.status || 'draft',
        }),
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) {
        const data = parseJsonSafe(await res.text());
        throw new Error(data?.detail || 'Save failed');
      }
      await loadList();
      closeEditor();
      setMessage('Campaign saved.');
      setTimeout(() => setMessage(''), 2500);
    } catch (error) {
      setMessage(error?.message || 'Failed to save campaign.');
    } finally {
      setBusy(false);
    }
  };

  const send = async (campaignId, mode) => {
    if (!token) return;
    setBusy(true);
    setMessage('');
    try {
      const endpoint = mode === 'resend' ? 'resend' : 'send';
      const res = await fetch(`${API_URL}/api/admin/push-campaigns/${campaignId}/${endpoint}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data?.detail || 'Send failed.');
        return;
      }
      setMessage('Queued. Delivery may take a few moments.');
      await loadDetail(campaignId);
    } catch {
      setMessage('Send failed.');
    } finally {
      setBusy(false);
    }
  };

  const deleteCampaign = async (campaignId) => {
    if (!token) return;
    if (!confirm('Delete this campaign? This cannot be undone.')) return;
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/push-campaigns/${campaignId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data?.detail || 'Delete failed.');
        return;
      }
      await loadList();
      setMessage('Campaign deleted.');
      setTimeout(() => setMessage(''), 2500);
      if (editingId === campaignId) closeEditor();
    } catch {
      setMessage('Delete failed.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-card">
        <h2 className="admin-title">Push notifications</h2>
        <p className="admin-loading">Loading campaigns...</p>
      </div>
    );
  }

  return (
    <div className="admin-card">
      <h2 className="admin-title">Push notifications</h2>
      <p className="admin-subtitle">
        Create broadcast notifications and send them to users ({provider}). Active tokens: {activeTokens}.
      </p>

      {message ? <p className="admin-subtitle">{message}</p> : null}

      <div className="admin-actions" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="admin-button" type="button" onClick={openCreate} disabled={busy}>
          New campaign
        </button>
        <button className="admin-button secondary" type="button" onClick={loadList} disabled={busy}>
          Refresh
        </button>
      </div>

      <div className="admin-card" style={{ marginTop: 16 }}>
        <h3 className="admin-title">Device tokens</h3>
        <p className="admin-subtitle">
          Active tokens: {activeTokens}. If this is 0, Send will stay disabled. Open the mobile app → Profile → Enable notifications.
        </p>
        {recentTokens.length ? (
          <div className="admin-table-wrap" style={{ marginTop: 12 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Platform</th>
                  <th>Enabled</th>
                  <th>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {recentTokens.map((t) => (
                  <tr key={t.id}>
                    <td>{t.user_id ?? '-'}</td>
                    <td>{t.platform || '-'}</td>
                    <td>{t.enabled ? 'yes' : 'no'}</td>
                    <td>{t.last_seen_at ? new Date(t.last_seen_at).toLocaleString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="admin-subtitle" style={{ marginTop: 10 }}>
            No tokens registered yet.
          </p>
        )}
      </div>

      <div className="admin-card" style={{ marginTop: 16 }}>
        <h3 className="admin-title">Campaigns</h3>
        <p className="admin-subtitle">Send now uses the latest saved content.</p>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Audience</th>
                <th>Updated</th>
                <th style={{ width: 220 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length ? (
                items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.title}</td>
                    <td>{item.status}</td>
                    <td>{item.audience}</td>
                    <td>{item.updated_at ? new Date(item.updated_at).toLocaleString() : '-'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <IconButton title="Edit" onClick={() => openEdit(item)} disabled={busy}>
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                          </svg>
                        </IconButton>
                        <IconButton title="Delete" danger onClick={() => deleteCampaign(item.id)} disabled={busy}>
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M3 6h18" />
                            <path d="M8 6V4h8v2" />
                            <path d="M19 6l-1 14H6L5 6" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                          </svg>
                        </IconButton>
                        <IconButton
                          title={
                            item.status === 'archived'
                              ? 'Archived campaigns cannot be sent'
                              : activeTokens <= 0
                                ? 'No active push tokens yet'
                                : 'Send now'
                          }
                          onClick={() => send(item.id, 'send')}
                          disabled={busy || activeTokens <= 0 || item.status === 'archived'}
                        >
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M22 2L11 13" />
                            <path d="M22 2l-7 20-4-9-9-4 20-7z" />
                          </svg>
                        </IconButton>
                        <IconButton
                          title={
                            item.status === 'archived'
                              ? 'Archived campaigns cannot be resent'
                              : activeTokens <= 0
                                ? 'No active push tokens yet'
                                : 'Resend'
                          }
                          onClick={() => send(item.id, 'resend')}
                          disabled={busy || activeTokens <= 0 || item.status === 'archived'}
                        >
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M21 12a9 9 0 1 1-3-6.7" />
                            <path d="M21 3v7h-7" />
                          </svg>
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="admin-empty">
                    No campaigns yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showEditor ? (
        <div className="admin-modal-backdrop" role="presentation" onClick={closeEditor}>
          <div className="admin-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3 className="admin-title">{editingId ? 'Edit campaign' : 'New campaign'}</h3>
            <p className="admin-subtitle">
              Keep it short. Users see a standard phone notification. Tap opens the app.
            </p>

            <div className="admin-field" style={{ marginTop: 12 }}>
              <label>Title</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
                placeholder="e.g., Today’s challenge is ready"
                disabled={busy}
              />
            </div>

            <div className="admin-field" style={{ marginTop: 12 }}>
              <label>Body</label>
              <textarea
                value={form.body}
                onChange={(e) => setForm((s) => ({ ...s, body: e.target.value }))}
                placeholder="e.g., Complete 6 small actions to support steadier blood sugar today."
                disabled={busy}
                rows={4}
              />
            </div>

            <div className="admin-field" style={{ marginTop: 12 }}>
              <label>Deeplink (optional)</label>
              <input
                type="text"
                value={form.deeplink}
                onChange={(e) => setForm((s) => ({ ...s, deeplink: e.target.value }))}
                placeholder="e.g., app://home"
                disabled={busy}
              />
            </div>

            <div className="admin-field" style={{ marginTop: 12 }}>
              <label>Audience</label>
              <select
                value={form.audience}
                onChange={(e) => setForm((s) => ({ ...s, audience: e.target.value }))}
                disabled={busy}
              >
                <option value="all">All users</option>
                <option value="free">Free users</option>
                <option value="premium">Premium users</option>
              </select>
            </div>

            <div className="admin-field" style={{ marginTop: 12 }}>
              <label>Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))}
                disabled={busy}
              >
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            {detail?.sends?.length ? (
              <div className="admin-card" style={{ marginTop: 14 }}>
                <h4 className="admin-title">Recent sends</h4>
                <div className="admin-table-wrap" style={{ marginTop: 10 }}>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Queued</th>
                        <th>Status</th>
                        <th>Success</th>
                        <th>Fail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.sends.slice(0, 6).map((s) => (
                        <tr key={s.id}>
                          <td>{s.queued_at ? new Date(s.queued_at).toLocaleString() : '-'}</td>
                          <td>{s.status}</td>
                          <td>{s.success_count ?? '-'}</td>
                          <td>{s.failure_count ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {detail.sends[0]?.error_summary ? (
                  <p className="admin-subtitle" style={{ marginTop: 10 }}>
                    {detail.sends[0].error_summary}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="admin-actions" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
              <button className="admin-button" type="button" onClick={saveCampaign} disabled={busy}>
                {busy ? 'Working...' : 'Save'}
              </button>
              {editingId ? (
                <>
                  <button
                    className="admin-button danger"
                    type="button"
                    onClick={() => deleteCampaign(editingId)}
                    disabled={busy}
                  >
                    Delete
                  </button>
                  <button
                    className="admin-button secondary"
                    type="button"
                    onClick={() => send(editingId, 'send')}
                    disabled={busy || activeTokens <= 0 || form.status === 'archived'}
                  >
                    Send now
                  </button>
                  <button
                    className="admin-button secondary"
                    type="button"
                    onClick={() => send(editingId, 'resend')}
                    disabled={busy || activeTokens <= 0 || form.status === 'archived'}
                  >
                    Resend
                  </button>
                </>
              ) : null}
              <button className="admin-button secondary" type="button" onClick={closeEditor} disabled={busy}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
