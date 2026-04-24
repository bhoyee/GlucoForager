'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import EmptyState from '../ui/EmptyState';
import LoadingState from '../ui/LoadingState';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

function monthStartISO(d) {
  const x = new Date(d);
  x.setDate(1);
  const pad = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-01`;
}

function mondayOfWeek(d) {
  const x = new Date(d);
  const day = x.getDay(); // 0..6 (Sun..Sat)
  const diff = (day === 0 ? -6 : 1) - day;
  x.setDate(x.getDate() + diff);
  const pad = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

function nextMonthStartISO(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return monthStartISO(d);
}

export default function MilestonesPage() {
  const router = useRouter();
  const token = useMemo(() => (typeof window === 'undefined' ? null : localStorage.getItem('adminToken')), []);

  const [session, setSession] = useState(null);
  const permissions = Array.isArray(session?.permissions) ? session.permissions : [];
  const canManage = permissions.includes('*') || permissions.includes('work_logs.manage');

  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const [rolesLoading, setRolesLoading] = useState(false);
  const [roles, setRoles] = useState([]);
  const [roleKey, setRoleKey] = useState('');
  const [cadence, setCadence] = useState('monthly');

  const now = useMemo(() => new Date(), []);
  const [periodStart, setPeriodStart] = useState(monthStartISO(now));

  const [items, setItems] = useState([]);
  const [totalStaff, setTotalStaff] = useState(0);

  const [editId, setEditId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [toggleLoading, setToggleLoading] = useState(false);
  const [editLoading, setEditLoading] = useState(false);

  const [carryLoading, setCarryLoading] = useState(false);

  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summary, setSummary] = useState([]);

  const loadSession = useCallback(async () => {
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
  }, [router, token]);

  const loadRoles = useCallback(async () => {
    if (!token || !canManage) return;
    setRolesLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/staff/roles`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load roles.');
      const list = Array.isArray(data.items) ? data.items : [];
      setRoles(list);
      if (!roleKey && list[0]?.key) setRoleKey(String(list[0].key));
    } catch {
      const fallback = [
        { key: 'designer', name: 'Designer' },
        { key: 'developer', name: 'Developer' },
        { key: 'hr', name: 'HR' },
        { key: 'marketer', name: 'Marketer' },
        { key: 'support', name: 'Support' },
      ];
      setRoles(fallback);
      if (!roleKey) setRoleKey('designer');
    } finally {
      setRolesLoading(false);
    }
  }, [canManage, roleKey, token]);

  const loadMilestones = useCallback(async () => {
    if (!token || !canManage || !roleKey || !periodStart) return;
    setLoading(true);
    setMessage('');
    try {
      const url = `${API_URL}/api/admin/work-plans/milestones/progress?role_key=${encodeURIComponent(roleKey)}&cadence=${encodeURIComponent(
        cadence
      )}&period_start=${encodeURIComponent(periodStart)}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load milestones.');
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotalStaff(Number(data.total_staff || 0));
    } catch (e) {
      setItems([]);
      setTotalStaff(0);
      setMessage(e?.message || 'Failed to load milestones.');
    } finally {
      setLoading(false);
    }
  }, [cadence, canManage, periodStart, roleKey, token]);

  const loadMonthSummary = useCallback(async () => {
    if (!token || !canManage) return;
    const d = new Date(`${periodStart}T00:00:00Z`);
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    setSummaryLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/work-plans/milestones/month-summary?year=${year}&month=${month}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load summary.');
      setSummary(Array.isArray(data.items) ? data.items : []);
    } catch {
      setSummary([]);
    } finally {
      setSummaryLoading(false);
    }
  }, [canManage, periodStart, token]);

  const startEdit = (m) => {
    setEditId(m.id);
    setEditTitle(m.title || '');
    setEditDescription(m.description || '');
  };

  const saveEdit = async () => {
    if (!token || !canManage || !editId) return;
    const title = String(editTitle || '').trim();
    if (!title) return;
    setEditLoading(true);
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/work-plans/milestones/${editId}/update`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description: String(editDescription || '').trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to update milestone.');
      setEditId(null);
      setEditTitle('');
      setEditDescription('');
      setMessage('Saved.');
      loadMilestones();
      loadMonthSummary();
    } catch (e) {
      setMessage(e?.message || 'Failed to update milestone.');
    } finally {
      setEditLoading(false);
    }
  };

  const deleteMilestone = async (milestoneId) => {
    if (!token || !canManage) return;
    // soft-delete existing endpoint
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/work-plans/milestones/${milestoneId}/delete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to delete milestone.');
      setMessage('Deleted.');
      loadMilestones();
      loadMonthSummary();
    } catch (e) {
      setMessage(e?.message || 'Failed to delete milestone.');
    }
  };

  const setMilestoneDone = async (milestoneId, isCompleted) => {
    if (!token || !canManage) return;
    setToggleLoading(true);
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/work-plans/milestones/${milestoneId}/complete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_completed: Boolean(isCompleted) }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error(data.detail || 'Failed to update milestone.');
      // Optimistic UI update so admin sees "Done" immediately (no manual refresh).
      const completedAt = isCompleted ? new Date().toISOString() : null;
      setItems((prev) =>
        (Array.isArray(prev) ? prev : []).map((m) =>
          m && m.id === milestoneId
            ? { ...m, is_completed: Boolean(isCompleted), completed_at: completedAt }
            : m
        )
      );
      // Then re-fetch to ensure server state is reflected accurately.
      await loadMilestones();
      await loadMonthSummary();
    } catch (e) {
      setMessage(e?.message || 'Failed to update milestone.');
    } finally {
      setToggleLoading(false);
    }
  };

  const carryOver = async () => {
    if (!token || !canManage || cadence !== 'monthly') return;
    setCarryLoading(true);
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/work-plans/milestones/carry-over-monthly`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role_key: roleKey, period_start: periodStart }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to carry over.');
      setMessage(`Carry-over created: ${data.created || 0} (skipped: ${data.skipped || 0}). Target: ${data.target_period_start || nextMonthStartISO(periodStart)}.`);
      loadMonthSummary();
    } catch (e) {
      setMessage(e?.message || 'Failed to carry over.');
    } finally {
      setCarryLoading(false);
    }
  };

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  useEffect(() => {
    if (!canManage) return;
    setPeriodStart(cadence === 'weekly' ? mondayOfWeek(now) : monthStartISO(now));
  }, [canManage, cadence, now]);

  useEffect(() => {
    if (!canManage) return;
    loadMilestones();
    loadMonthSummary();
  }, [canManage, loadMilestones, loadMonthSummary]);

  if (!canManage) {
    return (
      <div className="admin-page">
        <div className="admin-card">
          <h2 className="admin-title">Milestones</h2>
          <EmptyState title="Access denied" body="You don’t have permission to manage milestones." />
        </div>
      </div>
    );
  }

  const overall = summary.find((s) => String(s.role_key) === String(roleKey)) || null;
  const pct = overall ? Math.round(Number(overall.completion_rate || 0) * 100) : 0;

  return (
    <div className="admin-page">
      <div className="admin-card">
        <div className="admin-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 className="admin-title" style={{ marginBottom: 6 }}>
              Milestones
            </h2>
            <p className="admin-subtitle" style={{ margin: 0 }}>
              Manage weekly/monthly role targets. Mark milestones done when the role has achieved them.
            </p>
            {message ? (
              <p className="admin-subtitle" style={{ marginTop: 8 }}>
                {message}
              </p>
            ) : null}
          </div>
          <button className="admin-button info" type="button" onClick={() => Promise.all([loadMilestones(), loadMonthSummary()])} disabled={loading || summaryLoading}>
            Refresh
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginTop: 12 }}>
          <div className="admin-card admin-card--subtle" style={{ padding: 12 }}>
            <p className="admin-subtitle" style={{ margin: 0 }}>
              Completion rate (month)
            </p>
            <p style={{ margin: '6px 0 0 0', fontSize: 22, fontWeight: 800 }}>{summaryLoading ? '—' : `${pct}%`}</p>
            <p className="admin-subtitle" style={{ margin: '6px 0 0 0' }}>
              Staff: {overall?.total_staff ?? '—'} • Milestones: {overall?.milestones ?? '—'}
            </p>
          </div>
          <div className="admin-card admin-card--subtle" style={{ padding: 12 }}>
            <p className="admin-subtitle" style={{ margin: 0 }}>
              Selected role
            </p>
            <p style={{ margin: '6px 0 0 0', fontSize: 22, fontWeight: 800 }}>{roleKey || '—'}</p>
            <p className="admin-subtitle" style={{ margin: '6px 0 0 0' }}>
              Total staff in role: {totalStaff || '—'}
            </p>
          </div>
        </div>
      </div>

      <div className="admin-card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Filter</h3>
        <div className="admin-actions" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            Role
            <select value={roleKey} onChange={(e) => setRoleKey(e.target.value)} disabled={rolesLoading}>
              {(Array.isArray(roles) ? roles : []).map((r) => (
                <option key={r.key} value={String(r.key)}>
                  {r.name || r.key}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            Cadence
            <select value={cadence} onChange={(e) => setCadence(e.target.value)}>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            Period start
            <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </label>

          <button className="admin-button info" type="button" onClick={loadMilestones} disabled={loading || !roleKey}>
            Refresh list
          </button>
          {cadence === 'monthly' ? (
            <button className="admin-button warning" type="button" onClick={carryOver} disabled={carryLoading || !roleKey}>
              {carryLoading ? 'Carrying...' : 'Carry over incomplete to next month'}
            </button>
          ) : null}
        </div>
      </div>

      <div className="admin-card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Milestones</h3>
        {loading ? (
          <LoadingState label="Loading milestones..." />
        ) : items.length === 0 ? (
          <EmptyState title="No milestones" body="No milestones match the selected role and period." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Completed</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((m) => (
                  <tr key={m.id}>
                    <td style={{ maxWidth: 640, whiteSpace: 'pre-wrap' }}>
                      <div style={{ fontWeight: 800 }}>{m.title}</div>
                      {m.description ? <div className="admin-subtitle" style={{ marginTop: 6 }}>{m.description}</div> : null}
                    </td>
                    <td>{m.is_completed ? <span className="admin-badge success">Done</span> : <span className="admin-badge secondary">Open</span>}</td>
                    <td>{m.completed_at || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button className="admin-button secondary" type="button" onClick={() => startEdit(m)}>
                          Edit
                        </button>
                        {m.is_completed ? (
                          <button className="admin-button warning" type="button" disabled={toggleLoading} onClick={() => setMilestoneDone(m.id, false)}>
                            Reopen
                          </button>
                        ) : (
                          <button className="admin-button success" type="button" disabled={toggleLoading} onClick={() => setMilestoneDone(m.id, true)}>
                            Mark done
                          </button>
                        )}
                        <button className="admin-button danger" type="button" onClick={() => deleteMilestone(m.id)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {editId ? (
          <div className="admin-card" style={{ marginTop: 16, padding: 16 }}>
            <h4 style={{ marginTop: 0 }}>Edit milestone</h4>
            <div className="admin-field">
              <label>Title</label>
              <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div className="admin-field">
              <label>Description</label>
              <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={3} />
            </div>
            <div className="admin-actions">
              <button className="admin-button" type="button" onClick={saveEdit} disabled={editLoading || !String(editTitle || '').trim()}>
                {editLoading ? 'Saving...' : 'Save'}
              </button>
              <button className="admin-button danger" type="button" onClick={() => setEditId(null)}>
                Close
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
