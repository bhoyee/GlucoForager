'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import DataTable from '../ui/DataTable';
import EmptyState from '../ui/EmptyState';
import LoadingState from '../ui/LoadingState';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

function isPdf(item) {
  const ct = String(item?.content_type || '').toLowerCase();
  if (ct.includes('application/pdf')) return true;
  const url = String(item?.url || '').toLowerCase();
  return url.endsWith('.pdf');
}

function isImage(item) {
  return String(item?.kind || '').toLowerCase() === 'image';
}

function isVideo(item) {
  return String(item?.kind || '').toLowerCase() === 'video';
}

function kindLabel(item) {
  const k = String(item?.kind || '').toLowerCase();
  if (k === 'image') return 'Image';
  if (k === 'video') return 'Video';
  return 'PDF';
}

function categoryLabel(item) {
  const f = String(item?.folder || '').trim().toLowerCase();
  if (!f || f === 'general') return 'General';
  if (f === 'hr') return 'HR';
  if (f === 'learning') return 'Learning';
  return f.charAt(0).toUpperCase() + f.slice(1);
}

function categoryOptions() {
  return [
    { value: '', label: 'All categories' },
    { value: 'general', label: 'General' },
    { value: 'marketing', label: 'Marketing' },
    { value: 'hr', label: 'HR' },
    { value: 'learning', label: 'Learning' },
  ];
}

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return String(iso);
  try {
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

function normalizeHref(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  if (u.startsWith('//')) return `https:${u}`;
  if (u.startsWith('/')) return u;
  // Avoid Next.js treating it as an internal route.
  return `https://${u}`;
}

function downloadNameForItem(item) {
  const raw = String(item?.original_filename || item?.filename || item?.title || 'asset').trim() || 'asset';
  return raw.replace(/[\\\/:*?"<>|]+/g, '_');
}

export default function LibraryPage() {
  const router = useRouter();
  const token = useMemo(() => (typeof window === 'undefined' ? null : localStorage.getItem('adminToken')), []);

  const [session, setSession] = useState(null);
  const permissions = Array.isArray(session?.permissions) ? session.permissions : [];
  const isAdmin = permissions.includes('*') || permissions.includes('admin.manage');
  const canRestore = isAdmin && (permissions.includes('*') || permissions.includes('library.delete_any'));
  const canUpload = permissions.includes('*') || permissions.includes('library.upload');

  const [kind, setKind] = useState(''); // '' | image | document | video
  const [category, setCategory] = useState(''); // '' (all) | general | hr | marketing | ...
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [includeDeleted, setIncludeDeleted] = useState(false);

  const [items, setItems] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [purgeTarget, setPurgeTarget] = useState(null);
  const [purgeLoading, setPurgeLoading] = useState(false);

  const [previewItem, setPreviewItem] = useState(null);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const debounceTimer = useRef(null);

  const loadSession = async () => {
    if (!token) {
      router.push('/admin');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/admin/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
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
    if (!token) {
      router.push('/admin');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const params = new URLSearchParams();
      if (kind) params.set('kind', kind);
      if (category) params.set('folder', category);
      if (debouncedQuery) params.set('q', debouncedQuery);
      if (includeDeleted && isAdmin) params.set('include_deleted', '1');

      const res = await fetch(`${API_URL}/api/admin/library?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load library.');
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setMessage(e?.message || 'Failed to load library.');
    } finally {
      setLoading(false);
    }
  };

  const downloadItem = async (item) => {
    if (!token || !item?.id) return;
    setDownloadBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/library/items/${encodeURIComponent(String(item.id))}/download`, {
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
    } catch (e) {
      setMessage(`Download failed: ${e?.message || 'unknown error'}`);
    } finally {
      setDownloadBusy(false);
    }
  };

  const downloadPreview = async () => downloadItem(previewItem);

  useEffect(() => {
    loadSession();
  }, [token]);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedQuery(String(query || '').trim()), 250);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query]);

  useEffect(() => {
    load();
  }, [token, kind, category, includeDeleted, isAdmin, debouncedQuery]);

  const softDelete = async (id) => {
    if (!token) return;
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/library/items/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error(data.detail || 'Delete failed.');
      load();
    } catch (e) {
      setMessage(e?.message || 'Delete failed.');
    }
  };

  const restore = async (id) => {
    if (!token) return;
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/library/items/${id}/restore`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error(data.detail || 'Restore failed.');
      load();
    } catch (e) {
      setMessage(e?.message || 'Restore failed.');
    }
  };

  const purge = async (id) => {
    if (!token) return;
    setMessage('');
    setPurgeLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/library/items/${id}/purge`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error(data.detail || 'Permanent delete failed.');
      if (data?.file_deleted === false && data?.file_error) {
        setMessage(`Deleted from database, but file delete failed: ${data.file_error}`);
      }
      load();
    } catch (e) {
      setMessage(e?.message || 'Permanent delete failed.');
    } finally {
      setPurgeLoading(false);
      setPurgeTarget(null);
    }
  };

  const rows = Array.isArray(items) ? items : [];

  return (
    <div className="admin-page">
      <div className="admin-card">
        <h2 className="admin-title">Library</h2>
        <p className="admin-subtitle">Search and access shared assets (images, PDFs, short videos). Preview and download in one click.</p>
        {message ? <div className="admin-alert warning">{message}</div> : null}

        <div className="admin-toolbar-grid" style={{ marginTop: 12 }}>
          <div className="admin-toolbar-search">
            <input className="admin-search-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search files by name or tag…" />
          </div>
          <div className="admin-toolbar-filters">
            <select className="admin-filter-select" value={category} onChange={(e) => setCategory(e.target.value)}>
              {categoryOptions().map((o) => (
                <option key={o.value || 'all'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select className="admin-filter-select" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">All types</option>
              <option value="image">Images</option>
              <option value="document">PDFs</option>
              <option value="video">Videos</option>
            </select>
            {isAdmin ? (
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={includeDeleted} onChange={(e) => setIncludeDeleted(e.target.checked)} /> Show deleted
              </label>
            ) : null}
          </div>
          <div className="admin-toolbar-actions" style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {canUpload ? (
              <Link className="admin-button" href="/admin/library/upload">
                Upload asset
              </Link>
            ) : null}
            <button className="admin-button info" type="button" onClick={load}>
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="admin-card" style={{ marginTop: 16 }}>
        <div className="admin-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Items</h3>
          <p className="admin-subtitle" style={{ margin: 0 }}>
            {rows.length} item(s)
          </p>
        </div>

        {loading ? (
          <LoadingState label="Loading library…" />
        ) : rows.length === 0 ? (
          <EmptyState title="No library items" body={canUpload ? 'Upload your first asset to get started.' : 'No assets available yet.'} />
        ) : (
          <DataTable
            columns={[
              {
                key: 'title',
                header: 'Name',
                sortable: true,
                filterable: false,
                accessor: (r) => r.title,
                render: (r) => (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 800 }}>{r.title}</span>
                  </div>
                ),
              },
              {
                key: 'kind',
                header: 'Type',
                sortable: true,
                filterable: false,
                accessor: (r) => kindLabel(r),
                render: (r) => <span className="admin-badge secondary">{kindLabel(r)}</span>,
                sortValue: (r) => kindLabel(r),
              },
              {
                key: 'folder',
                header: 'Category',
                sortable: true,
                filterable: false,
                accessor: (r) => categoryLabel(r),
                render: (r) => <span className="admin-badge secondary">{categoryLabel(r)}</span>,
                sortValue: (r) => categoryLabel(r),
              },
              {
                key: 'created_at',
                header: 'Uploaded',
                sortable: true,
                filterable: false,
                accessor: (r) => formatDateTime(r.created_at),
                sortValue: (r) => (r.created_at ? new Date(String(r.created_at)).getTime() : 0),
              },
              {
                key: 'preview',
                header: 'Preview',
                sortable: false,
                filterable: false,
                render: (r) =>
                  isImage(r) || isPdf(r) || isVideo(r) ? (
                    <button className="admin-button secondary" type="button" onClick={() => setPreviewItem(r)} disabled={r.is_deleted}>
                      Preview
                    </button>
                  ) : (
                    <span className="admin-subtitle">—</span>
                  ),
              },
              {
                key: 'download',
                header: 'Download',
                sortable: false,
                filterable: false,
                render: (r) =>
                  r.id ? (
                    <button className="admin-button warning" type="button" onClick={() => downloadItem(r)} disabled={downloadBusy || r.is_deleted}>
                      Download
                    </button>
                  ) : (
                    <span className="admin-subtitle">—</span>
                  ),
              },
              {
                key: 'actions',
                header: 'Action',
                sortable: false,
                filterable: false,
                render: (r) =>
                  r.is_deleted ? (
                    canRestore ? (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button className="admin-button" type="button" onClick={() => restore(r.id)}>
                          Restore
                        </button>
                        <button className="admin-button danger" type="button" onClick={() => setPurgeTarget(r)}>
                          Permanent delete
                        </button>
                      </div>
                    ) : (
                      <span className="admin-subtitle">Deleted</span>
                    )
                  ) : (
                    <button className="admin-button danger" type="button" onClick={() => softDelete(r.id)}>
                      Delete
                    </button>
                  ),
              },
            ]}
            rows={rows}
            getRowId={(r) => r.id}
            initialSortKey="created_at"
            initialSortDir="desc"
            showFilters={false}
            searchPlaceholder=""
          />
        )}
      </div>

      {previewItem ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setPreviewItem(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 1000,
          }}
        >
          <div
            className="admin-card"
            onClick={(e) => e.stopPropagation()}
            style={{ width: 'min(980px, 98vw)', height: 'min(720px, 92vh)', padding: 12, display: 'flex', flexDirection: 'column' }}
          >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <p style={{ margin: 0, fontWeight: 700 }}>{previewItem.title}</p>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <a className="admin-button info" href={normalizeHref(previewItem.url)} target="_blank" rel="noreferrer">
                  Open
                </a>
                <button className="admin-button warning" type="button" onClick={downloadPreview} disabled={downloadBusy}>
                  {downloadBusy ? 'Downloading...' : 'Download'}
                </button>
                <button className="admin-button danger" type="button" onClick={() => setPreviewItem(null)}>
                  Close
                </button>
                </div>
              </div>

            <div style={{ flex: 1, marginTop: 10, borderRadius: 12, overflow: 'hidden', background: 'rgba(255,255,255,0.04)' }}>
              {isImage(previewItem) ? (
                <img src={normalizeHref(previewItem.url)} alt={previewItem.title} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : isPdf(previewItem) ? (
                <iframe title="PDF preview" src={normalizeHref(previewItem.url)} style={{ width: '100%', height: '100%', border: 0 }} />
              ) : isVideo(previewItem) ? (
                <video src={normalizeHref(previewItem.url)} controls style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : (
                <div style={{ padding: 14 }}>
                  <p className="admin-subtitle">Preview not available for this file type.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {purgeTarget ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => (purgeLoading ? null : setPurgeTarget(null))}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 1000,
          }}
        >
          <div className="admin-card" onClick={(e) => e.stopPropagation()} style={{ width: 'min(560px, 96vw)', padding: 16 }}>
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Permanent delete</h3>
            <p className="admin-subtitle" style={{ marginTop: 0 }}>
              This will remove the item from the database and attempt to delete the file from your hosting. This action cannot be undone.
            </p>
            <div className="admin-card admin-card--subtle admin-card--compact" style={{ padding: 12, marginTop: 10 }}>
              <div style={{ fontWeight: 800 }}>{purgeTarget.title}</div>
              <div className="admin-subtitle" style={{ marginTop: 6 }}>
                {kindLabel(purgeTarget)} · {categoryLabel(purgeTarget)}
              </div>
            </div>

            <div className="admin-actions" style={{ justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
              <button className="admin-button secondary" type="button" onClick={() => setPurgeTarget(null)} disabled={purgeLoading}>
                Cancel
              </button>
              <button className="admin-button danger" type="button" onClick={() => purge(purgeTarget.id)} disabled={purgeLoading}>
                {purgeLoading ? 'Deleting…' : 'Permanent delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
