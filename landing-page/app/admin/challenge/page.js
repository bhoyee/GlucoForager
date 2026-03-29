'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

const DEFAULT_CATEGORIES = [
  { value: 'meal_structure', label: 'Meal structure' },
  { value: 'food_choice', label: 'Food choice' },
  { value: 'activity', label: 'Activity' },
  { value: 'hydration', label: 'Hydration' },
  { value: 'portion_control', label: 'Portion control' },
  { value: 'awareness', label: 'Awareness' },
  { value: 'general', label: 'General' },
  { value: 'custom', label: 'Custom...' },
];

const PROFILE_OPTIONS = [
  { key: 'type_2', label: 'Type 2' },
  { key: 'prediabetes', label: 'Prediabetes' },
  { key: 'type_1', label: 'Type 1' },
  { key: 'gestational', label: 'Gestational' },
  { key: 'managing', label: 'Managing' },
  { key: 'prefer_not', label: 'Prefer not' },
];

const emptyTask = {
  id: '',
  task_text: '',
  category: 'meal_structure',
  active: true,
  audience_profiles: [],
  exclude_profiles: [],
};

const parseJsonSafe = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

export default function AdminChallengePage() {
  const router = useRouter();
  const token = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('adminToken');
  }, []);

  const [tab, setTab] = useState('tasks'); // tasks | snapshots

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  // Tasks
  const [tasks, setTasks] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [taskForm, setTaskForm] = useState(emptyTask);
  const [customCategory, setCustomCategory] = useState('');
  const [saving, setSaving] = useState(false);

  // Snapshots
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);
  const [snapshots, setSnapshots] = useState([]);
  const [snapshotsTotal, setSnapshotsTotal] = useState(0);
  const [snapPage, setSnapPage] = useState(1);
  const [snapPageSize, setSnapPageSize] = useState(50);
  const [snapDate, setSnapDate] = useState('');
  const [snapUserId, setSnapUserId] = useState('');
  const [snapCompletedOnly, setSnapCompletedOnly] = useState(false);
  const [snapIncludeTasks, setSnapIncludeTasks] = useState(true);
  const [selectedSnapshot, setSelectedSnapshot] = useState(null);

  useEffect(() => {
    if (!token) {
      router.push('/admin');
      return;
    }
    void loadTasks();
  }, [token]);

  const loadTasks = async () => {
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/challenge/tasks`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json();
      setTasks(Array.isArray(data.items) ? data.items : []);
      setDirty(false);
    } catch {
      setMessage('Failed to load daily challenge tasks.');
    } finally {
      setLoading(false);
    }
  };

  const categoryOptions = useMemo(() => {
    const existing = new Set();
    for (const t of tasks) {
      const c = String(t?.category || '').trim();
      if (c) existing.add(c);
    }
    const out = [...DEFAULT_CATEGORIES];
    for (const value of [...existing].sort()) {
      if (out.some((x) => x.value === value)) continue;
      out.splice(out.length - 1, 0, { value, label: value });
    }
    return out;
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    if (!search.trim()) return tasks;
    const s = search.trim().toLowerCase();
    return tasks.filter((t) => {
      return (
        String(t?.id || '').toLowerCase().includes(s) ||
        String(t?.task_text || '').toLowerCase().includes(s) ||
        String(t?.category || '').toLowerCase().includes(s)
      );
    });
  }, [tasks, search]);

  useEffect(() => {
    setPage(1);
  }, [search, pageSize, tasks.length]);

  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / Math.max(1, pageSize)));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const pageItems = filteredTasks.slice(startIndex, startIndex + pageSize);

  const openCreate = () => {
    setEditingId(null);
    setTaskForm(emptyTask);
    setCustomCategory('');
    setShowEditor(true);
  };

  const openEdit = (task) => {
    const cat = String(task?.category || 'general').trim() || 'general';
    const known = categoryOptions.some((x) => x.value === cat);
    const mapped = known ? cat : 'custom';
    setEditingId(String(task?.id || '').trim() || null);
    setTaskForm({
      id: String(task?.id || ''),
      task_text: String(task?.task_text || ''),
      category: mapped,
      active: task?.active !== false,
      audience_profiles: Array.isArray(task?.audience_profiles) ? task.audience_profiles : [],
      exclude_profiles: Array.isArray(task?.exclude_profiles) ? task.exclude_profiles : [],
    });
    setCustomCategory(mapped === 'custom' ? cat : '');
    setShowEditor(true);
  };

  const closeEditor = () => {
    setShowEditor(false);
    setEditingId(null);
    setTaskForm(emptyTask);
    setCustomCategory('');
  };

  const upsertLocal = () => {
    const finalCategory =
      taskForm.category === 'custom'
        ? String(customCategory || '').trim() || 'general'
        : String(taskForm.category || '').trim() || 'general';
    const id = String(taskForm.id || '').trim();
    if (!id) throw new Error('Task id is required.');
    if (!String(taskForm.task_text || '').trim()) throw new Error('Task text is required.');

    const cleanProfileList = (values) => {
      if (!Array.isArray(values)) return [];
      const allowed = new Set(PROFILE_OPTIONS.map((x) => x.key));
      const out = [];
      const seen = new Set();
      for (const raw of values) {
        const s = String(raw || '').trim().toLowerCase();
        if (!s || !allowed.has(s)) continue;
        if (seen.has(s)) continue;
        seen.add(s);
        out.push(s);
        if (out.length >= 6) break;
      }
      return out;
    };

    const nextItem = {
      id,
      task_text: String(taskForm.task_text || '').trim(),
      category: finalCategory,
      active: Boolean(taskForm.active),
      audience_profiles: cleanProfileList(taskForm.audience_profiles),
      exclude_profiles: cleanProfileList(taskForm.exclude_profiles),
    };

    setTasks((prev) => {
      const copy = [...prev];
      const index = copy.findIndex((x) => String(x?.id || '').trim() === id);
      if (index >= 0) copy[index] = nextItem;
      else copy.unshift(nextItem);
      return copy;
    });
    setDirty(true);
    closeEditor();
  };

  const deleteLocal = (id) => {
    if (!confirm('Delete this task?')) return;
    setTasks((prev) => prev.filter((x) => String(x?.id || '').trim() !== String(id || '').trim()));
    setDirty(true);
  };

  const saveTasks = async () => {
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/admin/challenge/tasks`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ items: tasks }),
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) {
        const data = parseJsonSafe(await response.text());
        throw new Error(data?.detail || 'Save failed');
      }
      setDirty(false);
      setMessage('Saved daily challenge tasks.');
      setTimeout(() => setMessage(''), 2000);
    } catch (error) {
      setMessage(error?.message || 'Failed to save tasks.');
    } finally {
      setSaving(false);
    }
  };

  const seedFromFile = async () => {
    if (!confirm('Replace the DB catalog with backend/app/data/challenge_tasks.json?')) return;
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/admin/challenge/seed?mode=replace`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) throw new Error();
      await loadTasks();
      setMessage('Seeded challenge tasks from file (replace).');
      setTimeout(() => setMessage(''), 2500);
    } catch {
      setMessage('Failed to seed challenge tasks.');
    }
  };

  const loadSnapshots = async () => {
    setSnapshotsLoading(true);
    setMessage('');
    try {
      const params = new URLSearchParams();
      params.set('page', String(Math.max(1, snapPage)));
      params.set('page_size', String(Math.max(1, snapPageSize)));
      if (snapDate) params.set('date_iso', snapDate);
      if (snapUserId.trim()) params.set('user_id', snapUserId.trim());
      if (snapCompletedOnly) params.set('completed_only', 'true');
      if (snapIncludeTasks) params.set('include_tasks', 'true');

      const res = await fetch(`${API_URL}/api/admin/challenge/snapshots?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSnapshots(Array.isArray(data.items) ? data.items : []);
      setSnapshotsTotal(Number(data.total || 0));
    } catch {
      setMessage('Failed to load snapshots.');
    } finally {
      setSnapshotsLoading(false);
    }
  };

  const resetSnapshots = async () => {
    if (!confirm('Clear snapshots for the selected filters? Users will get regenerated tasks on next open.')) return;
    setMessage('');
    try {
      const params = new URLSearchParams();
      if (snapDate) params.set('date_iso', snapDate);
      if (snapUserId.trim()) params.set('user_id', snapUserId.trim());
      const url = `${API_URL}/api/admin/challenge/reset-snapshots${params.toString() ? `?${params.toString()}` : ''}`;
      const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error();
      const data = parseJsonSafe(await res.text());
      setMessage(`Cleared snapshots: deleted ${data?.deleted ?? '?'}.`);
      await loadSnapshots();
      setTimeout(() => setMessage(''), 2500);
    } catch {
      setMessage('Failed to reset snapshots.');
    }
  };

  return (
    <div className="admin-card">
      <div className="admin-recipes-header">
        <h2 className="admin-title">Daily Challenge</h2>
        <p className="admin-subtitle">Manage the task library and inspect user daily snapshots.</p>
      </div>

      {message && <div className="admin-message">{message}</div>}

      <div className="admin-recipes-toolbar" style={{ marginTop: 0 }}>
        <div className="admin-toolbar-grid">
          <div className="admin-toolbar-actions">
            <button
              className={`admin-button${tab === 'tasks' ? '' : ' secondary'}`}
              type="button"
              onClick={() => setTab('tasks')}
            >
              Tasks
            </button>
            <button
              className={`admin-button${tab === 'snapshots' ? '' : ' secondary'}`}
              type="button"
              onClick={() => {
                setTab('snapshots');
                if (!snapshots.length) void loadSnapshots();
              }}
            >
              Snapshots
            </button>
          </div>
          <div className="admin-toolbar-actions" style={{ justifyContent: 'flex-end' }}>
            {tab === 'tasks' ? (
              <>
                <button className="admin-button admin-add-button" type="button" onClick={openCreate}>
                  Add task
                </button>
                <button className="admin-button secondary" type="button" onClick={seedFromFile}>
                  Seed from file (replace)
                </button>
                <button className="admin-button" type="button" disabled={!dirty || saving} onClick={saveTasks}>
                  {saving ? 'Saving...' : dirty ? 'Save changes' : 'Saved'}
                </button>
              </>
            ) : (
              <>
                <button className="admin-button info" type="button" onClick={loadSnapshots} disabled={snapshotsLoading}>
                  {snapshotsLoading ? 'Loading...' : 'Refresh'}
                </button>
                <button className="admin-button danger" type="button" onClick={resetSnapshots}>
                  Reset snapshots
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {tab === 'tasks' ? (
        <>
          <div className="admin-toolbar-grid" style={{ marginTop: 12 }}>
            <div className="admin-toolbar-search">
              <input
                type="text"
                placeholder="Search tasks (id / text / category)..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="admin-search-input"
              />
            </div>
            <div className="admin-toolbar-actions" style={{ justifyContent: 'flex-end' }}>
              <select className="admin-search-input" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n} / page
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="admin-loading-state">
              <p>Loading tasks...</p>
            </div>
          ) : (
            <>
              <div className="admin-table-wrap" style={{ marginTop: 12 }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th style={{ width: 220 }}>ID</th>
                      <th>Task</th>
                      <th style={{ width: 160 }}>Category</th>
                      <th style={{ width: 160 }}>Audience</th>
                      <th style={{ width: 160 }}>Exclude</th>
                      <th style={{ width: 90 }}>Active</th>
                      <th style={{ width: 160 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((t) => (
                      <tr key={t.id}>
                        <td className="admin-mono">{t.id}</td>
                        <td>{t.task_text}</td>
                        <td className="admin-mono">{t.category || 'general'}</td>
                        <td className="admin-mono admin-muted">
                          {Array.isArray(t.audience_profiles) && t.audience_profiles.length ? t.audience_profiles.join(', ') : 'All'}
                        </td>
                        <td className="admin-mono admin-muted">
                          {Array.isArray(t.exclude_profiles) && t.exclude_profiles.length ? t.exclude_profiles.join(', ') : ''}
                        </td>
                        <td>{t.active === false ? 'No' : 'Yes'}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="admin-link" type="button" onClick={() => openEdit(t)}>
                            Edit
                          </button>
                          <span className="admin-divider">|</span>
                          <button className="admin-link danger" type="button" onClick={() => deleteLocal(t.id)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                    {pageItems.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="admin-muted">
                          No tasks found.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              <div className="admin-pagination">
                <button className="admin-button secondary" type="button" disabled={safePage <= 1} onClick={() => setPage(1)}>
                  First
                </button>
                <button
                  className="admin-button secondary"
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </button>
                <div className="admin-muted">
                  Page {safePage} / {totalPages} - {filteredTasks.length} items
                </div>
                <button
                  className="admin-button secondary"
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </button>
                <button
                  className="admin-button secondary"
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage(totalPages)}
                >
                  Last
                </button>
              </div>
            </>
          )}

          {showEditor ? (
            <div className="admin-modal-backdrop" role="presentation" onClick={closeEditor}>
              <div className="admin-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                <div className="admin-modal-header">
                  <div>
                    <div className="admin-card-title">{editingId ? 'Edit task' : 'Add task'}</div>
                    <div className="admin-muted">Click &quot;Save changes&quot; to persist to the server.</div>
                  </div>
                  <button className="admin-button secondary" type="button" onClick={closeEditor}>
                    Close
                  </button>
                </div>

                <div className="admin-grid">
                  <div>
                    <div className="admin-field">
                      <label>ID</label>
                      <input
                        value={taskForm.id}
                        onChange={(e) => setTaskForm((f) => ({ ...f, id: e.target.value }))}
                        disabled={Boolean(editingId)}
                        placeholder="challenge-walk-after-meal"
                      />
                      <p className="admin-help">Use a stable id; it's what we store in user snapshots.</p>
                    </div>
                    <div className="admin-field">
                      <label>Task text</label>
                      <textarea
                        rows={4}
                        value={taskForm.task_text}
                        onChange={(e) => setTaskForm((f) => ({ ...f, task_text: e.target.value }))}
                        placeholder="Walk for 10 minutes after eating"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="admin-field">
                      <label>Category</label>
                      <select value={taskForm.category} onChange={(e) => setTaskForm((f) => ({ ...f, category: e.target.value }))}>
                        {categoryOptions.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {taskForm.category === 'custom' ? (
                      <div className="admin-field">
                        <label>Custom category</label>
                        <input value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} placeholder="custom" />
                      </div>
                    ) : null}
                    <div className="admin-field">
                      <label>
                        <input
                          type="checkbox"
                          checked={Boolean(taskForm.active)}
                          onChange={(e) => setTaskForm((f) => ({ ...f, active: e.target.checked }))}
                        />{' '}
                        Active
                      </label>
                      <p className="admin-help">Inactive tasks won't be selected for new daily challenges.</p>
                    </div>

                    <div className="admin-field">
                      <label>Audience profiles (optional)</label>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {PROFILE_OPTIONS.map((p) => {
                          const selected = Array.isArray(taskForm.audience_profiles)
                            ? taskForm.audience_profiles.includes(p.key)
                            : false;
                          return (
                            <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setTaskForm((f) => {
                                    const current = Array.isArray(f.audience_profiles) ? [...f.audience_profiles] : [];
                                    const next = checked ? [...current, p.key] : current.filter((x) => x !== p.key);
                                    return { ...f, audience_profiles: next };
                                  });
                                }}
                              />
                              {p.label}
                            </label>
                          );
                        })}
                      </div>
                      <p className="admin-help">
                        If empty, the task is universal. If selected, only those profiles see it (unless excluded).
                      </p>
                    </div>

                    <div className="admin-field">
                      <label>Exclude profiles (optional)</label>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {PROFILE_OPTIONS.map((p) => {
                          const selected = Array.isArray(taskForm.exclude_profiles) ? taskForm.exclude_profiles.includes(p.key) : false;
                          return (
                            <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setTaskForm((f) => {
                                    const current = Array.isArray(f.exclude_profiles) ? [...f.exclude_profiles] : [];
                                    const next = checked ? [...current, p.key] : current.filter((x) => x !== p.key);
                                    return { ...f, exclude_profiles: next };
                                  });
                                }}
                              />
                              {p.label}
                            </label>
                          );
                        })}
                      </div>
                      <p className="admin-help">Exclude always wins. Use this to block tasks for specific profiles.</p>
                    </div>
                  </div>
                </div>

                <div className="admin-actions" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
                  <button
                    className="admin-button"
                    type="button"
                    onClick={() => {
                      try {
                        upsertLocal();
                      } catch (error) {
                        alert(error?.message || 'Invalid task.');
                      }
                    }}
                  >
                    Save locally
                  </button>
                  <button className="admin-button secondary" type="button" onClick={closeEditor}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div className="admin-toolbar-grid" style={{ marginTop: 12 }}>
            <div className="admin-toolbar-search" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <input className="admin-search-input" type="date" value={snapDate} onChange={(e) => setSnapDate(e.target.value)} />
              <input
                className="admin-search-input"
                value={snapUserId}
                onChange={(e) => setSnapUserId(e.target.value)}
                placeholder="User ID (optional)"
                style={{ maxWidth: 220 }}
              />
              <label className="admin-help" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={snapCompletedOnly} onChange={(e) => setSnapCompletedOnly(e.target.checked)} />
                Completed only
              </label>
              <label className="admin-help" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={snapIncludeTasks} onChange={(e) => setSnapIncludeTasks(e.target.checked)} />
                Include tasks
              </label>
            </div>
            <div className="admin-toolbar-actions" style={{ justifyContent: 'flex-end' }}>
              <select className="admin-search-input" value={snapPageSize} onChange={(e) => setSnapPageSize(Number(e.target.value))}>
                {[25, 50, 100, 200].map((n) => (
                  <option key={n} value={n}>
                    {n} / page
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="admin-table-wrap" style={{ marginTop: 12 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ width: 120 }}>Date</th>
                  <th style={{ width: 90 }}>User</th>
                  <th>Email</th>
                  <th style={{ width: 120 }}>Progress</th>
                  <th style={{ width: 160 }}>Completed at</th>
                  <th style={{ width: 160 }}>Updated</th>
                  <th style={{ width: 90 }} />
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s) => (
                  <tr key={s.id}>
                    <td className="admin-mono">{s.date}</td>
                    <td className="admin-mono">{s.user_id}</td>
                    <td>{s.user_email || ''}</td>
                    <td className="admin-mono">
                      {s.completed_count}/{s.total_tasks}
                    </td>
                    <td className="admin-mono">{s.completed_at || ''}</td>
                    <td className="admin-mono">{s.updated_at || ''}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="admin-link"
                        type="button"
                        disabled={!Array.isArray(s.tasks) || s.tasks.length === 0}
                        onClick={() => setSelectedSnapshot(s)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
                {snapshots.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="admin-muted">
                      No snapshots found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="admin-pagination">
            <button className="admin-button secondary" type="button" disabled={snapPage <= 1} onClick={() => setSnapPage(1)}>
              First
            </button>
            <button
              className="admin-button secondary"
              type="button"
              disabled={snapPage <= 1}
              onClick={() => setSnapPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </button>
            <div className="admin-muted">
              Page {snapPage} - {snapshotsTotal} total
            </div>
            <button
              className="admin-button secondary"
              type="button"
              disabled={snapshots.length < snapPageSize}
              onClick={() => setSnapPage((p) => p + 1)}
            >
              Next
            </button>
          </div>

          {selectedSnapshot ? (
            <div className="admin-modal-backdrop" role="presentation" onClick={() => setSelectedSnapshot(null)}>
              <div className="admin-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                <div className="admin-modal-header">
                  <div>
                    <div className="admin-card-title">Snapshot tasks</div>
                    <div className="admin-muted">
                      Date {selectedSnapshot.date} - User {selectedSnapshot.user_id}
                    </div>
                  </div>
                  <button className="admin-button secondary" type="button" onClick={() => setSelectedSnapshot(null)}>
                    Close
                  </button>
                </div>

                <div className="admin-table-wrap" style={{ marginTop: 12 }}>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th style={{ width: 90 }}>Done</th>
                        <th style={{ width: 220 }}>ID</th>
                        <th>Task</th>
                        <th style={{ width: 180 }}>Category</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(Array.isArray(selectedSnapshot.tasks) ? selectedSnapshot.tasks : []).map((t) => (
                        <tr key={t.id}>
                          <td>{t.completed ? 'Yes' : 'No'}</td>
                          <td className="admin-mono">{t.id}</td>
                          <td>{t.text}</td>
                          <td className="admin-mono">{t.category || 'general'}</td>
                        </tr>
                      ))}
                      {!Array.isArray(selectedSnapshot.tasks) || selectedSnapshot.tasks.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="admin-muted">
                            No task details. Enable "Include tasks" and refresh.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

