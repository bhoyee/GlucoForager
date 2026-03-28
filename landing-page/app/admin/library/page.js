'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

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

export default function LibraryPage() {
  const router = useRouter();
  const token = useMemo(() => (typeof window === 'undefined' ? null : localStorage.getItem('adminToken')), []);

  const [session, setSession] = useState(null);
  const permissions = Array.isArray(session?.permissions) ? session.permissions : [];
  const isAdmin = permissions.includes('*') || permissions.includes('admin.manage');
  const canRestore = isAdmin && (permissions.includes('*') || permissions.includes('library.delete_any'));

  const [folders, setFolders] = useState([]);
  const [folder, setFolder] = useState('general');
  const [kind, setKind] = useState('');
  const [query, setQuery] = useState('');
  const [includeDeleted, setIncludeDeleted] = useState(false);

  const [items, setItems] = useState([]);
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');
  const [folderInput, setFolderInput] = useState('');
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const [previewItem, setPreviewItem] = useState(null);

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

  const loadFolders = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/library/folders?include_deleted=${includeDeleted && isAdmin ? '1' : '0'}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load folders.');
      const items = Array.isArray(data.items) ? data.items : [];
      setFolders(items);
      if (!folder && items[0]?.folder) setFolder(String(items[0].folder));
    } catch {
      // Ignore folder load failures; library list still works.
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
      if (folder) params.set('folder', folder);
      if (kind) params.set('kind', kind);
      if (query) params.set('q', query);
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
    loadFolders();
  }, [token, includeDeleted, isAdmin]);

  useEffect(() => {
    load();
  }, [token, folder, kind, includeDeleted, isAdmin]);

  const upload = async (event) => {
    event.preventDefault();
    if (!token) return;
    if (!file) {
      setMessage('Choose a file first.');
      return;
    }
    setMessage('');
    try {
      const finalFolder = String(folderInput || folder || 'general').trim().toLowerCase() || 'general';
      const form = new FormData();
      form.append('file', file);
      form.append('title', title || file.name);
      form.append('folder', finalFolder);
      if (tags && String(tags).trim()) form.append('tags', String(tags).trim());
      const res = await fetch(`${API_URL}/api/admin/library/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error(data.detail || 'Upload failed.');
      setTitle('');
      setTags('');
      setFolderInput('');
      setFile(null);
      await loadFolders();
      setFolder(finalFolder);
      load();
    } catch (e) {
      setMessage(e?.message || 'Upload failed.');
    }
  };

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
      loadFolders();
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
      loadFolders();
      load();
    } catch (e) {
      setMessage(e?.message || 'Restore failed.');
    }
  };

  const folderItems = folders
    .map((x) => ({ folder: String(x.folder || 'general'), count: Number(x.count || 0) }))
    .filter((x) => x.folder);

  const filtered = query
    ? items.filter((i) => {
        const needle = String(query).toLowerCase();
        const title = String(i.title || '').toLowerCase();
        const filename = String(i.original_filename || '').toLowerCase();
        const tags = Array.isArray(i.tags) ? i.tags.join(',').toLowerCase() : '';
        return title.includes(needle) || filename.includes(needle) || tags.includes(needle);
      })
    : items;

  return (
    <div className="admin-page">
      <div className="admin-card">
        <h2 className="admin-title">Library</h2>
        <p className="admin-subtitle">
          Shared assets (documents, images, training). Preview PDFs/images, search, tags, and admin restore deleted.
        </p>
        {message && <p className="admin-subtitle">{message}</p>}

        <div className="admin-grid" style={{ marginTop: 14, alignItems: 'start' }}>
          <div className="admin-card" style={{ padding: 14 }}>
            <h3 style={{ marginTop: 0 }}>Folders</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {folderItems.length === 0 ? (
                <p className="admin-subtitle" style={{ margin: 0 }}>
                  No folders yet.
                </p>
              ) : (
                folderItems.map((f) => (
                  <button
                    key={f.folder}
                    className={`admin-button secondary${folder === f.folder ? ' active' : ''}`}
                    type="button"
                    onClick={() => {
                      setFolder(f.folder);
                      setFolderInput('');
                    }}
                    style={{ justifyContent: 'space-between' }}
                  >
                    <span style={{ textTransform: 'capitalize' }}>{f.folder}</span>
                    <span style={{ opacity: 0.7 }}>{f.count}</span>
                  </button>
                ))
              )}
            </div>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label className="admin-subtitle" style={{ margin: 0 }}>
                Type
              </label>
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="">All</option>
                <option value="document">Documents</option>
                <option value="image">Images</option>
              </select>
              {isAdmin ? (
                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="checkbox" checked={includeDeleted} onChange={(e) => setIncludeDeleted(e.target.checked)} /> Show deleted
                </label>
              ) : null}
              <button className="admin-button secondary" type="button" onClick={load}>
                Refresh
              </button>
            </div>
          </div>

          <div className="admin-card" style={{ padding: 14 }}>
            <h3 style={{ marginTop: 0 }}>Search</h3>
            <div className="admin-field">
              <label>Search title / file name / tags</label>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. onboarding, logo, training" />
            </div>
            <div className="admin-actions">
              <button className="admin-button secondary" type="button" onClick={load}>
                Apply
              </button>
              <button
                className="admin-button secondary"
                type="button"
                onClick={() => {
                  setQuery('');
                }}
              >
                Clear
              </button>
            </div>

            <hr style={{ opacity: 0.2, margin: '16px 0' }} />

            <h3 style={{ marginTop: 0 }}>Upload</h3>
            <form onSubmit={upload}>
              <div className="admin-field">
                <label>Folder</label>
                <input
                  list="library-folders"
                  value={folderInput}
                  onChange={(e) => setFolderInput(e.target.value)}
                  placeholder={folder ? `Current: ${folder}` : 'general'}
                />
                <datalist id="library-folders">
                  {folderItems.map((f) => (
                    <option key={f.folder} value={f.folder} />
                  ))}
                </datalist>
                <p className="admin-subtitle" style={{ marginTop: 6 }}>
                  Leave blank to upload into current folder.
                </p>
              </div>
              <div className="admin-field">
                <label>Title</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Optional (defaults to file name)" />
              </div>
              <div className="admin-field">
                <label>Tags</label>
                <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Comma-separated (e.g. onboarding, brand, pdf)" />
              </div>
              <div className="admin-field">
                <label>File</label>
                <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </div>
              <button className="admin-button" type="submit">
                Upload
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="admin-card" style={{ marginTop: 16 }}>
        <div className="admin-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Items</h3>
          <p className="admin-subtitle" style={{ margin: 0 }}>
            {filtered.length} item(s)
          </p>
        </div>

        {loading ? (
          <p className="admin-subtitle">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="admin-subtitle">No items.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginTop: 12 }}>
            {filtered.map((i) => (
              <div key={i.id} className="admin-card" style={{ padding: 12, opacity: i.is_deleted ? 0.65 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700 }}>{i.title}</p>
                    <p className="admin-subtitle" style={{ margin: '6px 0 0 0' }}>
                      {i.kind} • {i.folder}
                    </p>
                  </div>
                  <a className="admin-link" href={i.url} target="_blank" rel="noreferrer">
                    Open
                  </a>
                </div>

                {Array.isArray(i.tags) && i.tags.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                    {i.tags.slice(0, 8).map((t) => (
                      <button
                        key={t}
                        type="button"
                        className="admin-button secondary"
                        onClick={() => setQuery(t)}
                        style={{ padding: '6px 10px' }}
                        title="Filter by tag"
                      >
                        #{t}
                      </button>
                    ))}
                  </div>
                ) : null}

                <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {isImage(i) || isPdf(i) ? (
                    <button className="admin-button secondary" type="button" onClick={() => setPreviewItem(i)}>
                      Preview
                    </button>
                  ) : null}
                  {!i.is_deleted ? (
                    <button className="admin-button secondary" type="button" onClick={() => softDelete(i.id)}>
                      Delete
                    </button>
                  ) : canRestore ? (
                    <button className="admin-button" type="button" onClick={() => restore(i.id)}>
                      Restore
                    </button>
                  ) : (
                    <span className="admin-subtitle">Deleted</span>
                  )}
                </div>
              </div>
            ))}
          </div>
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
                <button className="admin-button secondary" type="button" onClick={() => setPreviewItem(null)}>
                  Close
                </button>
              </div>
            </div>

            <div style={{ flex: 1, marginTop: 10, borderRadius: 12, overflow: 'hidden', background: 'rgba(255,255,255,0.04)' }}>
              {isImage(previewItem) ? (
                <img src={previewItem.url} alt={previewItem.title} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : isPdf(previewItem) ? (
                <iframe title="PDF preview" src={previewItem.url} style={{ width: '100%', height: '100%', border: 0 }} />
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

