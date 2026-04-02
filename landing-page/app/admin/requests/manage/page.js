'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import DataTable from '../../ui/DataTable';
import LoadingState from '../../ui/LoadingState';
import EmptyState from '../../ui/EmptyState';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

const TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'day_off', label: 'Day off' },
  { value: 'annual_leave', label: 'Annual leave' },
  { value: 'sick_leave', label: 'Sick leave' },
  { value: 'training', label: 'Training' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All status' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

function typeLabel(v) {
  return TYPE_OPTIONS.find((x) => x.value === v)?.label || v;
}

function statusTone(s) {
  const v = String(s || '').toLowerCase();
  if (v === 'approved') return 'success';
  if (v === 'rejected') return 'danger';
  if (v === 'pending') return 'warning';
  return 'secondary';
}

function formatDate(iso) {
  if (!iso) return '—';
  return String(iso).slice(0, 10);
}

function parseYMD(value) {
  const parts = String(value || '').split('-').map((x) => Number(x));
  if (parts.length !== 3 || parts.some((x) => !Number.isFinite(x))) return null;
  const [y, m, d] = parts;
  return new Date(y, m - 1, d);
}

function rangeHasWeekend(startYmd, endYmd) {
  const start = parseYMD(startYmd);
  const end = parseYMD(endYmd);
  if (!start) return false;
  const to = end || start;
  const d = new Date(start.getTime());
  while (d <= to) {
    const day = d.getDay(); // 0 Sun ... 6 Sat
    if (day === 0 || day === 6) return true;
    d.setDate(d.getDate() + 1);
  }
  return false;
}

export default function ManageRequestsPage() {
  const router = useRouter();
  const token = useMemo(() => (typeof window === 'undefined' ? null : localStorage.getItem('adminToken')), []);
  const [session, setSession] = useState(null);
  const permissions = Array.isArray(session?.permissions) ? session.permissions : [];
  const canManage = permissions.includes('*') || permissions.includes('requests.manage');

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null); // { tone, text }
  const showNotice = (tone, text) => setNotice({ tone: tone || 'info', text: String(text || '').trim() });
  const clearNotice = () => setNotice(null);

  const [query, setQuery] = useState('');

  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterStaffId, setFilterStaffId] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);

  const [staffUsers, setStaffUsers] = useState([]);
  const staffMap = useMemo(() => {
    const m = new Map();
    (Array.isArray(staffUsers) ? staffUsers : []).forEach((u) => {
      m.set(String(u.id), u.full_name ? `${u.full_name} (${u.email})` : u.email);
    });
    return m;
  }, [staffUsers]);

  const [viewOpen, setViewOpen] = useState(false);
  const [viewItem, setViewItem] = useState(null);
  const [viewAuditLoading, setViewAuditLoading] = useState(false);
  const [viewAuditItems, setViewAuditItems] = useState([]);

  const [decideOpen, setDecideOpen] = useState(false);
  const [decideId, setDecideId] = useState(null);
  const [decideStatus, setDecideStatus] = useState('approved');
  const [decideComment, setDecideComment] = useState('');
  const [deciding, setDeciding] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editType, setEditType] = useState('day_off');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editDetails, setEditDetails] = useState('');
  const [editing, setEditing] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createStaffId, setCreateStaffId] = useState('');
  const [createType, setCreateType] = useState('day_off');
  const [createStart, setCreateStart] = useState('');
  const [createEnd, setCreateEnd] = useState('');
  const [createDetails, setCreateDetails] = useState('');
  const [createStatus, setCreateStatus] = useState('pending');
  const [creating, setCreating] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('Confirm');
  const [confirmBody, setConfirmBody] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);

  const openConfirm = ({ title, body, onConfirm }) => {
    setConfirmTitle(title || 'Confirm');
    setConfirmBody(body || '');
    setConfirmAction(() => onConfirm);
    setConfirmOpen(true);
  };
  const closeConfirm = () => {
    setConfirmOpen(false);
    setConfirmTitle('Confirm');
    setConfirmBody('');
    setConfirmAction(null);
  };
  const runConfirm = async () => {
    const fn = confirmAction;
    closeConfirm();
    if (typeof fn === 'function') await fn();
  };

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
    if (!token || !canManage) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/staff/users`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setStaffUsers(Array.isArray(data.items) ? data.items : []);
    } catch {
      // ignore
    }
  };

  const load = async () => {
    if (!token || !canManage) return;
    setLoading(true);
    clearNotice();
    try {
      const params = new URLSearchParams();
      if (filterType) params.set('type_filter', filterType);
      if (filterStatus) params.set('status_filter', filterStatus);
      if (filterStaffId) params.set('staff_user_id', filterStaffId);
      params.set('include_deleted', showDeleted ? '1' : '0');
      const res = await fetch(`${API_URL}/api/admin/requests?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load requests.');
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setItems([]);
      showNotice('danger', e?.message || 'Failed to load requests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!canManage) return;
    loadStaff();
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, filterType, filterStatus, filterStaffId, showDeleted]);

  const filteredItems = useMemo(() => {
    const q = String(query || '').trim().toLowerCase();
    const base = Array.isArray(items) ? items : [];
    if (!q) return base;
    return base.filter((r) => {
      const staff = staffMap.get(String(r.staff_user_id || '')) || '';
      const hay = [
        String(r.id || ''),
        staff,
        String(r.type || ''),
        typeLabel(r.type),
        String(r.status || ''),
        String(r.details || ''),
      ]
        .join(' | ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [items, query, staffMap]);

  const openDecide = (r, nextStatus) => {
    setDecideId(r?.id || null);
    setDecideStatus(nextStatus);
    setDecideComment('');
    setDecideOpen(true);
  };

  const closeDecide = () => {
    setDecideOpen(false);
    setDecideId(null);
    setDecideStatus('approved');
    setDecideComment('');
    setDeciding(false);
  };

  const decide = async () => {
    if (!token || !canManage || !decideId) return;
    setDeciding(true);
    clearNotice();
    try {
      const res = await fetch(`${API_URL}/api/admin/requests/${decideId}/decide`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: decideStatus, comment: decideComment ? decideComment : null }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error(data.detail || 'Failed to update request.');
      closeDecide();
      showNotice('success', 'Updated.');
      load();
      try {
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('admin-requests-updated'));
      } catch {
        // ignore
      }
    } catch (e) {
      showNotice('danger', e?.message || 'Failed to update request.');
    } finally {
      setDeciding(false);
    }
  };

  const del = async (id) => {
    if (!token || !canManage || !id) return;
    clearNotice();
    try {
      const res = await fetch(`${API_URL}/api/admin/requests/${id}/delete`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error(data.detail || 'Failed to delete.');
      showNotice('success', 'Deleted.');
      load();
      try {
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('admin-requests-updated'));
      } catch {
        // ignore
      }
    } catch (e) {
      showNotice('danger', e?.message || 'Failed to delete.');
    }
  };

  const restore = async (id) => {
    if (!token || !canManage || !id) return;
    clearNotice();
    try {
      const res = await fetch(`${API_URL}/api/admin/requests/${id}/restore`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error(data.detail || 'Failed to restore.');
      showNotice('success', 'Restored.');
      load();
      try {
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('admin-requests-updated'));
      } catch {
        // ignore
      }
    } catch (e) {
      showNotice('danger', e?.message || 'Failed to restore.');
    }
  };

  const downloadCsv = async () => {
    if (!token || !canManage) return;
    const params = new URLSearchParams();
    if (filterType) params.set('type_filter', filterType);
    if (filterStatus) params.set('status_filter', filterStatus);
    if (filterStaffId) params.set('staff_user_id', filterStaffId);
    params.set('include_deleted', showDeleted ? '1' : '0');
    const url = `${API_URL}/api/admin/requests/export.csv?${params.toString()}`;
    clearNotice();
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to export CSV.');
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = 'requests.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      showNotice('danger', e?.message || 'Failed to export CSV.');
    }
  };

  const openEdit = (r) => {
    if (!r?.id) return;
    setEditId(r.id);
    setEditType(String(r.type || 'day_off'));
    setEditStart(formatDate(r.start_date) === '—' ? '' : formatDate(r.start_date));
    setEditEnd(formatDate(r.end_date) === '—' ? '' : formatDate(r.end_date));
    setEditDetails(String(r.details || ''));
    setEditOpen(true);
  };
  const closeEdit = () => {
    setEditOpen(false);
    setEditId(null);
    setEditType('day_off');
    setEditStart('');
    setEditEnd('');
    setEditDetails('');
    setEditing(false);
  };
  const saveEdit = async () => {
    if (!token || !canManage || !editId) return;
    if (!editStart) {
      showNotice('danger', 'Start date is required.');
      return;
    }
    if (rangeHasWeekend(editStart, editEnd || editStart)) {
      showNotice('danger', 'We don’t work on weekends (Sat/Sun). Please choose weekday dates.');
      return;
    }
    setEditing(true);
    clearNotice();
    try {
      const res = await fetch(`${API_URL}/api/admin/requests/${editId}/manage/update`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: editType, start_date: editStart, end_date: editEnd ? editEnd : null, details: editDetails ? editDetails : null }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error(data.detail || 'Failed to update.');
      closeEdit();
      showNotice('success', 'Updated.');
      load();
      try {
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('admin-requests-updated'));
      } catch {
        // ignore
      }
    } catch (e) {
      showNotice('danger', e?.message || 'Failed to update.');
    } finally {
      setEditing(false);
    }
  };

  const openCreate = () => {
    setCreateStaffId('');
    setCreateType('day_off');
    setCreateStart('');
    setCreateEnd('');
    setCreateDetails('');
    setCreateStatus('pending');
    setCreateOpen(true);
  };

  const openView = (r) => {
    setViewItem(r || null);
    setViewOpen(true);
    if (r?.id) loadAudit(r.id);
  };
  const closeView = () => {
    setViewOpen(false);
    setViewItem(null);
    setViewAuditLoading(false);
    setViewAuditItems([]);
  };

  const loadAudit = async (id) => {
    if (!token || !canManage || !id) return;
    setViewAuditLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/requests/${id}/audit`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) return;
      const data = await res.json().catch(() => ({}));
      if (res.ok) setViewAuditItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setViewAuditItems([]);
    } finally {
      setViewAuditLoading(false);
    }
  };
  const closeCreate = () => {
    setCreateOpen(false);
    setCreating(false);
  };
  const create = async () => {
    if (!token || !canManage) return;
    if (!createStaffId || !createStart) {
      showNotice('danger', 'Staff and start date are required.');
      return;
    }
    if (rangeHasWeekend(createStart, createEnd || createStart)) {
      showNotice('danger', 'We don’t work on weekends (Sat/Sun). Please choose weekday dates.');
      return;
    }
    setCreating(true);
    clearNotice();
    try {
      const res = await fetch(`${API_URL}/api/admin/requests/manage/create`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_user_id: Number(createStaffId),
          type: createType,
          start_date: createStart,
          end_date: createEnd ? createEnd : null,
          details: createDetails ? createDetails : null,
          status: createStatus,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error(data.detail || 'Failed to create.');
      closeCreate();
      showNotice('success', 'Created.');
      load();
      try {
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('admin-requests-updated'));
      } catch {
        // ignore
      }
    } catch (e) {
      showNotice('danger', e?.message || 'Failed to create.');
    } finally {
      setCreating(false);
    }
  };

  if (!canManage) {
    return (
      <div className="admin-page">
        <div className="admin-card">
          <h2 className="admin-title">Manage Requests</h2>
          <p className="admin-subtitle">You don’t have access to manage requests.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-card">
        <div className="admin-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="admin-title" style={{ marginBottom: 0 }}>
            Manage Requests
          </h2>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="admin-button secondary" type="button" onClick={downloadCsv}>
              Export CSV
            </button>
            <button className="admin-button info" type="button" onClick={openCreate}>
              Create request
            </button>
          </div>
        </div>
        {notice?.text && notice?.tone !== 'danger' ? (
          <div
            className={`admin-alert ${notice.tone || 'info'}`}
            style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}
          >
            <div style={{ whiteSpace: 'pre-wrap' }}>{notice.text}</div>
            <button
              type="button"
              onClick={clearNotice}
              aria-label="Close"
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0 }}
            >
              ×
            </button>
          </div>
        ) : null}
      </div>

      <div className="admin-card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Filters</h3>
        <div className="admin-toolbar-grid" style={{ marginTop: 12 }}>
          <div className="admin-toolbar-search">
            <input className="admin-search-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search requests..." />
          </div>
          <div className="admin-toolbar-filters">
            <select className="admin-filter-select" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select className="admin-filter-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select className="admin-filter-select" value={filterStaffId} onChange={(e) => setFilterStaffId(e.target.value)}>
              <option value="">Any staff</option>
              {staffUsers.map((u) => (
                <option key={u.id} value={String(u.id)}>
                  {u.full_name ? `${u.full_name} (${u.email})` : u.email}
                </option>
              ))}
            </select>
          </div>
          <div className="admin-toolbar-actions" style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} /> Show deleted
            </label>
          </div>
        </div>
      </div>

      <div className="admin-card" style={{ marginTop: 16 }}>
        {loading ? (
          <LoadingState label="Loading requests..." />
        ) : filteredItems.length === 0 ? (
          <EmptyState title="No requests" body="No staff requests match these filters." />
        ) : (
          <DataTable
            items={filteredItems}
            rowKey={(r) => String(r.id)}
            pageSize={12}
            showSearch={false}
            columns={[
              { key: 'id', header: '#', sortable: true, filterable: false, searchable: false, accessor: (r) => String(r.id), width: 80 },
              {
                key: 'staff',
                header: 'Staff',
                sortable: true,
                filterable: true,
                searchable: true,
                accessor: (r) => staffMap.get(String(r.staff_user_id || '')) || String(r.staff_user_id || ''),
                sortValue: (r) => staffMap.get(String(r.staff_user_id || '')) || String(r.staff_user_id || ''),
              },
              {
                key: 'type',
                header: 'Type',
                sortable: true,
                filterable: true,
                searchable: true,
                accessor: (r) => typeLabel(r.type),
                sortValue: (r) => String(r.type || ''),
              },
              {
                key: 'period',
                header: 'Period',
                sortable: true,
                filterable: false,
                searchable: false,
                accessor: (r) => `${formatDate(r.start_date)}${r.end_date ? ` → ${formatDate(r.end_date)}` : ''}`,
                sortValue: (r) => String(r.start_date || ''),
              },
              {
                key: 'status',
                header: 'Status',
                sortable: true,
                filterable: true,
                searchable: false,
                accessor: (r) => String(r.status || ''),
                render: (r) => <span className={`admin-badge ${statusTone(r.status)}`}>{String(r.status || '').replace(/_/g, ' ')}</span>,
              },
              {
                key: 'action',
                header: 'Action',
                sortable: false,
                filterable: false,
                searchable: false,
                width: 360,
                render: (r) => {
                  const isPending = String(r.status || '').toLowerCase() === 'pending';
                  const canEdit = ['draft', 'pending'].includes(String(r.status || '').toLowerCase());
                  const isDeleted = Boolean(r.deleted_at);
                  return (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="admin-button info" type="button" onClick={() => openView(r)}>
                        View
                      </button>
                      <button className="admin-button info" type="button" disabled={!canEdit || isDeleted} onClick={() => openEdit(r)}>
                        Edit
                      </button>
                      <button className="admin-button" type="button" disabled={!isPending || isDeleted} onClick={() => openDecide(r, 'approved')}>
                        Approve
                      </button>
                      <button className="admin-button warning" type="button" disabled={!isPending || isDeleted} onClick={() => openDecide(r, 'rejected')}>
                        Reject
                      </button>
                      <button
                        className="admin-button danger"
                        type="button"
                        disabled={isDeleted}
                        onClick={() => openConfirm({ title: 'Delete request?', body: 'This will soft-delete the request.', onConfirm: () => del(r.id) })}
                      >
                        Delete
                      </button>
                      {isDeleted ? (
                        <button className="admin-button secondary" type="button" onClick={() => restore(r.id)}>
                          Restore
                        </button>
                      ) : null}
                    </div>
                  );
                },
              },
            ]}
          />
        )}
      </div>

      {editOpen ? (
        <div className="admin-modal-backdrop" role="presentation" onClick={closeEdit}>
          <div className="admin-modal" role="dialog" aria-modal="true" aria-label="Edit request" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>Edit request</h3>
              <button className="admin-icon-button danger" type="button" aria-label="Close" onClick={closeEdit}>
                ×
              </button>
            </div>
            <div className="admin-modal-body">
              <p className="admin-subtitle" style={{ marginTop: 0 }}>
                Note: we don’t work on weekends. Requests cannot include Saturday/Sunday.
              </p>
              <div className="admin-field">
                <label>Type</label>
                <select value={editType} onChange={(e) => setEditType(e.target.value)}>
                  {TYPE_OPTIONS.filter((o) => o.value).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="admin-field" style={{ margin: 0 }}>
                  <label>Start date</label>
                  <input type="date" value={editStart} onChange={(e) => setEditStart(e.target.value)} />
                </div>
                <div className="admin-field" style={{ margin: 0 }}>
                  <label>End date (optional)</label>
                  <input type="date" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} />
                </div>
              </div>
              <div className="admin-field">
                <label>Details (optional)</label>
                <textarea value={editDetails} onChange={(e) => setEditDetails(e.target.value)} rows={5} placeholder="Details..." />
              </div>
            </div>
            <div className="admin-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="admin-button danger" type="button" onClick={closeEdit} disabled={editing}>
                Close
              </button>
              <button className="admin-button" type="button" onClick={saveEdit} disabled={editing || !editStart}>
                {editing ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {viewOpen && viewItem ? (
        <div className="admin-modal-backdrop" role="presentation" onClick={closeView}>
          <div className="admin-modal" role="dialog" aria-modal="true" aria-label="Request details" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>Request details</h3>
              <button className="admin-icon-button danger" type="button" aria-label="Close" onClick={closeView}>
                ×
              </button>
            </div>
            <div className="admin-modal-body">
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <span className={`admin-badge ${statusTone(viewItem.status)}`}>{String(viewItem.status || '').replace(/_/g, ' ')}</span>
                <span className="admin-badge secondary">{typeLabel(viewItem.type)}</span>
                <span className="admin-badge secondary">
                  {staffMap.get(String(viewItem.staff_user_id || '')) || `Staff #${viewItem.staff_user_id || '—'}`}
                </span>
                {viewItem.deleted_at ? <span className="admin-badge danger">Deleted</span> : null}
              </div>

              <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="admin-card admin-card--subtle" style={{ padding: 12 }}>
                  <p className="admin-subtitle" style={{ margin: 0 }}>
                    Start date
                  </p>
                  <p style={{ margin: '6px 0 0 0', fontWeight: 700 }}>{formatDate(viewItem.start_date)}</p>
                </div>
                <div className="admin-card admin-card--subtle" style={{ padding: 12 }}>
                  <p className="admin-subtitle" style={{ margin: 0 }}>
                    End date
                  </p>
                  <p style={{ margin: '6px 0 0 0', fontWeight: 700 }}>{viewItem.end_date ? formatDate(viewItem.end_date) : '—'}</p>
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <p className="admin-subtitle" style={{ margin: 0 }}>
                  Details
                </p>
                <div className="admin-card admin-card--subtle" style={{ padding: 12, marginTop: 8 }}>
                  <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{String(viewItem.details || '').trim() || '—'}</p>
                </div>
              </div>

              <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="admin-card admin-card--subtle" style={{ padding: 12 }}>
                  <p className="admin-subtitle" style={{ margin: 0 }}>
                    Submitted
                  </p>
                  <p style={{ margin: '6px 0 0 0', fontWeight: 700 }}>{viewItem.submitted_at ? formatDate(viewItem.submitted_at) : '—'}</p>
                </div>
                <div className="admin-card admin-card--subtle" style={{ padding: 12 }}>
                  <p className="admin-subtitle" style={{ margin: 0 }}>
                    Decision
                  </p>
                  <p style={{ margin: '6px 0 0 0', fontWeight: 700 }}>{viewItem.decided_at ? formatDate(viewItem.decided_at) : '—'}</p>
                </div>
              </div>

              {String(viewItem.decision_comment || '').trim() ? (
                <div style={{ marginTop: 12 }}>
                  <p className="admin-subtitle" style={{ margin: 0 }}>
                    Comment
                  </p>
                  <div className="admin-card" style={{ padding: 12, marginTop: 8, border: '1px solid rgba(25,118,210,0.22)', background: 'rgba(25,118,210,0.06)' }}>
                    <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{viewItem.decision_comment}</p>
                  </div>
                </div>
              ) : null}

              {(Array.isArray(viewItem.attachments) ? viewItem.attachments : []).length > 0 ? (
                <div style={{ marginTop: 12 }}>
                  <p className="admin-subtitle" style={{ margin: 0 }}>
                    Attachments
                  </p>
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {viewItem.attachments.map((a) => (
                      <div key={a.filename} className="admin-card admin-card--subtle" style={{ padding: 12, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.original_name || a.filename}</div>
                          <div className="admin-subtitle">{a.content_type || ''}</div>
                        </div>
                        <a className="admin-button info" href={a.url} target="_blank" rel="noreferrer">
                          Download
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div style={{ marginTop: 12 }}>
                <p className="admin-subtitle" style={{ margin: 0 }}>
                  History
                </p>
                {viewAuditLoading ? (
                  <div style={{ marginTop: 8 }}>
                    <LoadingState label="Loading history..." />
                  </div>
                ) : (Array.isArray(viewAuditItems) ? viewAuditItems : []).length === 0 ? (
                  <p className="admin-subtitle" style={{ marginTop: 8 }}>No history yet.</p>
                ) : (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {viewAuditItems.map((e) => (
                      <div key={e.id} className="admin-card admin-card--subtle" style={{ padding: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                          <div style={{ fontWeight: 700 }}>{String(e.action || '').replace('requests.', '').replace(/_/g, ' ')}</div>
                          <div className="admin-subtitle">{String(e.created_at || '').slice(0, 19).replace('T', ' ')}</div>
                        </div>
                        <div className="admin-subtitle" style={{ marginTop: 6 }}>
                          {e?.actor?.label || '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="admin-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="admin-button danger" type="button" onClick={closeView}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {createOpen ? (
        <div className="admin-modal-backdrop" role="presentation" onClick={closeCreate}>
          <div className="admin-modal" role="dialog" aria-modal="true" aria-label="Create request" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>Create request</h3>
              <button className="admin-icon-button danger" type="button" aria-label="Close" onClick={closeCreate}>
                ×
              </button>
            </div>
            <div className="admin-modal-body">
              <p className="admin-subtitle" style={{ marginTop: 0 }}>
                Note: we don’t work on weekends. Requests cannot include Saturday/Sunday.
              </p>
              <div className="admin-field">
                <label>Staff</label>
                <select value={createStaffId} onChange={(e) => setCreateStaffId(e.target.value)}>
                  <option value="">Select staff...</option>
                  {staffUsers.map((u) => (
                    <option key={u.id} value={String(u.id)}>
                      {u.full_name ? `${u.full_name} (${u.email})` : u.email}
                    </option>
                  ))}
                </select>
              </div>
              <div className="admin-field">
                <label>Status</label>
                <select value={createStatus} onChange={(e) => setCreateStatus(e.target.value)}>
                  <option value="pending">Pending</option>
                  <option value="draft">Draft</option>
                </select>
              </div>
              <div className="admin-field">
                <label>Type</label>
                <select value={createType} onChange={(e) => setCreateType(e.target.value)}>
                  {TYPE_OPTIONS.filter((o) => o.value).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="admin-field" style={{ margin: 0 }}>
                  <label>Start date</label>
                  <input type="date" value={createStart} onChange={(e) => setCreateStart(e.target.value)} />
                </div>
                <div className="admin-field" style={{ margin: 0 }}>
                  <label>End date (optional)</label>
                  <input type="date" value={createEnd} onChange={(e) => setCreateEnd(e.target.value)} />
                </div>
              </div>
              <div className="admin-field">
                <label>Details (optional)</label>
                <textarea value={createDetails} onChange={(e) => setCreateDetails(e.target.value)} rows={5} placeholder="Details..." />
              </div>
            </div>
            <div className="admin-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="admin-button danger" type="button" onClick={closeCreate} disabled={creating}>
                Close
              </button>
              <button className="admin-button info" type="button" onClick={create} disabled={creating || !createStaffId || !createStart}>
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {decideOpen ? (
        <div className="admin-modal-backdrop" role="presentation" onClick={closeDecide}>
          <div className="admin-modal" role="dialog" aria-modal="true" aria-label="Decide request" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>{decideStatus === 'approved' ? 'Approve request' : 'Reject request'}</h3>
              <button className="admin-icon-button danger" type="button" aria-label="Close" onClick={closeDecide}>
                ×
              </button>
            </div>
            <div className="admin-modal-body">
              <div className="admin-field">
                <label>Comment (optional)</label>
                <textarea value={decideComment} onChange={(e) => setDecideComment(e.target.value)} rows={4} placeholder="Add a note to the staff member..." />
              </div>
            </div>
            <div className="admin-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="admin-button danger" type="button" onClick={closeDecide} disabled={deciding}>
                Close
              </button>
              <button className="admin-button" type="button" onClick={decide} disabled={deciding}>
                {deciding ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmOpen ? (
        <div className="admin-modal-backdrop" role="presentation" onClick={closeConfirm}>
          <div className="admin-modal" role="dialog" aria-modal="true" aria-label="Confirm action" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>{confirmTitle}</h3>
              <button className="admin-icon-button danger" type="button" aria-label="Close" onClick={closeConfirm}>
                ×
              </button>
            </div>
            <div className="admin-modal-body">
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{confirmBody}</p>
            </div>
            <div className="admin-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="admin-button secondary" type="button" onClick={closeConfirm}>
                Cancel
              </button>
              <button className="admin-button danger" type="button" onClick={runConfirm}>
                Yes, continue
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {notice?.text && notice?.tone === 'danger' ? (
        <div className="admin-modal-backdrop" role="presentation" onClick={clearNotice}>
          <div className="admin-modal" role="dialog" aria-modal="true" aria-label="Error" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 style={{ margin: 0 }}>Error</h3>
              <button className="admin-icon-button danger" type="button" aria-label="Close" onClick={clearNotice}>
                ×
              </button>
            </div>
            <div className="admin-modal-body">
              <div className="admin-alert danger" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                {notice.text}
              </div>
            </div>
            <div className="admin-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="admin-button danger" type="button" onClick={clearNotice}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
