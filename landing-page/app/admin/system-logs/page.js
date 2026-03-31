'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

const parseLine = (line) => {
  try {
    return JSON.parse(line);
  } catch (error) {
    return { message: line };
  }
};

const formatTimestamp = (value) => {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

export default function AdminSystemLogsPage() {
  const router = useRouter();
  const token = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('adminToken');
  }, []);

  const [logs, setLogs] = useState([]);
  const [limit, setLimit] = useState(200);
  const [isLoading, setIsLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
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
        const response = await fetch(`${API_URL}/api/admin/system-logs?limit=${limit}`, {
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
          setMessage('Failed to load system logs.');
        }
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [token, router, limit]
  );

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
      <h2 className="admin-title">System Logs</h2>
      <p className="admin-subtitle">Frontend, admin, and backend diagnostics.</p>

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
                {log.path && <span className="admin-badge">{log.path}</span>}
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
