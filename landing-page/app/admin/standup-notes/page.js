'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import EmptyState from '../ui/EmptyState';
import LoadingState from '../ui/LoadingState';
import DataTable from '../ui/DataTable';
import { adminFetch, clearAdminTokens } from '../lib/adminAuth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

function hasPermission(permissions, required) {
  if (!required) return true;
  const perms = Array.isArray(permissions) ? permissions : [];
  if (perms.includes('*')) return true;
  if (Array.isArray(required)) return required.some((r) => perms.includes(r));
  return perms.includes(required);
}

function toLocalInputValue(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return '';
  }
}

function fromLocalInputValue(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  try {
    const d = new Date(s);
    if (!Number.isFinite(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

function statusBadge(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'published') return { label: 'published', tone: 'success' };
  return { label: 'draft', tone: 'secondary' };
}

function isActiveNow(note) {
  try {
    const now = Date.now();
    const fromIso = note?.visible_from;
    const untilIso = note?.visible_until;
    const from = fromIso ? new Date(fromIso).getTime() : null;
    const until = untilIso ? new Date(untilIso).getTime() : null;
    if (from !== null && Number.isFinite(from) && now < from) return false;
    if (until !== null && Number.isFinite(until) && now > until) return false;
    return String(note?.status || '').toLowerCase() === 'published' && !note?.is_deleted;
  } catch {
    return false;
  }
}

function targetSummary(note) {
  if (note?.target_all) return 'All staff';
  const roles = Array.isArray(note?.target_role_keys) ? note.target_role_keys : [];
  const staffIds = Array.isArray(note?.target_staff_user_ids) ? note.target_staff_user_ids : [];
  if (roles.length) return `Roles: ${roles.join(', ')}`;
  if (staffIds.length) return `Staff: ${staffIds.length}`;
  return 'No target';
}

export default function StandupNotesPage() {
  const router = useRouter();

  const [session, setSession] = useState(null);
  const permissions = Array.isArray(session?.permissions) ? session.permissions : [];
  const canManage = hasPermission(permissions, 'dashboard_notes.manage');

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [items, setItems] = useState([]);
  const [includeDeleted, setIncludeDeleted] = useState(false);

  const [picklists, setPicklists] = useState({ roles: [], staff: [] });

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [visibleFrom, setVisibleFrom] = useState('');
  const [visibleUntil, setVisibleUntil] = useState('');

  const [targetMode, setTargetMode] = useState('all'); // all | roles | staff
  const [targetRoles, setTargetRoles] = useState([]);
  const [targetStaffIds, setTargetStaffIds] = useState([]);

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

  const loadPicklists = useCallback(async () => {
    const r = await safeJson(`${API_URL}/api/admin/dashboard-notes/picklists`);
    if (!r.ok) return;
    setPicklists({
      roles: Array.isArray(r?.data?.roles) ? r.data.roles : [],
      staff: Array.isArray(r?.data?.staff) ? r.data.staff : [],
    });
  }, [safeJson]);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage('');
    await loadSession();
    if (!canManage) {
      setItems([]);
      setLoading(false);
      return;
    }
    await loadPicklists();
    const r = await safeJson(
      `${API_URL}/api/admin/dashboard-notes?limit=200&offset=0&include_deleted=${includeDeleted ? '1' : '0'}`
    );
    if (!r.ok) {
      setItems([]);
      if (r.status !== 401) setMessage(r?.data?.detail || r?.error || 'Failed to load notes.');
      setLoading(false);
      return;
    }
    setItems(Array.isArray(r?.data?.items) ? r.data.items : []);
    setLoading(false);
  }, [canManage, includeDeleted, loadPicklists, loadSession, safeJson]);

  useEffect(() => {
    load();
  }, [load]);

  const resetEditor = useCallback(() => {
    setEditing(null);
    setTitle('');
    setBody('');
    setMeetingUrl('');
    setVisibleFrom('');
    setVisibleUntil('');
    setTargetMode('all');
    setTargetRoles([]);
    setTargetStaffIds([]);
  }, []);

  const openCreate = () => {
    resetEditor();
    const now = new Date();
    const twoHours = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    setVisibleFrom(toLocalInputValue(now.toISOString()));
    setVisibleUntil(toLocalInputValue(twoHours.toISOString()));
    setEditorOpen(true);
  };

  const openEdit = (row) => {
    resetEditor();
    setEditing(row);
    setTitle(String(row?.title || ''));
    setBody(String(row?.body || ''));
    setMeetingUrl(String(row?.meeting_url || ''));
    setVisibleFrom(toLocalInputValue(row?.visible_from));
    setVisibleUntil(toLocalInputValue(row?.visible_until));
    if (row?.target_all) {
      setTargetMode('all');
    } else if (Array.isArray(row?.target_role_keys) && row.target_role_keys.length) {
      setTargetMode('roles');
      setTargetRoles(row.target_role_keys);
    } else {
      setTargetMode('staff');
      setTargetStaffIds(Array.isArray(row?.target_staff_user_ids) ? row.target_staff_user_ids.map((x) => String(x)) : []);
    }
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    resetEditor();
  };

  const buildPayload = useCallback(() => {
    return {
      title: title.trim(),
      body: body.trim(),
      meeting_url: meetingUrl.trim() || null,
      visible_from: fromLocalInputValue(visibleFrom),
      visible_until: fromLocalInputValue(visibleUntil),
      target_all: targetMode === 'all',
      target_role_keys: targetMode === 'roles' ? targetRoles : [],
      target_staff_user_ids: targetMode === 'staff' ? targetStaffIds.map((x) => Number(x)).filter(Boolean) : [],
    };
  }, [body, meetingUrl, targetMode, targetRoles, targetStaffIds, title, visibleFrom, visibleUntil]);

  const saveDraft = async () => {
    if (!canManage) return;
    setMessage('');
    try {
      const payload = buildPayload();
      const url = editing?.id ? `${API_URL}/api/admin/dashboard-notes/${editing.id}` : `${API_URL}/api/admin/dashboard-notes`;
      const method = editing?.id ? 'PATCH' : 'POST';
      const r = await safeJson(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(r?.data?.detail || r?.error || 'Failed to save note.');

      closeEditor();
      load();
    } catch (e) {
      setMessage(e?.message || 'Failed to save note.');
    }
  };

  const saveAndPublish = async () => {
    if (!canManage) return;
    setMessage('');
    try {
      const payload = buildPayload();
      const url = editing?.id ? `${API_URL}/api/admin/dashboard-notes/${editing.id}` : `${API_URL}/api/admin/dashboard-notes`;
      const method = editing?.id ? 'PATCH' : 'POST';
      const r = await safeJson(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(r?.data?.detail || r?.error || 'Failed to save note.');

      const noteId = Number(editing?.id || r?.data?.item?.id);
      if (noteId) {
        const pr = await safeJson(`${API_URL}/api/admin/dashboard-notes/${noteId}/publish`, { method: 'POST' });
        if (!pr.ok) throw new Error(pr?.data?.detail || pr?.error || 'Saved, but failed to publish.');
      }

      closeEditor();
      load();
    } catch (e) {
      setMessage(e?.message || 'Failed to save note.');
    }
  };

  const publish = async (id) => {
    if (!canManage) return;
    setMessage('');
    try {
      const r = await safeJson(`${API_URL}/api/admin/dashboard-notes/${id}/publish`, { method: 'POST' });
      if (!r.ok) throw new Error(r?.data?.detail || r?.error || 'Failed to publish.');
      load();
    } catch (e) {
      setMessage(e?.message || 'Failed to publish.');
    }
  };

  const draft = async (id) => {
    if (!canManage) return;
    setMessage('');
    try {
      const r = await safeJson(`${API_URL}/api/admin/dashboard-notes/${id}/draft`, { method: 'POST' });
      if (!r.ok) throw new Error(r?.data?.detail || r?.error || 'Failed to revert to draft.');
      load();
    } catch (e) {
      setMessage(e?.message || 'Failed to revert to draft.');
    }
  };

  const softDelete = async (id) => {
    if (!canManage) return;
    if (!confirm('Delete this note? It will no longer show on dashboards.')) return;
    setMessage('');
    try {
      const r = await safeJson(`${API_URL}/api/admin/dashboard-notes/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(r?.data?.detail || r?.error || 'Failed to delete.');
      load();
    } catch (e) {
      setMessage(e?.message || 'Failed to delete.');
    }
  };

  const columns = useMemo(
    () => [
      { key: 'title', header: 'Title', accessor: (r) => r?.title || '' },
      {
        key: 'status',
        header: 'Status',
        accessor: (r) => r?.status || '',
        render: (r) => {
          const b = statusBadge(r?.status);
          return <span className={`admin-badge ${b.tone}`}>{b.label}</span>;
        },
      },
      {
        key: 'active_now',
        header: 'Active now',
        sortable: false,
        accessor: (r) => (isActiveNow(r) ? 'yes' : 'no'),
        render: (r) => <span className={`admin-badge ${isActiveNow(r) ? 'success' : 'secondary'}`}>{isActiveNow(r) ? 'yes' : 'no'}</span>,
      },
      {
        key: 'window',
        header: 'Window',
        sortable: false,
        accessor: (r) => `${r?.visible_from || ''} ${r?.visible_until || ''}`,
        render: (r) => {
          const from = r?.visible_from ? new Date(r.visible_from).toLocaleString() : 'now';
          const until = r?.visible_until ? new Date(r.visible_until).toLocaleString() : 'no expiry';
          return (
            <div className="admin-help" style={{ margin: 0 }}>
              {from} → {until}
            </div>
          );
        },
      },
      { key: 'targets', header: 'Target', sortable: false, accessor: (r) => targetSummary(r) },
      {
        key: 'actions',
        header: 'Actions',
        sortable: false,
        searchable: false,
        render: (r) => {
          const isDeleted = Boolean(r?.is_deleted);
          const st = String(r?.status || '').toLowerCase();
          return (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="admin-button secondary" type="button" onClick={() => openEdit(r)} disabled={isDeleted}>
                Edit
              </button>
              {st !== 'published' ? (
                <button className="admin-button" type="button" onClick={() => publish(r.id)} disabled={isDeleted}>
                  Publish
                </button>
              ) : (
                <button className="admin-button warning" type="button" onClick={() => draft(r.id)} disabled={isDeleted}>
                  Draft
                </button>
              )}
              <button className="admin-button danger" type="button" onClick={() => softDelete(r.id)} disabled={isDeleted}>
                Delete
              </button>
            </div>
          );
        },
      },
    ],
    [draft, publish, softDelete]
  );

  return (
    <div className="admin-page">
      <div className="admin-card">
        <h2 className="admin-title">Standup Notes</h2>
        <p className="admin-subtitle">
          Smart sticky notes shown on the staff dashboard within a time window. Publish to make it visible.
        </p>
        <div className="admin-help" style={{ marginTop: 6 }}>
          Tip: set “Show from” earlier than the meeting time so staff see it ahead of the standup.
        </div>

        {message ? <div className="admin-alert warning">{message}</div> : null}

        <div className="admin-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="admin-actions">
            {canManage ? (
              <button className="admin-button" type="button" onClick={openCreate} disabled={loading}>
                New note
              </button>
            ) : null}
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={includeDeleted} onChange={(e) => setIncludeDeleted(e.target.checked)} />
              Include deleted
            </label>
            <button className="admin-button info" type="button" onClick={load} disabled={loading}>
              Refresh
            </button>
          </div>
          <Link className="admin-link" href="/admin/dashboard">
            View dashboard
          </Link>
        </div>
      </div>

      <div className="admin-card" style={{ marginTop: 16 }}>
        {loading ? (
          <LoadingState label="Loading notes..." />
        ) : !canManage ? (
          <EmptyState title="Permission required" body="Admin/HR can manage standup notes." />
        ) : items.length === 0 ? (
          <EmptyState title="No notes yet" body="Create a note to announce a standup meeting or reminder." />
        ) : (
          <DataTable
            columns={columns}
            rows={items}
            getRowId={(r) => r.id}
            initialPageSize={10}
            pageSizeOptions={[5, 10, 20, 50]}
            searchPlaceholder="Search notes..."
          />
        )}
      </div>

      {editorOpen ? (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-label="Standup note editor" onClick={closeEditor}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>{editing?.id ? 'Edit note' : 'New note'}</h3>
              <button className="admin-icon-button danger" type="button" aria-label="Close" onClick={closeEditor}>
                ×
              </button>
            </div>
            <div className="admin-modal-body">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  saveDraft();
                }}
              >
                <div className="admin-field">
                  <label>Title</label>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} required />
                </div>
                <div className="admin-field">
                  <label>Note</label>
                  <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={8000} required />
                </div>
                <div className="admin-field">
                  <label>Meeting link (optional)</label>
                  <input value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} placeholder="https://..." />
                </div>

                <div className="admin-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                  <div className="admin-field">
                    <label>Show from</label>
                    <input type="datetime-local" value={visibleFrom} onChange={(e) => setVisibleFrom(e.target.value)} />
                  </div>
                  <div className="admin-field">
                    <label>Show until</label>
                    <input type="datetime-local" value={visibleUntil} onChange={(e) => setVisibleUntil(e.target.value)} />
                  </div>
                </div>

                <div className="admin-card" style={{ padding: 12, marginTop: 12 }}>
                  <h4 style={{ marginTop: 0 }}>Target</h4>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="radio" name="targetMode" checked={targetMode === 'all'} onChange={() => setTargetMode('all')} />
                      All staff
                    </label>
                    <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="radio" name="targetMode" checked={targetMode === 'roles'} onChange={() => setTargetMode('roles')} />
                      By role
                    </label>
                    <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="radio" name="targetMode" checked={targetMode === 'staff'} onChange={() => setTargetMode('staff')} />
                      Specific staff
                    </label>
                  </div>

                  {targetMode === 'roles' ? (
                    <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {(picklists.roles || []).map((r) => (
                        <label key={r.key} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <input
                            type="checkbox"
                            checked={targetRoles.includes(r.key)}
                            onChange={(e) => {
                              setTargetRoles((prev) => {
                                const set = new Set(prev);
                                if (e.target.checked) set.add(r.key);
                                else set.delete(r.key);
                                return Array.from(set);
                              });
                            }}
                          />
                          <span>{r.name}</span>
                        </label>
                      ))}
                    </div>
                  ) : null}

                  {targetMode === 'staff' ? (
                    <div className="admin-field" style={{ marginTop: 10 }}>
                      <label>Staff</label>
                      <select
                        multiple
                        value={targetStaffIds}
                        onChange={(e) => setTargetStaffIds(Array.from(e.target.selectedOptions).map((o) => o.value))}
                        style={{ minHeight: 140 }}
                      >
                        {(picklists.staff || []).map((s) => {
                          const label = (String(s.full_name || '').trim() || String(s.email || '').trim() || `Staff ${s.id}`).slice(0, 120);
                          return (
                            <option key={s.id} value={String(s.id)}>
                              {label}
                            </option>
                          );
                        })}
                      </select>
                      <p className="admin-help" style={{ marginTop: 6 }}>
                        Hold Ctrl (Windows) / Cmd (Mac) to select multiple.
                      </p>
                    </div>
                  ) : null}
                </div>

                <div className="admin-actions" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
                  <button className="admin-button secondary" type="button" onClick={closeEditor}>
                    Cancel
                  </button>
                  <button className="admin-button secondary" type="button" onClick={saveDraft} disabled={!title.trim() || !body.trim()}>
                    Save draft
                  </button>
                  <button className="admin-button" type="button" onClick={saveAndPublish} disabled={!title.trim() || !body.trim()}>
                    Save &amp; publish
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
