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

function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

export default function MyDrivePage() {
  const router = useRouter();
  const token = useMemo(() => (typeof window === 'undefined' ? null : localStorage.getItem('adminToken')), []);
  const debounceTimer = useRef(null);

  const [driveStatus, setDriveStatus] = useState(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [includeDeleted, setIncludeDeleted] = useState(false);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const [downloadingId, setDownloadingId] = useState(null);
  const [previewItem, setPreviewItem] = useState(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [softDeleteTarget, setSoftDeleteTarget] = useState(null);
  const [softDeleteSubmitting, setSoftDeleteSubmitting] = useState(false);

  const loadStatus = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/drive/status`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) return;
      const data = await res.json().catch(() => ({}));
      if (res.ok) setDriveStatus(data);
    } catch {
      // ignore
    }
  };

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
      const res = await fetch(`${API_URL}/api/admin/drive/my/files?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load drive.');
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setItems([]);
      setMessage(e?.message || 'Failed to load drive.');
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
    loadStatus();
    load();
  }, [token, debouncedQuery, includeDeleted]);

  const doUpload = async (e) => {
    e.preventDefault();
    if (!token) return;
    setMessage('');
    const title = String(uploadTitle || '').trim();
    if (!title) {
      setMessage('Title is required.');
      return;
    }
    if (!uploadFile) {
      setMessage('Please choose a file to upload.');
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append('title', title);
      form.append('file', uploadFile);
      const res = await fetch(`${API_URL}/api/admin/drive/my/upload`, {
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
      if (!res.ok) throw new Error(data.detail || 'Upload failed.');
      setUploadTitle('');
      setUploadFile(null);
      setMessage('Uploaded successfully.');
      load();
    } catch (err) {
      setMessage(err?.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const downloadItem = async (item) => {
    if (!token || !item?.id) return;
    setDownloadingId(item.id);
    try {
      const res = await fetch(`${API_URL}/api/admin/drive/my/files/${encodeURIComponent(String(item.id))}/download`, {
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
      const res = await fetch(`${API_URL}/api/admin/drive/my/files/${encodeURIComponent(String(item.id))}/preview`, {
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

  const submitSoftDelete = async () => {
    if (!token || !softDeleteTarget?.id) return;
    setSoftDeleteSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/drive/my/files/${encodeURIComponent(String(softDeleteTarget.id))}/soft-delete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Delete failed.');
      setSoftDeleteTarget(null);
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
      const res = await fetch(`${API_URL}/api/admin/drive/my/files/${encodeURIComponent(String(item.id))}/restore`, {
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
        <h2 className="admin-title">MyDrive</h2>
        <p className="admin-subtitle">Private drive — only you can see your uploaded files.</p>
        {driveStatus?.limits ? (
          <div className="admin-alert info" style={{ marginTop: 12 }}>
            Allowed: images (jpg/png/webp) ≤ {formatBytes(driveStatus.limits.image_max_bytes)}, PDF ≤ {formatBytes(driveStatus.limits.pdf_max_bytes)}, MP4 video ≤{' '}
            {formatBytes(driveStatus.limits.video_max_bytes)}. Excel (xls/xlsx) ≤ {formatBytes(driveStatus.limits.excel_max_bytes || driveStatus.limits.pdf_max_bytes)}. Word (doc/docx) ≤{' '}
            {formatBytes(driveStatus.limits.pdf_max_bytes)}.
          </div>
        ) : null}
        {message ? <div className="admin-alert warning">{message}</div> : null}

        <form onSubmit={doUpload} style={{ marginTop: 12 }}>
          <div className="admin-field">
            <label>Title</label>
            <input value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} placeholder="e.g. Payslip March, Team notes, Design assets…" />
          </div>
          <div className="admin-field">
            <label>File</label>
            <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,.mp4,.xls,.xlsx,.doc,.docx" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
          </div>
          <div className="admin-actions" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
            <button className="admin-button info" type="submit" disabled={uploading}>
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </form>
      </div>

      <div className="admin-card" style={{ marginTop: 16 }}>
        <div className="admin-toolbar-grid">
          <div className="admin-toolbar-search">
            <input className="admin-search-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title or filename…" />
          </div>
          <div className="admin-toolbar-actions" style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <label className="admin-checkbox">
              <input type="checkbox" checked={includeDeleted} onChange={(e) => setIncludeDeleted(e.target.checked)} /> Show deleted
            </label>
            <button className="admin-button neutral" type="button" onClick={load} disabled={loading}>
              Refresh
            </button>
          </div>
        </div>

        {loading ? <LoadingState label="Loading MyDrive…" /> : null}
        {!loading && rows.length === 0 ? <EmptyState title="No files yet" description="Upload your first file to get started." /> : null}

        {!loading && rows.length > 0 ? (
          <DataTable
            rows={rows}
            rowKey={(r) => String(r.id)}
            pageSize={15}
            columns={[
              {
                key: 'title',
                header: 'Title',
                sortable: true,
                accessor: (r) => String(r.title || ''),
              },
              {
                key: 'type',
                header: 'Type',
                sortable: true,
                accessor: (r) => kindLabel(r),
                render: (r) => <span className="admin-badge secondary">{kindLabel(r)}</span>,
                sortValue: (r) => kindLabel(r),
              },
              {
                key: 'created_at',
                header: 'Uploaded',
                sortable: true,
                accessor: (r) => formatDateTime(r.created_at),
                sortValue: (r) => String(r.created_at || ''),
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
                    {!r.is_deleted ? (
                      <button className="admin-button danger" type="button" onClick={() => setSoftDeleteTarget(r)}>
                        Delete
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
                  ) : String(previewItem.content_type || '').toLowerCase().startsWith('video/') ||
                    String(previewItem.original_filename || '')
                      .toLowerCase()
                      .endsWith('.mp4') ? (
                    <video src={previewBlobUrl} controls style={{ width: '100%', borderRadius: 12 }} />
                  ) : (
                    <div className="admin-alert info" style={{ marginTop: 0 }}>
                      Preview isn’t available for this file type. Use Download to view it.
                    </div>
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

      {softDeleteTarget ? (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
          <div className="admin-modal">
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">Delete file</h3>
              <button className="admin-button danger" type="button" onClick={() => setSoftDeleteTarget(null)} disabled={softDeleteSubmitting}>
                Close
              </button>
            </div>
            <div className="admin-modal-body">
              <p className="admin-subtitle" style={{ marginTop: 0 }}>
                This will remove the file from your MyDrive view. You can restore it later from “Show deleted”.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 14 }}>
                <button className="admin-button danger" type="button" onClick={submitSoftDelete} disabled={softDeleteSubmitting}>
                  {softDeleteSubmitting ? 'Deleting…' : 'Confirm delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
