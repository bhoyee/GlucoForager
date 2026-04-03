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
  if (isPdf(item)) return 'PDF';
  const name = String(item?.original_filename || item?.url || '').toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) return 'Excel';
  return 'Document';
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

function actionLabel(action) {
  const a = String(action || '').toLowerCase();
  if (a === 'library.upload') return 'Uploaded';
  if (a === 'library.download') return 'Downloaded';
  if (a === 'library.soft_delete') return 'Soft deleted';
  if (a === 'library.restore') return 'Restored';
  if (a === 'library.purge') return 'Permanently deleted';
  return action ? String(action) : 'Activity';
}

function actorNameOnly(actor) {
  const text = String(actor || '').trim();
  if (!text) return 'Unknown';
  const idx = text.indexOf(' (');
  if (idx > 0) return text.slice(0, idx).trim() || 'Unknown';
  if (text.includes('@')) return text.split('@')[0].trim() || 'Unknown';
  return text;
}

export default function LibraryPage() {
  const router = useRouter();
  const token = useMemo(() => (typeof window === 'undefined' ? null : localStorage.getItem('adminToken')), []);

  const [session, setSession] = useState(null);
  const permissions = Array.isArray(session?.permissions) ? session.permissions : [];
  const isAdmin = permissions.includes('*') || permissions.includes('admin.manage');
  const canRestore = isAdmin && (permissions.includes('*') || permissions.includes('library.delete_any'));
  const canUpload = permissions.includes('*') || permissions.includes('library.upload');
  const canDeleteOwn = permissions.includes('*') || permissions.includes('library.delete_own') || permissions.includes('library.delete_any');
  const canDeleteAny = permissions.includes('*') || permissions.includes('library.delete_any');
  const myStaffId = session?.id ? Number(session.id) : null;

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
  const [previewBlobUrl, setPreviewBlobUrl] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [tableDownloadingId, setTableDownloadingId] = useState(null);
  const [previewDownloading, setPreviewDownloading] = useState(false);
  const [detailsTarget, setDetailsTarget] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsData, setDetailsData] = useState(null);
  const [softDeleteTarget, setSoftDeleteTarget] = useState(null);
  const [softDeleteReason, setSoftDeleteReason] = useState('');
  const [softDeleteSubmitting, setSoftDeleteSubmitting] = useState(false);
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
      if (includeDeleted && isAdmin) {
        params.set('include_deleted', '1');
        params.set('deleted_only', '1');
      }

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

  const openDetails = async (row) => {
    if (!isAdmin || !token || !row?.id) return;
    setDetailsTarget(row);
    setDetailsLoading(true);
    setDetailsData(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/library/items/${encodeURIComponent(String(row.id))}/details`, {
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

  const canSoftDeleteRow = (row) => {
    if (!row || row.is_deleted) return false;
    if (!canDeleteOwn) return false;
    if (isAdmin && canDeleteAny) return true;
    if (myStaffId === null) return false;
    return Number(row.staff_user_id) === myStaffId;
  };

  const downloadItem = async (item) => {
    if (!token || !item?.id) return;
    setTableDownloadingId(item.id);
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
      setTableDownloadingId(null);
    }
  };

  const downloadPreview = async () => {
    if (!token || !previewItem?.id) return;
    setPreviewDownloading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/library/items/${encodeURIComponent(String(previewItem.id))}/download`, {
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
      a.download = downloadNameForItem(previewItem);
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(href);
    } catch (e) {
      setMessage(`Download failed: ${e?.message || 'unknown error'}`);
    } finally {
      setPreviewDownloading(false);
    }
  };

  const openPreviewInNewTab = () => {
    if (!previewBlobUrl) return;
    try {
      window.open(previewBlobUrl, '_blank', 'noopener,noreferrer');
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!previewItem?.id || !token) return undefined;

    let canceled = false;
    let objectUrl = '';

    const run = async () => {
      setPreviewLoading(true);
      setMessage('');
      try {
        const res = await fetch(`${API_URL}/api/admin/library/items/${encodeURIComponent(String(previewItem.id))}/open`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) {
          localStorage.removeItem('adminToken');
          router.push('/admin');
          return;
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || 'Failed to open file.');
        }
        const blob = await res.blob();
        objectUrl = window.URL.createObjectURL(blob);
        if (canceled) {
          window.URL.revokeObjectURL(objectUrl);
          return;
        }
        setPreviewBlobUrl(objectUrl);
      } catch (e) {
        setPreviewBlobUrl('');
        setMessage(e?.message || 'Failed to open file.');
      } finally {
        if (!canceled) setPreviewLoading(false);
      }
    };

    run();

    return () => {
      canceled = true;
      setPreviewLoading(false);
      setPreviewBlobUrl('');
      if (objectUrl) window.URL.revokeObjectURL(objectUrl);
    };
  }, [previewItem?.id, router, token]);

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

  const softDelete = async (id, reason) => {
    if (!token) return;
    setMessage('');
    setSoftDeleteSubmitting(true);
    try {
      const qs = reason ? `?reason=${encodeURIComponent(String(reason || '').trim())}` : '';
      const res = await fetch(`${API_URL}/api/admin/library/items/${id}${qs}`, {
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
    } finally {
      setSoftDeleteSubmitting(false);
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
                <input type="checkbox" checked={includeDeleted} onChange={(e) => setIncludeDeleted(e.target.checked)} /> Show deleted only
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
                    <button
                      className="admin-button warning"
                      type="button"
                      onClick={() => downloadItem(r)}
                      disabled={r.is_deleted || (tableDownloadingId !== null && tableDownloadingId !== r.id)}
                    >
                      {tableDownloadingId === r.id ? 'Downloading...' : 'Download'}
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
                        {isAdmin ? (
                          <button className="admin-button info" type="button" onClick={() => openDetails(r)}>
                            Details
                          </button>
                        ) : null}
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
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {isAdmin ? (
                        <button className="admin-button info" type="button" onClick={() => openDetails(r)}>
                          Details
                        </button>
                      ) : null}
                      {canSoftDeleteRow(r) ? (
                        <button
                          className="admin-button danger"
                          type="button"
                          onClick={() => {
                            setSoftDeleteTarget(r);
                            setSoftDeleteReason('');
                          }}
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
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
                <button className="admin-button info" type="button" onClick={openPreviewInNewTab} disabled={!previewBlobUrl || previewLoading}>
                  Open
                </button>
                <button className="admin-button warning" type="button" onClick={downloadPreview} disabled={previewDownloading}>
                  {previewDownloading ? 'Downloading...' : 'Download'}
                </button>
                <button className="admin-button danger" type="button" onClick={() => setPreviewItem(null)}>
                  Close
                </button>
                </div>
              </div>

            <div style={{ flex: 1, marginTop: 10, borderRadius: 12, overflow: 'hidden', background: 'rgba(255,255,255,0.04)' }}>
              {previewLoading ? (
                <div style={{ padding: 14 }}>
                  <LoadingState label="Opening preview..." />
                </div>
              ) : !previewBlobUrl ? (
                <div style={{ padding: 14 }}>
                  <p className="admin-subtitle">Preview not available right now.</p>
                </div>
              ) : isImage(previewItem) ? (
                <img src={previewBlobUrl} alt={previewItem.title} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : isPdf(previewItem) ? (
                <iframe title="PDF preview" src={previewBlobUrl} style={{ width: '100%', height: '100%', border: 0 }} />
              ) : isVideo(previewItem) ? (
                <video src={previewBlobUrl} controls style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : (
                <div style={{ padding: 14 }}>
                  <p className="admin-subtitle">Preview not available for this file type.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {detailsTarget ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => (detailsLoading ? null : setDetailsTarget(null))}
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
          <div className="admin-card" onClick={(e) => e.stopPropagation()} style={{ width: 'min(920px, 96vw)', padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <div>
                <h3 style={{ marginTop: 0, marginBottom: 4 }}>Asset details</h3>
                <p className="admin-subtitle" style={{ margin: 0 }}>
                  {detailsTarget.title}
                </p>
              </div>
              <button className="admin-button danger" type="button" onClick={() => setDetailsTarget(null)} disabled={detailsLoading}>
                Close
              </button>
            </div>

            {detailsLoading ? <div style={{ marginTop: 12 }}><LoadingState label="Loading..." /></div> : null}

            {!detailsLoading && detailsData?.error ? <div className="admin-alert danger" style={{ marginTop: 12 }}>{String(detailsData.error)}</div> : null}

            {!detailsLoading && detailsData?.item ? (
              <div className="admin-card admin-card--subtle admin-card--compact" style={{ padding: 12, marginTop: 12 }}>
                {Array.isArray(detailsData?.logs) ? (
                  <div className="admin-subtitle" style={{ marginTop: 0 }}>
                    Uploaded by:{' '}
                    <strong>{String(detailsData.logs.find((l) => String(l.action || '') === 'library.upload')?.actor || 'Unknown')}</strong>
                  </div>
                ) : null}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span className="admin-badge secondary">{String(detailsData.item.kind || '').toUpperCase()}</span>
                  <span className="admin-badge secondary">{categoryLabel({ folder: detailsData.item.folder })}</span>
                </div>
                <div className="admin-subtitle" style={{ marginTop: 8 }}>
                  Uploaded: <strong>{formatDateTime(detailsData.item.created_at)}</strong>
                </div>
                <div className="admin-subtitle" style={{ marginTop: 6 }}>
                  Deleted: <strong>{detailsData.item.is_deleted ? 'Yes' : 'No'}</strong>
                  {detailsData.item.deleted_at ? (
                    <>
                      {' '}
                      · at <strong>{formatDateTime(detailsData.item.deleted_at)}</strong>
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}

            {!detailsLoading && Array.isArray(detailsData?.logs) ? (
              <div className="admin-card admin-card--subtle admin-card--compact" style={{ padding: 12, marginTop: 12, maxHeight: 420, overflow: 'auto' }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>Activity log</div>
                {detailsData.logs.length === 0 ? (
                  <p className="admin-subtitle" style={{ margin: 0 }}>
                    No activity yet.
                  </p>
                ) : (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {detailsData.logs.map((l) => (
                      <div key={String(l.id || l.created_at || Math.random())} style={{ border: '1px solid rgba(0,0,0,0.06)', borderRadius: 12, padding: 10, background: '#fff' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                          <div style={{ fontWeight: 800 }}>{actionLabel(l.action)}</div>
                          <div className="admin-subtitle">{formatDateTime(l.created_at)}</div>
                        </div>
                        <div className="admin-subtitle" style={{ marginTop: 6 }}>
                          By: <strong>{actorNameOnly(l.actor || `Staff #${l.actor_id || ''}`)}</strong>
                        </div>
                        {l?.details?.reason ? (
                          <div className="admin-subtitle" style={{ marginTop: 6 }}>
                            Reason: <strong>{String(l.details.reason)}</strong>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {softDeleteTarget ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => (softDeleteSubmitting ? null : setSoftDeleteTarget(null))}
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
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Delete asset</h3>
            <p className="admin-subtitle" style={{ marginTop: 0 }}>
              Tell us why you’re deleting this file. Admin will be able to see the reason.
            </p>

            <div className="admin-card admin-card--subtle admin-card--compact" style={{ padding: 12, marginTop: 10 }}>
              <div style={{ fontWeight: 800 }}>{softDeleteTarget.title}</div>
              <div className="admin-subtitle" style={{ marginTop: 6 }}>
                {kindLabel(softDeleteTarget)} · {categoryLabel(softDeleteTarget)}
              </div>
            </div>

            <div className="admin-field" style={{ marginTop: 12 }}>
              <label>Reason {isAdmin ? '(optional)' : '(required)'}</label>
              <textarea
                value={softDeleteReason}
                onChange={(e) => setSoftDeleteReason(e.target.value)}
                placeholder="e.g. wrong file, outdated, replaced, etc."
                rows={4}
              />
            </div>

            <div className="admin-actions" style={{ justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
              <button className="admin-button secondary" type="button" onClick={() => setSoftDeleteTarget(null)} disabled={softDeleteSubmitting}>
                Cancel
              </button>
              <button
                className="admin-button danger"
                type="button"
                onClick={async () => {
                  const reason = String(softDeleteReason || '').trim();
                  if (!isAdmin && reason.length < 3) {
                    setMessage('Reason is required (min 3 characters).');
                    return;
                  }
                  await softDelete(softDeleteTarget.id, reason);
                  setSoftDeleteTarget(null);
                }}
                disabled={softDeleteSubmitting}
              >
                {softDeleteSubmitting ? 'Deleting...' : 'Delete'}
              </button>
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
