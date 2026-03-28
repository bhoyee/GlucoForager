'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

export default function LibraryPage() {
  const router = useRouter();
  const token = useMemo(() => (typeof window === 'undefined' ? null : localStorage.getItem('adminToken')), []);

  const [folder, setFolder] = useState('documents');
  const [items, setItems] = useState([]);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!token) {
      router.push('/admin');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/library?folder=${encodeURIComponent(folder)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error();
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setMessage('Failed to load library.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [token, folder]);

  const upload = async (event) => {
    event.preventDefault();
    if (!token) return;
    if (!file) {
      setMessage('Choose a file first.');
      return;
    }
    setMessage('');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('title', title || file.name);
      form.append('folder', folder);
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
      setFile(null);
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
      load();
    } catch (e) {
      setMessage(e?.message || 'Delete failed.');
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-card">
        <h2 className="admin-title">Library</h2>
        <p className="admin-subtitle">Shared assets (documents, images, training). Designers can delete their own uploads; admin can see deleted items.</p>
        {message && <p className="admin-subtitle">{message}</p>}

        <div className="admin-actions" style={{ gap: 10, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            Folder
            <select value={folder} onChange={(e) => setFolder(e.target.value)}>
              <option value="documents">Documents</option>
              <option value="images">Images</option>
              <option value="training">Training</option>
              <option value="general">General</option>
            </select>
          </label>
          <button className="admin-button secondary" type="button" onClick={load}>
            Refresh
          </button>
        </div>

        <form onSubmit={upload} style={{ marginTop: 14 }}>
          <div className="admin-field">
            <label>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Optional (defaults to file name)" />
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

      <div className="admin-card" style={{ marginTop: 16 }}>
        <h3>Items</h3>
        {loading ? (
          <p className="admin-subtitle">Loading...</p>
        ) : items.length === 0 ? (
          <p className="admin-subtitle">No items yet.</p>
        ) : (
          <div style={{ overflowX: 'auto', marginTop: 10 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Link</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td>{i.title}</td>
                    <td>{i.kind}</td>
                    <td>
                      <a className="admin-link" href={i.url} target="_blank" rel="noreferrer">
                        Open
                      </a>
                    </td>
                    <td>
                      <button className="admin-button secondary" type="button" onClick={() => softDelete(i.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

