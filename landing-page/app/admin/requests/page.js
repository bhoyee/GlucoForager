'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import DataTable from '../ui/DataTable';
import LoadingState from '../ui/LoadingState';
import EmptyState from '../ui/EmptyState';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

const TYPE_OPTIONS = [
  { value: 'day_off', label: 'Day off' },
  { value: 'annual_leave', label: 'Annual leave' },
  { value: 'sick_leave', label: 'Sick leave' },
  { value: 'training', label: 'Training' },
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

export default function RequestsPage() {
  const router = useRouter();
  const token = useMemo(() => (typeof window === 'undefined' ? null : localStorage.getItem('adminToken')), []);
  const [session, setSession] = useState(null);
  const permissions = Array.isArray(session?.permissions) ? session.permissions : [];
  const canWrite = permissions.includes('*') || permissions.includes('requests.write_own');

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null); // { tone: 'info'|'success'|'warning'|'danger', text: string }

  const showNotice = (tone, text) => setNotice({ tone: tone || 'info', text: String(text || '').trim() });
  const clearNotice = () => setNotice(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [type, setType] = useState('day_off');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [details, setDetails] = useState('');
  const [saving, setSaving] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('Confirm');
  const [confirmBody, setConfirmBody] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);

  const [viewOpen, setViewOpen] = useState(false);
  const [viewItem, setViewItem] = useState(null);
  const [viewAuditLoading, setViewAuditLoading] = useState(false);
  const [viewAuditItems, setViewAuditItems] = useState([]);

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

  const openView = (row) => {
    setViewItem(row || null);
    setViewOpen(true);
    if (row?.id) loadAudit(row.id);
  };
  const closeView = () => {
    setViewOpen(false);
    setViewItem(null);
    setViewAuditLoading(false);
    setViewAuditItems([]);
  };

  const loadAudit = async (id) => {
    if (!token || !id) return;
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

  const load = async () => {
    if (!token) return;
    setLoading(true);
    clearNotice();
    try {
      const res = await fetch(`${API_URL}/api/admin/requests/my?include_deleted=0`, { headers: { Authorization: `Bearer ${token}` } });
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
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openNew = () => {
    setEditingId(null);
    setType('day_off');
    setStartDate('');
    setEndDate('');
    setDetails('');
    setFormOpen(true);
  };

  const openEdit = (row) => {
    setEditingId(row?.id || null);
    setType(String(row?.type || 'day_off'));
    setStartDate(formatDate(row?.start_date));
    setEndDate(formatDate(row?.end_date) === '—' ? '' : formatDate(row?.end_date));
    setDetails(String(row?.details || ''));
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setSaving(false);
  };

  const saveDraft = async () => {
    if (!token || !canWrite) return;
    const payload = {
      type,
      start_date: startDate,
      end_date: endDate ? endDate : null,
      details: details ? details : null,
    };
    if (!payload.start_date) {
      showNotice('danger', 'Start date is required.');
      return;
    }
    if (rangeHasWeekend(payload.start_date, payload.end_date || payload.start_date)) {
      showNotice('danger', 'We don’t work on weekends (Sat/Sun). Please choose weekday dates.');
      return;
    }
    setSaving(true);
    clearNotice();
    try {
      const url = editingId ? `${API_URL}/api/admin/requests/${editingId}/update` : `${API_URL}/api/admin/requests`;
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
      if (!res.ok) throw new Error(data.detail || 'Failed to save.');
      closeForm();
      showNotice('success', 'Saved.');
      load();
    } catch (e) {
      showNotice('danger', e?.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const [uploading, setUploading] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);

  const uploadAttachment = async () => {
    if (!token || !canWrite) return;
    if (!editingId) {
      showNotice('warning', 'Save the draft first before uploading attachments.');
      return;
    }
    if (!uploadFile) return;
    setUploading(true);
    clearNotice();
    try {
      const fd = new FormData();
      fd.append('file', uploadFile);
      const res = await fetch(`${API_URL}/api/admin/requests/${editingId}/attachments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error(data.detail || 'Failed to upload attachment.');
      setUploadFile(null);
      showNotice('success', 'Attachment uploaded.');
      load();
    } catch (e) {
      showNotice('danger', e?.message || 'Failed to upload attachment.');
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = async (requestId, filename) => {
    if (!token || !canWrite || !requestId || !filename) return;
    clearNotice();
    try {
      const res = await fetch(`${API_URL}/api/admin/requests/${requestId}/attachments/${encodeURIComponent(filename)}/remove`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to remove attachment.');
      showNotice('success', 'Attachment removed.');
      load();
    } catch (e) {
      showNotice('danger', e?.message || 'Failed to remove attachment.');
    }
  };

  const submit = async (id) => {
    if (!token || !canWrite || !id) return;
    const row = (Array.isArray(items) ? items : []).find((x) => String(x?.id) === String(id));
    if (row) {
      const s = formatDate(row.start_date);
      const e = row.end_date ? formatDate(row.end_date) : s;
      if (s && s !== '—' && rangeHasWeekend(s, e || s)) {
        showNotice('danger', 'We don’t work on weekends (Sat/Sun). Please choose weekday dates.');
        return;
      }
    }
    clearNotice();
    try {
      const res = await fetch(`${API_URL}/api/admin/requests/${id}/submit`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error(data.detail || 'Failed to submit.');
      showNotice('success', 'Request submitted.');
      load();
    } catch (e) {
      showNotice('danger', e?.message || 'Failed to submit.');
    }
  };

  const del = async (id) => {
    if (!token || !canWrite || !id) return;
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
    } catch (e) {
      showNotice('danger', e?.message || 'Failed to delete.');
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-card">
        <div className="admin-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 className="admin-title" style={{ marginBottom: 6 }}>
              My Requests
            </h2>
            <p className="admin-subtitle" style={{ margin: 0 }}>
              Create a request and submit it to HR/Admin for approval.
            </p>
          </div>
          {canWrite ? (
            <button className="admin-button" type="button" onClick={openNew}>
              New request
            </button>
          ) : null}
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
        {loading ? (
          <LoadingState label="Loading requests..." />
        ) : (Array.isArray(items) ? items : []).length === 0 ? (
          <EmptyState title="No requests yet" body="Create a request when you need time off or training approval." />
        ) : (
          <DataTable
            items={items}
            rowKey={(r) => String(r.id)}
            pageSize={10}
            columns={[
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
                key: 'updated',
                header: 'Updated',
                sortable: true,
                filterable: false,
                searchable: false,
                accessor: (r) => formatDate(r.updated_at),
                sortValue: (r) => String(r.updated_at || ''),
              },
              {
                key: 'action',
                header: 'Action',
                sortable: false,
                filterable: false,
                searchable: false,
                width: 240,
                render: (r) => {
                  const isDraft = String(r.status || '').toLowerCase() === 'draft';
                  return (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="admin-button info" type="button" onClick={() => openView(r)}>
                        View
                      </button>
                      <button className="admin-button secondary" type="button" onClick={() => openEdit(r)} disabled={!isDraft || !canWrite}>
                        Edit draft
                      </button>
                      <button
                        className="admin-button"
                        type="button"
                        onClick={() => openConfirm({ title: 'Submit request?', body: 'After you submit, you can no longer edit or delete it.', onConfirm: () => submit(r.id) })}
                        disabled={!isDraft || !canWrite}
                      >
                        Submit
                      </button>
                      <button
                        className="admin-button danger"
                        type="button"
                        onClick={() => openConfirm({ title: 'Delete draft?', body: 'This will remove the draft request.', onConfirm: () => del(r.id) })}
                        disabled={!isDraft || !canWrite}
                      >
                        Delete
                      </button>
                    </div>
                  );
                },
              },
            ]}
          />
        )}
      </div>

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

      {formOpen ? (
        <div className="admin-modal-backdrop" role="presentation" onClick={closeForm}>
          <div className="admin-modal" role="dialog" aria-modal="true" aria-label="Request form" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>{editingId ? 'Edit request (draft)' : 'New request'}</h3>
              <button className="admin-icon-button danger" type="button" aria-label="Close" onClick={closeForm}>
                ×
              </button>
            </div>
            <div className="admin-modal-body">
              <p className="admin-subtitle" style={{ marginTop: 0 }}>
                Note: we don’t work on weekends. Requests cannot include Saturday/Sunday.
              </p>
              <div className="admin-field">
                <label>Type</label>
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  {TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="admin-field" style={{ margin: 0 }}>
                  <label>Start date</label>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="admin-field" style={{ margin: 0 }}>
                  <label>End date (optional)</label>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>
              <div className="admin-field">
                <label>Details (optional)</label>
                <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={5} placeholder="Add any context HR/Admin should know..." />
              </div>

              {editingId ? (
                <div className="admin-field">
                  <label>Attachments (optional)</label>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input type="file" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
                    <button className="admin-button info" type="button" onClick={uploadAttachment} disabled={uploading || !uploadFile}>
                      {uploading ? 'Uploading…' : 'Upload'}
                    </button>
                  </div>
                  <p className="admin-subtitle" style={{ margin: '6px 0 0 0' }}>
                    Supported: images, PDF, MP4.
                  </p>
                </div>
              ) : (
                <p className="admin-subtitle" style={{ margin: 0 }}>
                  Save the draft first to upload attachments.
                </p>
              )}

              {editingId ? (
                <div style={{ marginTop: 10 }}>
                  {(Array.isArray(items) ? items : []).find((x) => String(x.id) === String(editingId))?.attachments?.length ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {(Array.isArray(items) ? items : [])
                        .find((x) => String(x.id) === String(editingId))
                        .attachments.map((a) => (
                          <div key={a.filename} className="admin-card admin-card--subtle" style={{ padding: 12, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.original_name || a.filename}</div>
                              <div className="admin-subtitle">{a.content_type || ''}</div>
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <a className="admin-button info" href={a.url} target="_blank" rel="noreferrer">
                                Download
                              </a>
                              <button className="admin-button danger" type="button" onClick={() => removeAttachment(editingId, a.filename)}>
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="admin-subtitle" style={{ margin: 0 }}>
                      No attachments yet.
                    </p>
                  )}
                </div>
              ) : null}
            </div>
            <div className="admin-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="admin-button danger" type="button" onClick={closeForm} disabled={saving}>
                Close
              </button>
              <button className="admin-button" type="button" onClick={saveDraft} disabled={saving || !startDate}>
                {saving ? 'Saving…' : 'Save draft'}
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
