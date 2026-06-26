'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

const stringifyValue = (value) => {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return String(value);
  }
};

const parseLine = (line) => {
  if (line && typeof line === 'object' && !Array.isArray(line)) {
    return line;
  }
  try {
    return JSON.parse(line);
  } catch (error) {
    return { message: stringifyValue(line) || 'Log entry' };
  }
};

const formatTimestamp = (value) => {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

export default function AdminMobileLogsPage() {
  const router = useRouter();
  const token = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('adminToken');
  }, []);

  const [logs, setLogs] = useState([]);
  const [limit, setLimit] = useState(200);
  const [isLoading, setIsLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isClearing, setIsClearing] = useState(false);
  const [message, setMessage] = useState('');

  const loadLogs = useCallback(
    async (options = {}) => {
      const { silent = false } = options;
      if (!token) {
        router.push('/admin');
        return;
      }
      if (!silent) {
        setIsLoading(true);
        setMessage('');
      }
      try {
        const response = await fetch(`${API_URL}/api/admin/mobile-logs?limit=${limit}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.status === 401) {
          localStorage.removeItem('adminToken');
          router.push('/admin');
          return;
        }
        if (!response.ok) {
          throw new Error('Failed to load logs');
        }
        const data = await response.json();
        const items = Array.isArray(data.items) ? data.items : [];
        setLogs(items.map(parseLine));
      } catch (error) {
        if (!silent) {
          setMessage('Failed to load mobile logs.');
        }
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [token, router, limit]
  );

  const clearLogs = useCallback(async () => {
    if (!token || isClearing) return;
    const ok = window.confirm('Delete all current and rotated mobile logs? This cannot be undone.');
    if (!ok) return;
    setIsClearing(true);
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/admin/mobile-logs`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.detail || 'Failed to clear mobile logs.');
      }
      setLogs([]);
      setMessage(`Mobile logs cleared. Removed ${data.deleted_rotated || 0} archived log file(s).`);
    } catch (error) {
      setMessage(error?.message || 'Failed to clear mobile logs.');
    } finally {
      setIsClearing(false);
    }
  }, [isClearing, router, token]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const timer = setInterval(() => loadLogs({ silent: true }), 15000);
    return () => clearInterval(timer);
  }, [autoRefresh, loadLogs]);

  return (
    <div className="admin-card">
      <h2 className="admin-title">Mobile Logs</h2>
      <p className="admin-subtitle">Latest client-side errors and diagnostics.</p>

      {message && <p className="admin-subtitle">{message}</p>}

      <div className="admin-toolbar">
        <label className="admin-inline-toggle">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(event) => setAutoRefresh(event.target.checked)}
          />
          Auto-refresh
        </label>
        <select value={limit} onChange={(event) => setLimit(Number(event.target.value))}>
          <option value={50}>Last 50</option>
          <option value={100}>Last 100</option>
          <option value={200}>Last 200</option>
          <option value={500}>Last 500</option>
        </select>
        <button type="button" className="admin-button info" onClick={() => loadLogs()}>
          Refresh
        </button>
        <button
          type="button"
          className="admin-button danger"
          disabled={isClearing}
          onClick={clearLogs}
        >
          {isClearing ? 'Clearing...' : 'Clear logs'}
        </button>
      </div>

      {isLoading ? (
        <p>Loading logs...</p>
      ) : logs.length === 0 ? (
        <p>No logs yet.</p>
      ) : (
        <div className="admin-log-list">
          {logs.map((log, index) => (
            <div className="admin-log-card" key={`${log.timestamp || log.received_at || index}`}>
              <div className="admin-log-meta">
                <span>{formatTimestamp(log.timestamp || log.received_at)}</span>
                <span className={`admin-badge ${log.level === 'error' ? 'danger' : 'secondary'}`}>
                  {log.level || 'info'}
                </span>
                {log.source && <span className="admin-badge secondary">{log.source}</span>}
                {log.user_email && <span className="admin-badge">{log.user_email}</span>}
              </div>
              <p className="admin-log-message">{log.message}</p>
              {log.details && <p className="admin-log-details">{log.details}</p>}
              <div className="admin-log-footer">
                {log.app_version && <span>App: {log.app_version}</span>}
                {log.device && <span>Device: {log.device}</span>}
                {log.ip && <span>IP: {log.ip}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
