'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

const formatBytes = (bytes) => {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const sized = value / 1024 ** index;
  return `${sized.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const formatDateTime = (value) => {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const sortItems = (items, sortKey, sortDir) => {
  const direction = sortDir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    const av = a?.[sortKey];
    const bv = b?.[sortKey];
    if (sortKey === 'created_at') {
      const ad = new Date(av || 0).getTime();
      const bd = new Date(bv || 0).getTime();
      return (ad - bd) * direction;
    }
    if (sortKey === 'size_bytes') {
      return (Number(av || 0) - Number(bv || 0)) * direction;
    }
    return String(av || '').localeCompare(String(bv || '')) * direction;
  });
};

export default function AdminDbBackupsPage() {
  const router = useRouter();
  const token = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('adminToken');
  }, []);

  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const pageSize = 12;

  const [confirmDelete, setConfirmDelete] = useState(null);
  const [busyFilename, setBusyFilename] = useState('');
  const [busyDownloadFilename, setBusyDownloadFilename] = useState('');
  const [isRunningBackup, setIsRunningBackup] = useState(false);

  const loadBackups = useCallback(async () => {
    if (!token) {
      router.push('/admin');
      return;
    }
    setIsLoading(true);
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/admin/backups`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) throw new Error('Failed to load backups');
      const payload = await response.json();
      setData(payload);
    } catch (error) {
      setMessage('Failed to load backups.');
    } finally {
      setIsLoading(false);
    }
  }, [router, token]);

  useEffect(() => {
    loadBackups();
  }, [loadBackups]);

  const handleRunBackup = async () => {
    if (!token) return;
    setIsRunningBackup(true);
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/admin/backups/run`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (response.status === 409) {
        setMessage('A backup is already running. Please wait and refresh.');
        return;
      }
      if (!response.ok) {
        let detail = 'Failed to start backup.';
        try {
          const payload = await response.json();
          if (payload?.detail) detail = String(payload.detail);
        } catch (error) {
          // ignore
        }
        setMessage(detail);
        return;
      }

      setMessage('Backup started. This may take a minute. Refreshing...');
      setTimeout(() => {
        loadBackups();
      }, 2500);
    } catch (error) {
      setMessage('Failed to start backup.');
    } finally {
      setIsRunningBackup(false);
    }
  };

  const handleDownload = async (filename) => {
    if (!token || !filename) return;
    setBusyDownloadFilename(filename);
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/admin/backups/download/${encodeURIComponent(filename)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage('Failed to download backup.');
    } finally {
      setBusyDownloadFilename('');
    }
  };

  const handleDelete = async (filename) => {
    if (!token || !filename) return;
    setBusyFilename(filename);
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/admin/backups/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) throw new Error('Delete failed');
      setConfirmDelete(null);
      await loadBackups();
    } catch (error) {
      setMessage('Failed to delete backup.');
    } finally {
      setBusyFilename('');
    }
  };

  const allItems = Array.isArray(data?.items) ? data.items : [];
  const filtered = allItems.filter((item) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return String(item?.filename || '').toLowerCase().includes(q);
  });
  const sorted = sortItems(filtered, sortKey, sortDir);
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const slice = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const latest = data?.latest || null;
  const lastStatus = data?.status || null;
  const statusLabel =
    lastStatus?.state === 'success'
      ? 'OK'
      : lastStatus?.state === 'error'
        ? 'Error'
        : lastStatus?.state === 'running'
          ? 'Running'
          : '--';

  return (
    <div className="admin-card">
      <div className="admin-toolbar" style={{ justifyContent: 'space-between' }}>
        <div>
          <h2 className="admin-title" style={{ marginBottom: 6 }}>
            Database Backups
          </h2>
          <p className="admin-subtitle" style={{ marginBottom: 0 }}>
            Create and manage Postgres backups. Daily backups run automatically at 02:00 (configurable).
          </p>
        </div>
        <div className="admin-toolbar" style={{ margin: 0 }}>
          <button type="button" className="admin-button secondary" onClick={loadBackups} disabled={isLoading}>
            Refresh
          </button>
          <button type="button" className="admin-button" onClick={handleRunBackup} disabled={isRunningBackup}>
            {isRunningBackup ? 'Running...' : 'Run backup now'}
          </button>
        </div>
      </div>

      {message ? <p className="admin-subtitle" style={{ marginTop: 12 }}>{message}</p> : null}
      {lastStatus?.state === 'error' && lastStatus?.error ? (
        <p className="admin-subtitle" style={{ marginTop: 8, color: '#b91c1c' }}>
          Last backup error: {String(lastStatus.error)}
        </p>
      ) : null}

      {isLoading ? (
        <p>Loading backups...</p>
      ) : (
        <>
          <div className="admin-health-meta" style={{ marginTop: 16 }}>
            <span className="admin-health-meta-item">
              <span className="admin-health-meta-label">Last backup</span>
              <span className="admin-health-meta-value">
                {latest ? `${formatDateTime(latest.created_at)} • ${latest.filename}` : '--'}
              </span>
            </span>
            <span className="admin-health-meta-item">
              <span className="admin-health-meta-label">Total backups</span>
              <span className="admin-health-meta-value">{data?.total ?? 0}</span>
            </span>
            <span className="admin-health-meta-item">
              <span className="admin-health-meta-label">Last run</span>
              <span className="admin-health-meta-value">{statusLabel}</span>
            </span>
            <span className="admin-health-meta-item">
              <span className="admin-health-meta-label">Retention</span>
              <span className="admin-health-meta-value">
                {data?.prune?.retention_days ?? 7} days (auto-delete old backups)
              </span>
            </span>
          </div>

          <div className="admin-toolbar" style={{ marginTop: 10 }}>
            <input
              className="admin-input"
              placeholder="Search by filename..."
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              style={{ maxWidth: 360 }}
            />
            <select value={sortKey} onChange={(event) => setSortKey(event.target.value)}>
              <option value="created_at">Sort: Created</option>
              <option value="size_bytes">Sort: Size</option>
              <option value="filename">Sort: Filename</option>
            </select>
            <select value={sortDir} onChange={(event) => setSortDir(event.target.value)}>
              <option value="desc">Desc</option>
              <option value="asc">Asc</option>
            </select>
          </div>

          {slice.length === 0 ? (
            <p className="admin-subtitle" style={{ marginTop: 16, marginBottom: 0 }}>
              No backups found.
            </p>
          ) : (
            <div className="admin-table-wrap" style={{ marginTop: 14 }}>
              <table className="admin-table admin-health-table">
                <thead>
                  <tr>
                    <th>Filename</th>
                    <th>Size</th>
                    <th>Created</th>
                    <th style={{ width: 120 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {slice.map((item) => (
                    <tr key={item.filename}>
                      <td className="mono">{item.filename}</td>
                      <td>{formatBytes(item.size_bytes)}</td>
                      <td>{formatDateTime(item.created_at)}</td>
                      <td>
                        <div className="admin-inline" style={{ gap: 10 }}>
                          <button
                            type="button"
                            className="admin-icon-button"
                            onClick={() => handleDownload(item.filename)}
                            disabled={busyDownloadFilename === item.filename || busyFilename === item.filename}
                            aria-label="Download backup"
                            title="Download"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              width="18"
                              height="18"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <path d="M7 10l5 5 5-5" />
                              <path d="M12 15V3" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="admin-icon-button danger"
                            onClick={() => setConfirmDelete(item.filename)}
                            disabled={busyFilename === item.filename || busyDownloadFilename === item.filename}
                            aria-label="Delete backup"
                            title="Delete"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              width="18"
                              height="18"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M3 6h18" />
                              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                              <path d="M10 11v6" />
                              <path d="M14 11v6" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="admin-pagination" style={{ marginTop: 16 }}>
            <button
              type="button"
              className="admin-button secondary"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
            >
              Previous
            </button>
            <span className="admin-subtitle" style={{ margin: 0 }}>
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              className="admin-button secondary"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
            >
              Next
            </button>
          </div>
        </>
      )}

      {confirmDelete ? (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
          <div className="admin-modal">
            <h3 className="admin-title" style={{ fontSize: 18 }}>
              Delete backup?
            </h3>
            <p className="admin-subtitle">
              This will permanently delete <strong>{confirmDelete}</strong>.
            </p>
            <div className="admin-inline" style={{ justifyContent: 'flex-end', gap: 12 }}>
              <button type="button" className="admin-button secondary" onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="admin-button danger"
                onClick={() => handleDelete(confirmDelete)}
                disabled={busyFilename === confirmDelete}
              >
                {busyFilename === confirmDelete ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
