'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import LoadingState from '../../ui/LoadingState';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

function folderForFile(file) {
  const ct = String(file?.type || '').toLowerCase();
  const name = String(file?.name || '').toLowerCase();
  if (ct.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/.test(name)) return 'images';
  if (ct.includes('application/pdf') || name.endsWith('.pdf')) return 'pdfs';
  if (ct === 'video/mp4' || name.endsWith('.mp4')) return 'videos';
  return 'general';
}

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
    { value: 'support', label: 'Support' },
    { value: 'designer', label: 'Designer' },
    { value: 'developer', label: 'Developer' },
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

            <form onSubmit={upload}>
              <div className="admin-grid" style={{ alignItems: 'start' }}>
                <div className="admin-card admin-card--subtle admin-card--compact">
                  <h3 style={{ marginTop: 0 }}>File</h3>
                  <div className="admin-field">
                    <label>Choose file</label>
                    <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                    <p className="admin-subtitle" style={{ marginTop: 6 }}>
                      Allowed: images (jpg/png/webp) â‰¤ 1MB, PDF â‰¤ 900KB, MP4 video â‰¤ 25MB.
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
                  </div>
                </div>
              </div>
            </form>
          </>
        ) : null}
      </div>
    </div>
  );
}
