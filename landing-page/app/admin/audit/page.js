'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

function toIsoOrNull(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function prettyJson(value) {
  if (value == null) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function AuditPage() {
  const router = useRouter();
  const token = useMemo(() => (typeof window === 'undefined' ? null : localStorage.getItem('adminToken')), []);

  const [session, setSession] = useState(null);
  const permissions = Array.isArray(session?.permissions) ? session.permissions : [];
  const isAdmin = permissions.includes('*') || permissions.includes('admin.manage');

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);

  const [q, setQ] = useState('');
  const [actorId, setActorId] = useState('');
  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const [entityId, setEntityId] = useState('');
  const [since, setSince] = useState('');
  const [until, setUntil] = useState('');

  const [limit, setLimit] = useState(100);
  const [offset, setOffset] = useState(0);

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

  const loadAudit = async (nextOffset) => {
    if (!token) {
      router.push('/admin');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(nextOffset ?? offset));
      if (q.trim()) params.set('q', q.trim());
      if (actorId.trim()) params.set('actor_id', actorId.trim());
      if (action.trim()) params.set('action', action.trim());
      if (entity.trim()) params.set('entity', entity.trim());
      if (entityId.trim()) params.set('entity_id', entityId.trim());
      const sinceIso = toIsoOrNull(since);
      const untilIso = toIsoOrNull(until);
      if (sinceIso) params.set('since', sinceIso);
      if (untilIso) params.set('until', untilIso);

      const res = await fetch(`${API_URL}/api/admin/audit?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data?.detail || 'Failed to load audit log');
        setItems([]);
        setTotal(0);
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(Number.isFinite(data.total) ? data.total : 0);
      setOffset(Number.isFinite(nextOffset) ? nextOffset : offset);
    } catch {
      setMessage('Failed to load audit log');
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSession();
  }, []);

  useEffect(() => {
    loadAudit(0);
  }, [limit]);

  const canPrev = offset > 0;
  const canNext = offset + items.length < total;

  return (
    <div className="admin-card">
      <h2 className="admin-title">Audit Log</h2>
      <p className="admin-subtitle">Track staff actions across the admin console.</p>

      {!isAdmin ? (
        <p className="admin-help">You do not have permission to view the audit log.</p>
      ) : (
        <>
          {message ? <p className="admin-help">{message}</p> : null}

          <div className="admin-grid" style={{ gridTemplateColumns: '1fr' }}>
            <div>
              <div className="admin-field">
                <label>Search</label>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="action/entity/id..." />
              </div>

              <div className="admin-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                <div className="admin-field">
                  <label>Actor ID</label>
                  <input value={actorId} onChange={(e) => setActorId(e.target.value)} placeholder="e.g. 1" />
                </div>
                <div className="admin-field">
                  <label>Action</label>
                  <input value={action} onChange={(e) => setAction(e.target.value)} placeholder="e.g. blog.publish" />
                </div>
                <div className="admin-field">
                  <label>Entity</label>
                  <input value={entity} onChange={(e) => setEntity(e.target.value)} placeholder="e.g. staff_library_items" />
                </div>
                <div className="admin-field">
                  <label>Entity ID</label>
                  <input value={entityId} onChange={(e) => setEntityId(e.target.value)} placeholder="e.g. 123" />
                </div>
                <div className="admin-field">
                  <label>Since</label>
                  <input type="datetime-local" value={since} onChange={(e) => setSince(e.target.value)} />
                </div>
                <div className="admin-field">
                  <label>Until</label>
                  <input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
                </div>
              </div>

              <div className="admin-actions" style={{ marginTop: 6 }}>
                <button className="admin-button" type="button" onClick={() => loadAudit(0)} disabled={loading}>
                  {loading ? 'Loading…' : 'Search'}
                </button>
                <button
                  className="admin-button secondary"
                  type="button"
                  onClick={() => {
                    setQ('');
                    setActorId('');
                    setAction('');
                    setEntity('');
                    setEntityId('');
                    setSince('');
                    setUntil('');
                    loadAudit(0);
                  }}
                  disabled={loading}
                >
                  Clear
                </button>
                <div className="admin-field" style={{ margin: 0, minWidth: 140 }}>
                  <label>Rows</label>
                  <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} disabled={loading}>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                    <option value={300}>300</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="admin-actions" style={{ justifyContent: 'space-between', marginTop: 18 }}>
            <p className="admin-help" style={{ margin: 0 }}>
              Showing {items.length} of {total} (offset {offset})
            </p>
            <div className="admin-actions" style={{ margin: 0 }}>
              <button
                className="admin-button secondary"
                type="button"
                onClick={() => loadAudit(Math.max(0, offset - limit))}
                disabled={loading || !canPrev}
              >
                Prev
              </button>
              <button
                className="admin-button secondary"
                type="button"
                onClick={() => loadAudit(offset + limit)}
                disabled={loading || !canNext}
              >
                Next
              </button>
            </div>
          </div>

          <div className="admin-table-wrap" style={{ marginTop: 16 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>ID</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{row.created_at ? new Date(row.created_at).toLocaleString() : ''}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {row.actor_email ? row.actor_email : row.actor_id != null ? `#${row.actor_id}` : ''}
                    </td>
                    <td style={{ fontWeight: 700 }}>{row.action || ''}</td>
                    <td>{row.entity || ''}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{row.entity_id || ''}</td>
                    <td style={{ maxWidth: 520 }}>
                      {row.details ? (
                        <details>
                          <summary>View</summary>
                          <pre style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>{prettyJson(row.details)}</pre>
                        </details>
                      ) : (
                        ''
                      )}
                    </td>
                  </tr>
                ))}
                {!loading && items.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: 14, color: '#60786c' }}>
                      No audit events found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

