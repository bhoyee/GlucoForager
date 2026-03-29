'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import EmptyState from '../ui/EmptyState';
import LoadingState from '../ui/LoadingState';
import { adminFetch, clearAdminTokens } from '../lib/adminAuth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

function hasPermission(permissions, required) {
  if (!required) return true;
  const perms = Array.isArray(permissions) ? permissions : [];
  if (perms.includes('*')) return true;
  if (Array.isArray(required)) return required.some((r) => perms.includes(r));
  return perms.includes(required);
}

export default function UpdatesPage() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const permissions = Array.isArray(session?.permissions) ? session.permissions : [];
  const isAdmin = permissions.includes('*') || permissions.includes('admin.manage');
  const canWrite = hasPermission(permissions, 'intranet_updates.write');
  const canDelete = hasPermission(permissions, 'intranet_updates.delete');

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [items, setItems] = useState([]);
  const [includeDeleted, setIncludeDeleted] = useState(false);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');

  const safeJson = useCallback(
    async (url, options) => {
      try {
        const res = await adminFetch(url, options);
        if (res.status === 401) {
          clearAdminTokens();
          router.push('/admin');
          return { ok: false, status: 401, data: null };
        }
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.status, data };
      } catch (e) {
        return { ok: false, status: 0, data: null, error: e?.message || 'Network error' };
      }
    },
    [router]
  );

  const loadSession = useCallback(async () => {
    const r = await safeJson(`${API_URL}/api/admin/me`);
    if (r.status === 401) return;
    if (r.ok) setSession(r.data);
  }, [safeJson]);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage('');
    await loadSession();
    const r = await safeJson(
      `${API_URL}/api/admin/intranet-updates?limit=80&offset=0&include_deleted=${includeDeleted ? '1' : '0'}`
    );
    if (!r.ok) {
      setItems([]);
      if (r.status !== 401) setMessage(r?.data?.detail || r?.error || 'Failed to load updates.');
      setLoading(false);
      return;
    }
    setItems(Array.isArray(r?.data?.items) ? r.data.items : []);
    setLoading(false);
  }, [includeDeleted, loadSession, safeJson]);

  useEffect(() => {
    load();
  }, [load]);

  const startEdit = (row) => {
    setEditingId(row.id);
    setEditTitle(String(row.title || ''));
    setEditBody(String(row.body || ''));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
    setEditBody('');
  };

  const createUpdate = async (event) => {
    event.preventDefault();
    if (!canWrite) return;
    setMessage('');
    try {
      const r = await safeJson(`${API_URL}/api/admin/intranet-updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body }),
      });
      if (!r.ok) throw new Error(r?.data?.detail || r?.error || 'Failed to create update.');
      setTitle('');
      setBody('');
      load();
    } catch (e) {
      setMessage(e?.message || 'Failed to create update.');
    }
  };

  const saveEdit = async () => {
    if (!canWrite || !editingId) return;
    setMessage('');
    try {
      const r = await safeJson(`${API_URL}/api/admin/intranet-updates/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle, body: editBody }),
      });
      if (!r.ok) throw new Error(r?.data?.detail || r?.error || 'Failed to update.');
      cancelEdit();
      load();
    } catch (e) {
      setMessage(e?.message || 'Failed to update.');
    }
  };

  const softDelete = async (id) => {
    if (!canDelete) return;
    if (!confirm('Soft delete this update? Staff will no longer see it.')) return;
    setMessage('');
    try {
      const r = await safeJson(`${API_URL}/api/admin/intranet-updates/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(r?.data?.detail || r?.error || 'Failed to delete.');
      load();
    } catch (e) {
      setMessage(e?.message || 'Failed to delete.');
    }
  };

  const purge = async (id) => {
    if (!isAdmin) return;
    if (!confirm('Permanently delete this update? This cannot be undone.')) return;
    setMessage('');
    try {
      const r = await safeJson(`${API_URL}/api/admin/intranet-updates/${id}/purge`, { method: 'DELETE' });
      if (!r.ok) throw new Error(r?.data?.detail || r?.error || 'Failed to purge.');
      load();
    } catch (e) {
      setMessage(e?.message || 'Failed to purge.');
    }
  };

  const formatDate = useMemo(
    () => (iso) => {
      if (!iso) return '';
      try {
        return new Date(iso).toLocaleString();
      } catch {
        return String(iso);
      }
    },
    []
  );

  return (
    <div className="admin-page">
      <div className="admin-card">
        <h2 className="admin-title">Updates</h2>
        <p className="admin-subtitle">Internal product updates and announcements shown on the staff dashboard.</p>

        {message ? <div className="admin-alert warning">{message}</div> : null}

        <div className="admin-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="admin-actions">
            {(canDelete || isAdmin) && (
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={includeDeleted}
                  onChange={(e) => setIncludeDeleted(e.target.checked)}
                />
                Include deleted
              </label>
            )}
            <button className="admin-button secondary" type="button" onClick={load} disabled={loading}>
              Refresh
            </button>
          </div>
          <div className="admin-subtitle" style={{ margin: 0 }}>
            {items.length} item(s)
          </div>
        </div>
      </div>

      {canWrite ? (
        <div className="admin-card" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>Post a new update</h3>
          <form onSubmit={createUpdate}>
            <div className="admin-field">
              <label>Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="e.g. New swaps UI shipped" />
            </div>
            <div className="admin-field">
              <label>Body</label>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={8000} placeholder="Write the update…" />
              <p className="admin-help">Keep it short and action-oriented. Staff will see this on their dashboard.</p>
            </div>
            <div className="admin-actions">
              <button className="admin-button" type="submit" disabled={loading || !title.trim() || !body.trim()}>
                Publish update
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="admin-card" style={{ marginTop: 16 }}>
        {loading ? (
          <LoadingState label="Loading updates…" />
        ) : items.length === 0 ? (
          <EmptyState
            title="No updates yet"
            body={canWrite ? 'Post your first internal update for the team.' : 'HR/Admin can post updates here.'}
          />
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {items.map((row) => {
              const deleted = Boolean(row.is_deleted);
              const isEditing = editingId === row.id;
              return (
                <div
                  key={row.id}
                  className="admin-card admin-card--subtle admin-card--compact"
                  style={{ opacity: deleted ? 0.7 : 1 }}
                >
                  <div className="admin-actions" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ fontWeight: 900, fontSize: 16, wordBreak: 'break-word' }}>{row.title}</div>
                        {deleted ? <span className="admin-badge danger">deleted</span> : <span className="admin-badge secondary">live</span>}
                      </div>
                      <div className="admin-help" style={{ marginTop: 6 }}>
                        Created: {formatDate(row.created_at)}{row.updated_at ? ` · Updated: ${formatDate(row.updated_at)}` : ''}
                      </div>
                    </div>
                    <div className="admin-actions" style={{ justifyContent: 'flex-end' }}>
                      {canWrite && !deleted ? (
                        <button className="admin-button secondary" type="button" onClick={() => startEdit(row)}>
                          Edit
                        </button>
                      ) : null}
                      {canDelete && !deleted ? (
                        <button className="admin-button danger" type="button" onClick={() => softDelete(row.id)}>
                          Soft delete
                        </button>
                      ) : null}
                      {isAdmin ? (
                        <button className="admin-button danger" type="button" onClick={() => purge(row.id)}>
                          Permanent delete
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {isEditing ? (
                    <div style={{ marginTop: 12 }}>
                      <div className="admin-field">
                        <label>Title</label>
                        <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} maxLength={160} />
                      </div>
                      <div className="admin-field">
                        <label>Body</label>
                        <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} maxLength={8000} />
                      </div>
                      <div className="admin-actions">
                        <button className="admin-button" type="button" onClick={saveEdit}>
                          Save
                        </button>
                        <button className="admin-button secondary" type="button" onClick={cancelEdit}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>{row.body}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

