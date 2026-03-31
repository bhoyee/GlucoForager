'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import DataTable from '../ui/DataTable';
import EmptyState from '../ui/EmptyState';
import LoadingState from '../ui/LoadingState';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return String(iso);
  try {
    return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return String(iso);
  }
}

function downloadNameForItem(item) {
  const raw = String(item?.original_filename || item?.title || 'file').trim() || 'file';
  return raw.replace(/[\\\/:*?"<>|]+/g, '_');
}

function kindLabel(item) {
  const ct = String(item?.content_type || '').toLowerCase();
  const name = String(item?.original_filename || '').toLowerCase();
  if (ct.startsWith('image/') || name.match(/\.(jpg|jpeg|png|webp)$/)) return 'Image';
  if (ct.includes('pdf') || name.endsWith('.pdf')) return 'PDF';
  if (ct.includes('video') || name.endsWith('.mp4')) return 'Video';
  return 'File';
}

export default function StaffDrivePage() {
  const router = useRouter();
  const token = useMemo(() => (typeof window === 'undefined' ? null : localStorage.getItem('adminToken')), []);
  const debounceTimer = useRef(null);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [includeDeleted, setIncludeDeleted] = useState(true);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const [downloadingId, setDownloadingId] = useState(null);
  const [previewItem, setPreviewItem] = useState(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [detailsTarget, setDetailsTarget] = useState(null);
  const [detailsData, setDetailsData] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const [softDeleteTarget, setSoftDeleteTarget] = useState(null);
  const [softDeleteReason, setSoftDeleteReason] = useState('');
  const [softDeleteSubmitting, setSoftDeleteSubmitting] = useState(false);

  const load = async () => {
    if (!token) {
      router.push('/admin');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const params = new URLSearchParams();
      if (debouncedQuery) params.set('q', debouncedQuery);
      if (includeDeleted) params.set('include_deleted', '1');
      const res = await fetch(`${API_URL}/api/admin/drive/staff/files?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load staff drive.');
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setItems([]);
      setMessage(e?.message || 'Failed to load staff drive.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedQuery(String(query || '').trim()), 250);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query]);

  useEffect(() => {
    load();
  }, [token, debouncedQuery, includeDeleted]);

  const downloadItem = async (item) => {
    if (!token || !item?.id) return;
    setDownloadingId(item.id);
    try {
      const res = await fetch(`${API_URL}/api/admin/drive/staff/files/${encodeURIComponent(String(item.id))}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Download failed.');
      }
      const blob = await res.blob();
      const href = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = downloadNameForItem(item);
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(href);
    } catch (err) {
      setMessage(`Download failed: ${err?.message || 'unknown error'}`);
    } finally {
      setDownloadingId(null);
    }
  };

  const openPreview = async (item) => {
    if (!token || !item?.id) return;
    setPreviewItem(item);
    setPreviewBlobUrl('');
    setPreviewLoading(true);
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/drive/staff/files/${encodeURIComponent(String(item.id))}/preview`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Preview failed.');
      }
      const blob = await res.blob();
      const href = window.URL.createObjectURL(blob);
      setPreviewBlobUrl(href);
    } catch (err) {
      setMessage(err?.message || 'Preview failed.');
      setPreviewItem(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    try {
      if (previewBlobUrl) window.URL.revokeObjectURL(previewBlobUrl);
    } catch {
      // ignore
    }
    setPreviewItem(null);
    setPreviewBlobUrl('');
    setPreviewLoading(false);
  };

  const openDetails = async (item) => {
    if (!token || !item?.id) return;
    setDetailsTarget(item);
    setDetailsData(null);
    setDetailsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/drive/staff/files/${encodeURIComponent(String(item.id))}/details`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load details.');
      setDetailsData(data);
    } catch (e) {
      setDetailsData({ error: e?.message || 'Failed to load details.' });
    } finally {
      setDetailsLoading(false);
    }
  };

  const closeDetails = () => {
    setDetailsTarget(null);
    setDetailsData(null);
    setDetailsLoading(false);
  };

  const submitSoftDelete = async () => {
    if (!token || !softDeleteTarget?.id) return;
    const r = String(softDeleteReason || '').trim();
    if (!r) {
      setMessage('Reason is required.');
      return;
    }
    setSoftDeleteSubmitting(true);
    try {
      const form = new FormData();
      form.append('reason', r);
      const res = await fetch(`${API_URL}/api/admin/drive/staff/files/${encodeURIComponent(String(softDeleteTarget.id))}/soft-delete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Delete failed.');
      setSoftDeleteTarget(null);
      setSoftDeleteReason('');
      setMessage('File deleted (soft delete).');
      load();
    } catch (err) {
      setMessage(err?.message || 'Delete failed.');
    } finally {
      setSoftDeleteSubmitting(false);
    }
  };

  const restoreItem = async (item) => {
    if (!token || !item?.id) return;
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/drive/staff/files/${encodeURIComponent(String(item.id))}/restore`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Restore failed.');
      setMessage('Restored.');
      load();
    } catch (err) {
      setMessage(err?.message || 'Restore failed.');
    }
  };

  const rows = Array.isArray(items) ? items : [];

  return (
    <div className="admin-page">
      <div className="admin-card">
        <h2 className="admin-title">StaffDrive</h2>
        <p className="admin-subtitle">Admin view of all staff private-drive uploads.</p>
        {message ? <div className="admin-alert warning">{message}</div> : null}
      </div>

      <div className="admin-card" style={{ marginTop: 16 }}>
        <div className="admin-toolbar-grid">
          <div className="admin-toolbar-search">
            <input className="admin-search-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title or filename…" />
          </div>
          <div className="admin-toolbar-actions" style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <label className="admin-checkbox">
              <input type="checkbox" checked={includeDeleted} onChange={(e) => setIncludeDeleted(e.target.checked)} /> Include deleted
            </label>
            <button className="admin-button neutral" type="button" onClick={load} disabled={loading}>
              Refresh
            </button>
          </div>
        </div>

        {loading ? <LoadingState label="Loading StaffDrive…" /> : null}
        {!loading && rows.length === 0 ? <EmptyState title="No files yet" description="Staff uploads will appear here." /> : null}

        {!loading && rows.length > 0 ? (
          <DataTable
            rows={rows}
            rowKey={(r) => String(r.id)}
            pageSize={20}
            columns={[
              { key: 'owner', header: 'Staff', sortable: true, accessor: (r) => String(r.owner_email || ''), sortValue: (r) => String(r.owner_email || '') },
              { key: 'title', header: 'Title', sortable: true, accessor: (r) => String(r.title || '') },
              { key: 'type', header: 'Type', sortable: true, accessor: (r) => kindLabel(r), render: (r) => <span className="admin-badge secondary">{kindLabel(r)}</span> },
              { key: 'uploaded', header: 'Uploaded', sortable: true, accessor: (r) => formatDateTime(r.created_at), sortValue: (r) => String(r.created_at || '') },
              {
                key: 'deleted',
                header: 'Deleted',
                sortable: true,
                accessor: (r) => (r.is_deleted ? 'Yes' : 'No'),
                render: (r) => (r.is_deleted ? <span className="admin-badge danger">Deleted</span> : <span className="admin-badge success">Active</span>),
                sortValue: (r) => (r.is_deleted ? '1' : '0'),
              },
              {
                key: 'actions',
                header: 'Actions',
                accessor: () => '',
                render: (r) => (
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button className="admin-button neutral" type="button" onClick={() => openPreview(r)} disabled={previewLoading}>
                      Preview
                    </button>
                    <button className="admin-button info" type="button" onClick={() => downloadItem(r)} disabled={downloadingId === r.id}>
                      {downloadingId === r.id ? 'Downloading…' : 'Download'}
                    </button>
                    <button className="admin-button secondary" type="button" onClick={() => openDetails(r)}>
                      Details
                    </button>
                    {!r.is_deleted ? (
                      <button className="admin-button danger" type="button" onClick={() => setSoftDeleteTarget(r)}>
                        Soft delete
                      </button>
                    ) : (
                      <button className="admin-button success" type="button" onClick={() => restoreItem(r)}>
                        Restore
                      </button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        ) : null}
      </div>

      {previewItem ? (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
          <div className="admin-modal">
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">{String(previewItem.title || 'Preview')}</h3>
              <button className="admin-button danger" type="button" onClick={closePreview}>
                Close
              </button>
            </div>
            <div className="admin-modal-body">
              {previewBlobUrl ? (
                <>
                  {String(previewItem.content_type || '').toLowerCase().startsWith('image/') ? (
                    <img src={previewBlobUrl} alt="Preview" style={{ maxWidth: '100%', borderRadius: 12 }} />
                  ) : String(previewItem.content_type || '').toLowerCase().includes('pdf') ? (
                    <iframe title="Preview" src={previewBlobUrl} style={{ width: '100%', height: 560, border: '1px solid #e5eee9', borderRadius: 12 }} />
                  ) : (
                    <video src={previewBlobUrl} controls style={{ width: '100%', borderRadius: 12 }} />
                  )}
                </>
              ) : (
                <LoadingState label="Preparing preview…" />
              )}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 14, flexWrap: 'wrap' }}>
                <button className="admin-button info" type="button" onClick={() => downloadItem(previewItem)} disabled={downloadingId === previewItem.id}>
                  {downloadingId === previewItem.id ? 'Downloading…' : 'Download'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {detailsTarget ? (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
          <div className="admin-modal">
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">File details</h3>
              <button className="admin-button danger" type="button" onClick={closeDetails}>
                Close
              </button>
            </div>
            <div className="admin-modal-body">
              {detailsLoading ? <LoadingState label="Loading details…" /> : null}
              {!detailsLoading && detailsData?.error ? <div className="admin-alert danger">{String(detailsData.error)}</div> : null}
              {!detailsLoading && detailsData?.item ? (
                <div className="admin-card" style={{ padding: 14, marginBottom: 12 }}>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div>
                      <strong>Uploaded by:</strong> {String(detailsData.item.owner_email || '—')}
                    </div>
                    <div>
                      <strong>Uploaded at:</strong> {formatDateTime(detailsData.item.created_at)}
                    </div>
                    <div>
                      <strong>Deleted:</strong> {detailsData.item.is_deleted ? 'Yes' : 'No'}
                      {detailsData.item.is_deleted ? (
                        <>
                          {' '}
                          <span className="admin-subtitle">
                            — by {String(detailsData.item.deleted_by || '—')} at {formatDateTime(detailsData.item.deleted_at)}
                          </span>
                        </>
                      ) : null}
                    </div>
                    {detailsData.item.delete_reason ? (
                      <div>
                        <strong>Delete reason:</strong> <span className="admin-subtitle">{String(detailsData.item.delete_reason)}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {!detailsLoading && detailsData?.events?.length ? (
                <div className="admin-card" style={{ padding: 14 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {detailsData.events.map((e) => (
                      <div key={String(e.id)} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 800 }}>{String(e.action || 'activity')}</div>
                          <div className="admin-subtitle">{String(e.actor || '—')}</div>
                        </div>
                        <div className="admin-subtitle" style={{ whiteSpace: 'nowrap' }}>
                          {formatDateTime(e.created_at)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {!detailsLoading && !detailsData?.events?.length && !detailsData?.error ? <EmptyState title="No activity yet" description="Events will appear here when staff upload/download/delete files." /> : null}
            </div>
          </div>
        </div>
      ) : null}

      {softDeleteTarget ? (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
          <div className="admin-modal">
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">Soft delete file</h3>
              <button className="admin-button danger" type="button" onClick={() => setSoftDeleteTarget(null)} disabled={softDeleteSubmitting}>
                Close
              </button>
            </div>
            <div className="admin-modal-body">
              <p className="admin-subtitle" style={{ marginTop: 0 }}>
                Reason is required (shows in admin audit).
              </p>
              <textarea className="admin-textarea" rows={4} value={softDeleteReason} onChange={(e) => setSoftDeleteReason(e.target.value)} placeholder="Reason for soft delete…" />
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 14 }}>
                <button className="admin-button danger" type="button" onClick={submitSoftDelete} disabled={softDeleteSubmitting}>
                  {softDeleteSubmitting ? 'Deleting…' : 'Confirm soft delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
