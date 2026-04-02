'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import EmptyState from '../ui/EmptyState';
import LoadingState from '../ui/LoadingState';
import StructuredText from '../ui/StructuredText';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
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

  const [picklists, setPicklists] = useState({ roles: [], staff: [] });
  const [picklistsLoading, setPicklistsLoading] = useState(false);

  const [assignMode, setAssignMode] = useState('staff'); // staff | role
  const [assignStaffId, setAssignStaffId] = useState('');
  const [assignRoleKey, setAssignRoleKey] = useState('');
  const [assignText, setAssignText] = useState('');
  const [assigning, setAssigning] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [editText, setEditText] = useState('');
  const [editSaving, setEditSaving] = useState(false);

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

  const loadPicklists = useCallback(async () => {
    if (!token || !canManage) return;
    setPicklistsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/work-plans/picklists`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error(data.detail || 'Failed to load staff picklists.');
      const roles = Array.isArray(data.roles) ? data.roles : [];
      const staff = Array.isArray(data.staff) ? data.staff : [];
      setPicklists({ roles, staff });

      if (!assignStaffId && staff[0]?.id) setAssignStaffId(String(staff[0].id));
      if (!assignRoleKey && roles[0]?.key) setAssignRoleKey(String(roles[0].key));
    } catch (e) {
      setPicklists({ roles: [], staff: [] });
      setMessage(e?.message || 'Failed to load staff picklists.');
    } finally {
      setPicklistsLoading(false);
    }
  }, [assignRoleKey, assignStaffId, canManage, router, token]);

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

  const assignTask = useCallback(
    async (event) => {
      event?.preventDefault?.();
      if (!token || !canManage) return;
      setAssigning(true);
      setMessage('');
      try {
        const text = String(assignText || '').trim();
        if (!text) throw new Error('Task text is required.');

        const url =
          assignMode === 'role'
            ? `${API_URL}/api/admin/work-plans/tasks/assign-role`
            : `${API_URL}/api/admin/work-plans/tasks/assign`;
        const payload =
          assignMode === 'role'
            ? { role_key: assignRoleKey, work_date: workDate, text }
            : { staff_user_id: Number(assignStaffId), work_date: workDate, text };

        const res = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          localStorage.removeItem('adminToken');
          router.push('/admin');
          return;
        }
        if (!res.ok) throw new Error(data.detail || 'Failed to assign task.');

        setAssignText('');
        await loadDaily();
      } catch (e) {
        setMessage(e?.message || 'Failed to assign task.');
      } finally {
        setAssigning(false);
      }
    },
    [assignMode, assignRoleKey, assignStaffId, assignText, canManage, loadDaily, router, token, workDate]
  );

  const openEdit = (task) => {
    setEditTask(task);
    setEditText(String(task?.text || ''));
    setEditOpen(true);
  };

  const closeEdit = () => {
    setEditOpen(false);
    setEditTask(null);
    setEditText('');
    setEditSaving(false);
  };

  const saveEdit = useCallback(
    async (event) => {
      event?.preventDefault?.();
      if (!token || !canManage || !editTask?.id) return;
      setEditSaving(true);
      setMessage('');
      try {
        const res = await fetch(`${API_URL}/api/admin/work-plans/tasks/${editTask.id}/update`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: String(editText || '').trim(), work_date: workDate }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          localStorage.removeItem('adminToken');
          router.push('/admin');
          return;
        }
        if (!res.ok) throw new Error(data.detail || 'Failed to update task.');
        closeEdit();
        await loadDaily();
      } catch (e) {
        setMessage(e?.message || 'Failed to update task.');
      } finally {
        setEditSaving(false);
      }
    },
    [canManage, editTask?.id, editText, loadDaily, router, token, workDate]
  );

  const deleteTask = useCallback(
    async (taskId) => {
      if (!token || !canManage) return;
      const ok = confirm('Delete this task?');
      if (!ok) return;
      setMessage('');
      try {
        const res = await fetch(`${API_URL}/api/admin/work-plans/tasks/${taskId}/delete`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          localStorage.removeItem('adminToken');
          router.push('/admin');
          return;
        }
        if (!res.ok) throw new Error(data.detail || 'Failed to delete task.');
        await loadDaily();
      } catch (e) {
        setMessage(e?.message || 'Failed to delete task.');
      }
    },
    [canManage, loadDaily, router, token]
  );

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (!canManage) return;
    loadPicklists();
    loadDaily();
  }, [canManage, loadDaily, loadPicklists]);

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
              Daily task completion review.
            </p>
            {message ? (
              <p className="admin-subtitle" style={{ marginTop: 8 }}>
                {message}
              </p>
            ) : null}
          </div>
          <button className="admin-button info" type="button" onClick={loadDaily} disabled={dailyLoading}>
            {dailyLoading ? 'Loading…' : 'Refresh'}
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

        <div className="admin-card admin-card--subtle" style={{ padding: 12, marginTop: 12 }}>
          <h4 style={{ marginTop: 0 }}>Assign a daily task</h4>
          <form onSubmit={assignTask}>
            <div className="admin-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <div className="admin-field">
                <label>Assign to</label>
                <select value={assignMode} onChange={(e) => setAssignMode(e.target.value)}>
                  <option value="staff">Specific staff</option>
                  <option value="role">Role</option>
                </select>
              </div>

              {assignMode === 'staff' ? (
                <div className="admin-field">
                  <label>Staff</label>
                  <select value={assignStaffId} onChange={(e) => setAssignStaffId(e.target.value)} disabled={picklistsLoading}>
                    {(Array.isArray(picklists.staff) ? picklists.staff : []).map((s) => {
                      const label = (String(s.full_name || '').trim() || String(s.email || '').trim() || `Staff ${s.id}`).slice(0, 120);
                      return (
                        <option key={s.id} value={String(s.id)}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                </div>
              ) : (
                <div className="admin-field">
                  <label>Role</label>
                  <select value={assignRoleKey} onChange={(e) => setAssignRoleKey(e.target.value)} disabled={picklistsLoading}>
                    {(Array.isArray(picklists.roles) ? picklists.roles : []).map((r) => (
                      <option key={r.key} value={String(r.key)}>
                        {r.name || r.key}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="admin-field" style={{ marginTop: 10 }}>
              <label>Task</label>
              <textarea
                value={assignText}
                onChange={(e) => setAssignText(e.target.value)}
                placeholder="Write the task instructions..."
                maxLength={4000}
                required
              />
            </div>
            <div className="admin-actions" style={{ justifyContent: 'flex-end' }}>
              <button className="admin-button" type="submit" disabled={assigning || picklistsLoading || !assignText.trim()}>
                {assigning ? 'Assigning…' : 'Assign task'}
              </button>
            </div>
          </form>
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
                                    <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                      <StructuredText text={t.text} style={{ margin: 0, fontWeight: 700 }} />
                                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        <button className="admin-button secondary" type="button" onClick={() => openEdit(t)}>
                                          Edit
                                        </button>
                                        <button className="admin-button danger" type="button" onClick={() => deleteTask(t.id)}>
                                          Delete
                                        </button>
                                      </div>
                                    </div>
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

      {editOpen ? (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-label="Edit task" onClick={closeEdit}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>Edit task</h3>
              <button className="admin-icon-button danger" type="button" aria-label="Close" onClick={closeEdit}>
                ×
              </button>
            </div>
            <div className="admin-modal-body">
              <form onSubmit={saveEdit}>
                <div className="admin-field">
                  <label>Task</label>
                  <textarea value={editText} onChange={(e) => setEditText(e.target.value)} maxLength={4000} required />
                </div>
                <div className="admin-actions" style={{ justifyContent: 'flex-end' }}>
                  <button className="admin-button secondary" type="button" onClick={closeEdit}>
                    Cancel
                  </button>
                  <button className="admin-button" type="submit" disabled={editSaving || !editText.trim()}>
                    {editSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {false && (
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
                  <th>Status</th>
                  <th>Completed</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {progressItems.map((m) => (
                  <tr key={m.id}>
                    <td style={{ maxWidth: 620, whiteSpace: 'pre-wrap' }}>{m.title}</td>
                    <td>{m.is_completed ? <span className="admin-badge success">Done</span> : <span className="admin-badge secondary">Open</span>}</td>
                    <td>{m.completed_at || '—'}</td>
                    <td>
                      {m.is_completed ? (
                        <button className="admin-button warning" type="button" disabled={toggleMilestoneLoading} onClick={() => setMilestoneDone(m.id, false)}>
                          Reopen
                        </button>
                      ) : (
                        <button className="admin-button success" type="button" disabled={toggleMilestoneLoading} onClick={() => setMilestoneDone(m.id, true)}>
                          Mark done
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {false && detailLoading ? (
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
      )}
    </div>
  );
}
