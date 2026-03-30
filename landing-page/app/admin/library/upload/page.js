'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import LoadingState from '../../ui/LoadingState';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

function normalizeCategory(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return 'general';
  return v;
}

function categoryOptions() {
  return [
    { value: 'general', label: 'General' },
    { value: 'marketing', label: 'Marketing' },
    { value: 'hr', label: 'HR' },
    { value: 'learning', label: 'Learning' },
  ];
}

export default function LibraryUploadPage() {
  const router = useRouter();
  const token = useMemo(() => (typeof window === 'undefined' ? null : localStorage.getItem('adminToken')), []);

  const [session, setSession] = useState(null);
  const permissions = Array.isArray(session?.permissions) ? session.permissions : [];
  const canUpload = permissions.includes('*') || permissions.includes('library.upload');

  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');
  const [file, setFile] = useState(null);
  const [category, setCategory] = useState('general');
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('warning');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [lastUpload, setLastUpload] = useState(null);
  const [storageStatus, setStorageStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);

  const loadSession = async () => {
    if (!token) {
      router.push('/admin');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.ok) setSession(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSession();
  }, [token]);

  const upload = async (event) => {
    event.preventDefault();
    if (!token) return;
    if (!file) {
      setMessageTone('danger');
      setMessage('Choose a file first.');
      return;
    }
    setSubmitting(true);
    setMessage('');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('title', String(title || file.name).trim());
      form.append('folder', normalizeCategory(category));
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
      setMessageTone('info');
      setMessage('Uploaded successfully.');
      setLastUpload(data?.item || null);
      setTitle('');
      setTags('');
      setFile(null);
      setCategory('general');
    } catch (e) {
      setMessageTone('danger');
      setMessage(e?.message || 'Upload failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const loadStorageStatus = async () => {
    if (!token) return;
    setStatusLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/library/storage/status`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error(data.detail || 'Failed to load storage status.');
      setStorageStatus(data);
    } catch (e) {
      setStorageStatus({ error: e?.message || 'Failed to load storage status.' });
    } finally {
      setStatusLoading(false);
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-card">
        <div className="admin-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 className="admin-title" style={{ marginBottom: 6 }}>
              Upload Asset
            </h2>
            <p className="admin-subtitle" style={{ margin: 0 }}>
              Upload images, PDFs, or MP4 videos into the shared Library.
            </p>
          </div>
          <Link className="admin-button secondary" href="/admin/library">
            Back to Library
          </Link>
        </div>
      </div>

      <div className="admin-card" style={{ marginTop: 16 }}>
        {loading ? <LoadingState label="Loading…" /> : null}

        {!loading && !canUpload ? <div className="admin-alert danger">You do not have permission to upload library files.</div> : null}

        {!loading && canUpload ? (
          <>
            {message ? <div className={`admin-alert ${messageTone}`}>{message}</div> : null}
            {lastUpload ? (
              <div className="admin-card admin-card--subtle admin-card--compact" style={{ padding: 12, marginTop: 12 }}>
                <div style={{ fontWeight: 900, marginBottom: 6 }}>Last upload</div>
                <div className="admin-subtitle">
                  Backend: <strong>{String(lastUpload.storage_backend || 'unknown')}</strong> · File: <strong>{String(lastUpload.filename || '')}</strong> · Size:{' '}
                  <strong>{lastUpload.size_bytes ? `${lastUpload.size_bytes} bytes` : '—'}</strong>
                </div>
                {lastUpload.remote_dir ? <div className="admin-subtitle">Remote dir: {String(lastUpload.remote_dir)}</div> : null}
                {lastUpload.url ? (
                  <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <a className="admin-button info" href={String(lastUpload.url)} target="_blank" rel="noreferrer">
                      Open file
                    </a>
                    <Link className="admin-button secondary" href="/admin/library">
                      Go to Library
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : null}

            <form onSubmit={upload}>
              <div className="admin-grid" style={{ alignItems: 'start' }}>
                <div className="admin-card admin-card--subtle admin-card--compact">
                  <h3 style={{ marginTop: 0 }}>File</h3>
                  <div className="admin-field">
                    <label>Choose file</label>
                    <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                    <p className="admin-subtitle" style={{ marginTop: 6 }}>
                      Allowed: images (jpg/png/webp) &lt;= 1MB, PDF &lt;= 900KB, MP4 video &lt;= 25MB.
                    </p>
                  </div>
                </div>

                <div className="admin-card admin-card--subtle admin-card--compact">
                  <h3 style={{ marginTop: 0 }}>Details</h3>
                  <div className="admin-field">
                    <label>Category</label>
                    <select value={category} onChange={(e) => setCategory(e.target.value)}>
                      {categoryOptions().map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <p className="admin-subtitle" style={{ marginTop: 6 }}>
                      This controls where the asset appears when staff filter the Library by category.
                    </p>
                  </div>
                  <div className="admin-field">
                    <label>Title</label>
                    <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Optional (defaults to file name)" />
                  </div>
                  <div className="admin-field">
                    <label>Tags</label>
                    <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Comma-separated (e.g. onboarding, brand, ads)" />
                  </div>
                  <div className="admin-actions" style={{ justifyContent: 'flex-start' }}>
                    <button className="admin-button" type="submit" disabled={submitting || !file}>
                      {submitting ? 'Uploading…' : 'Upload'}
                    </button>
                    <Link className="admin-button info" href="/admin/library">
                      View library
                    </Link>
                    <button className="admin-button secondary" type="button" onClick={loadStorageStatus} disabled={statusLoading}>
                      {statusLoading ? 'Checking…' : 'Storage status'}
                    </button>
                  </div>
                </div>
              </div>
            </form>

            {storageStatus ? (
              <div className="admin-card admin-card--subtle admin-card--compact" style={{ padding: 12, marginTop: 12 }}>
                <div style={{ fontWeight: 900, marginBottom: 6 }}>Storage status</div>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, opacity: 0.9 }}>
                  {JSON.stringify(storageStatus, null, 2)}
                </pre>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
