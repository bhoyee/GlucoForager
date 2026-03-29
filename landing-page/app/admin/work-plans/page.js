'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import EmptyState from '../ui/EmptyState';
import LoadingState from '../ui/LoadingState';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function mondayOfWeek(d) {
  const x = new Date(d);
  const day = x.getDay(); // 0..6 (Sun..Sat)
  const diff = (day === 0 ? -6 : 1) - day;
  x.setDate(x.getDate() + diff);
  const pad = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

export default function WorkPlansPage() {
  const router = useRouter();
  const token = useMemo(() => (typeof window === 'undefined' ? null : localStorage.getItem('adminToken')), []);

  const [session, setSession] = useState(null);
  const permissions = Array.isArray(session?.permissions) ? session.permissions : [];
  const canManage = permissions.includes('*') || permissions.includes('work_logs.manage');

  const [message, setMessage] = useState('');

  const [workDate, setWorkDate] = useState(todayISO());
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyItems, setDailyItems] = useState([]);
  const [expandedStaff, setExpandedStaff] = useState({});

  const [rolesLoading, setRolesLoading] = useState(false);
  const [roles, setRoles] = useState([]);
  const [roleKey, setRoleKey] = useState('');
  const [cadence, setCadence] = useState('weekly');
  const [periodStart, setPeriodStart] = useState(mondayOfWeek(new Date()));
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressItems, setProgressItems] = useState([]);
  const [totalStaff, setTotalStaff] = useState(0);
  const [selectedMilestone, setSelectedMilestone] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailItems, setDetailItems] = useState([]);

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
      const items = Array.isArray(data.items) ? data.items : [];
      setRoles(items);
      if (!roleKey && items[0]?.key) setRoleKey(String(items[0].key));
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

  const loadDaily = useCallback(async () => {
    if (!token || !canManage) return;
    setDailyLoading(true);
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/work-plans/tasks/by-date?work_date=${encodeURIComponent(workDate)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load tasks.');
      setDailyItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setDailyItems([]);
      setMessage(e?.message || 'Failed to load tasks.');
    } finally {
      setDailyLoading(false);
    }
  }, [canManage, token, workDate]);

  const loadProgress = useCallback(async () => {
    if (!token || !canManage || !roleKey || !periodStart) return;
    setProgressLoading(true);
    setMessage('');
    try {
      const url = `${API_URL}/api/admin/work-plans/milestones/progress?role_key=${encodeURIComponent(roleKey)}&cadence=${encodeURIComponent(
        cadence
      )}&period_start=${encodeURIComponent(periodStart)}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load milestone progress.');
      setProgressItems(Array.isArray(data.items) ? data.items : []);
      setTotalStaff(Number(data.total_staff || 0));
    } catch (e) {
      setProgressItems([]);
      setTotalStaff(0);
      setMessage(e?.message || 'Failed to load milestone progress.');
    } finally {
      setProgressLoading(false);
    }
  }, [cadence, canManage, periodStart, roleKey, token]);

  const loadMilestoneDetail = useCallback(
    async (milestoneId) => {
      if (!token || !canManage) return;
      setDetailLoading(true);
      setMessage('');
      try {
        const res = await fetch(`${API_URL}/api/admin/work-plans/milestones/${milestoneId}/progress-detail`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.detail || 'Failed to load milestone detail.');
        setSelectedMilestone(data.milestone || null);
        setDetailItems(Array.isArray(data.items) ? data.items : []);
      } catch (e) {
        setSelectedMilestone(null);
        setDetailItems([]);
        setMessage(e?.message || 'Failed to load milestone detail.');
      } finally {
        setDetailLoading(false);
      }
    },
    [canManage, token]
  );

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  useEffect(() => {
    if (!canManage) return;
    loadDaily();
  }, [canManage, loadDaily]);

  useEffect(() => {
    if (!canManage) return;
    loadProgress();
  }, [canManage, loadProgress]);

  if (!canManage) {
    return (
      <div className="admin-page">
        <div className="admin-card">
          <h2 className="admin-title">Work Plans</h2>
          <EmptyState title="Access denied" body="You don’t have permission to manage work plans." />
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-card">
        <div className="admin-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 className="admin-title" style={{ marginBottom: 6 }}>
              Work Plans
            </h2>
            <p className="admin-subtitle" style={{ margin: 0 }}>
              Daily task completion + milestone progress review.
            </p>
            {message ? (
              <p className="admin-subtitle" style={{ marginTop: 8 }}>
                {message}
              </p>
            ) : null}
          </div>
          <button className="admin-button info" type="button" onClick={() => Promise.all([loadDaily(), loadProgress()])} disabled={dailyLoading || progressLoading}>
            Refresh all
          </button>
        </div>
      </div>

      <div className="admin-card" style={{ marginTop: 16 }}>
        <div className="admin-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Daily tasks overview</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} />
            <button className="admin-button info" type="button" onClick={loadDaily} disabled={dailyLoading}>
              {dailyLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>

        {dailyLoading ? (
          <div style={{ marginTop: 12 }}>
            <LoadingState label="Loading daily tasks..." />
          </div>
        ) : dailyItems.length === 0 ? (
          <div style={{ marginTop: 12 }}>
            <EmptyState title="No tasks found" body="No tasks were assigned for this date." />
          </div>
        ) : (
          <div style={{ marginTop: 12 }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Staff</th>
                    <th>Country</th>
                    <th>Done</th>
                    <th>Total</th>
                    <th>Open</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyItems.map((s) => {
                    const open = Math.max(0, Number(s.total_count || 0) - Number(s.done_count || 0));
                    const expanded = Boolean(expandedStaff?.[String(s.staff_user_id)]);
                    return (
                      <>
                        <tr key={s.staff_user_id}>
                          <td>{s.full_name ? `${s.full_name} (${s.email})` : s.email}</td>
                          <td>{s.country || '—'}</td>
                          <td>{s.done_count || 0}</td>
                          <td>{s.total_count || 0}</td>
                          <td>{open}</td>
                          <td>
                            <button
                              className="admin-button secondary"
                              type="button"
                              onClick={() =>
                                setExpandedStaff((prev) => ({ ...(prev || {}), [String(s.staff_user_id)]: !expanded }))
                              }
                            >
                              {expanded ? 'Hide' : 'View'}
                            </button>
                          </td>
                        </tr>
                        {expanded ? (
                          <tr key={`${s.staff_user_id}-detail`}>
                            <td colSpan={6}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {(Array.isArray(s.tasks) ? s.tasks : []).map((t) => (
                                  <div key={t.id} className="admin-card admin-card--subtle" style={{ padding: 12 }}>
                                    <p style={{ margin: 0, fontWeight: 700 }}>{t.text}</p>
                                    <p className="admin-subtitle" style={{ margin: '6px 0 0 0' }}>
                                      Status: {t.is_completed ? 'Done' : 'Open'} {t.completed_at ? `• ${t.completed_at}` : ''}
                                    </p>
                                    {t.completion_note ? (
                                      <p className="admin-subtitle" style={{ margin: '6px 0 0 0', whiteSpace: 'pre-wrap' }}>
                                        Note: {t.completion_note}
                                      </p>
                                    ) : null}
                                    <p className="admin-subtitle" style={{ margin: '6px 0 0 0' }}>
                                      Proof links: {Array.isArray(t.proof_links) ? t.proof_links.length : 0}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="admin-card" style={{ marginTop: 16 }}>
        <div className="admin-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Milestone progress</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={roleKey} onChange={(e) => setRoleKey(e.target.value)} disabled={rolesLoading}>
              {(Array.isArray(roles) ? roles : []).map((r) => (
                <option key={r.key} value={String(r.key)}>
                  {r.name || r.key}
                </option>
              ))}
            </select>
            <select value={cadence} onChange={(e) => setCadence(e.target.value)}>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            <button className="admin-button info" type="button" onClick={loadProgress} disabled={progressLoading || !roleKey}>
              {progressLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>

        {progressLoading ? (
          <div style={{ marginTop: 12 }}>
            <LoadingState label="Loading milestone progress..." />
          </div>
        ) : progressItems.length === 0 ? (
          <div style={{ marginTop: 12 }}>
            <EmptyState title="No milestones" body="No milestones exist for the selected role and period." />
          </div>
        ) : (
          <div style={{ marginTop: 12, overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Milestone</th>
                  <th>Done</th>
                  <th>Total staff</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {progressItems.map((m) => (
                  <tr key={m.id}>
                    <td style={{ maxWidth: 620, whiteSpace: 'pre-wrap' }}>{m.title}</td>
                    <td>{m.done_count || 0}</td>
                    <td>{m.total_staff || totalStaff || 0}</td>
                    <td>
                      <button className="admin-button secondary" type="button" onClick={() => loadMilestoneDetail(m.id)}>
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {detailLoading ? (
          <div style={{ marginTop: 16 }}>
            <LoadingState label="Loading milestone detail..." />
          </div>
        ) : selectedMilestone ? (
          <div className="admin-card" style={{ marginTop: 16, padding: 16 }}>
            <div className="admin-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h4 style={{ margin: 0 }}>{selectedMilestone.title}</h4>
                <p className="admin-subtitle" style={{ margin: '6px 0 0 0' }}>
                  {selectedMilestone.role_key} • {selectedMilestone.cadence} • {selectedMilestone.period_start}
                </p>
              </div>
              <button className="admin-button danger" type="button" onClick={() => setSelectedMilestone(null)}>
                Close
              </button>
            </div>

            <div style={{ marginTop: 12, overflowX: 'auto' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Staff</th>
                    <th>Status</th>
                    <th>Proof links</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {detailItems.map((r) => (
                    <tr key={r.staff_user_id}>
                      <td>{r.full_name ? `${r.full_name} (${r.email})` : r.email}</td>
                      <td>{r.is_completed ? 'Done' : 'Open'}</td>
                      <td>{Array.isArray(r.proof_links) ? r.proof_links.length : 0}</td>
                      <td style={{ maxWidth: 520, whiteSpace: 'pre-wrap' }}>{r.completion_note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

