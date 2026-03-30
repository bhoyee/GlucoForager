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

export default function LibraryPage() {
  const router = useRouter();
  const token = useMemo(() => (typeof window === 'undefined' ? null : localStorage.getItem('adminToken')), []);

  const [session, setSession] = useState(null);
  const permissions = Array.isArray(session?.permissions) ? session.permissions : [];
  const isAdmin = permissions.includes('*') || permissions.includes('admin.manage');
  const canRestore = isAdmin && (permissions.includes('*') || permissions.includes('library.delete_any'));
  const canUpload = permissions.includes('*') || permissions.includes('library.upload');

  const [kind, setKind] = useState(''); // '' | image | document | video
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [includeDeleted, setIncludeDeleted] = useState(false);

  const [items, setItems] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const [previewItem, setPreviewItem] = useState(null);
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
  }, [token, kind, includeDeleted, isAdmin, debouncedQuery]);

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
                    {r.original_filename ? <span className="admin-subtitle">{r.original_filename}</span> : null}
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
                  r.url ? (
                    <a className="admin-button info" href={r.url} target="_blank" rel="noreferrer">
                      Download
                    </a>
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
                      <button className="admin-button" type="button" onClick={() => restore(r.id)}>
                        Restore
                      </button>
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
                <a className="admin-link" href={previewItem.url} target="_blank" rel="noreferrer">
                  Open
                </a>
                <button className="admin-button danger" type="button" onClick={() => setPreviewItem(null)}>
                  Close
                </button>
              </div>
            </div>

            <div style={{ flex: 1, marginTop: 10, borderRadius: 12, overflow: 'hidden', background: 'rgba(255,255,255,0.04)' }}>
              {isImage(previewItem) ? (
                <img src={previewItem.url} alt={previewItem.title} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : isPdf(previewItem) ? (
                <iframe title="PDF preview" src={previewItem.url} style={{ width: '100%', height: '100%', border: 0 }} />
              ) : isVideo(previewItem) ? (
                <video src={previewItem.url} controls style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : (
                <div style={{ padding: 14 }}>
                  <p className="admin-subtitle">Preview not available for this file type.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
