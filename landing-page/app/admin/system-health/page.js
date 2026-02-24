'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

const statusMeta = (status) => {
  const normalized = (status || '').toLowerCase();
  if (normalized === 'error') return { label: 'ERROR', className: 'danger' };
  if (normalized === 'warning') return { label: 'WARNING', className: 'secondary' };
  return { label: 'OK', className: '' };
};

const serviceTitle = (key) => {
  const mapping = {
    application: 'Application',
    database: 'Database',
    cache: 'Cache',
    queue: 'Queue',
    mail: 'Mail',
    storage: 'Storage',
    disk: 'Disk Usage',
    cpu: 'CPU Load',
  };
  return mapping[key] || key;
};

export default function AdminSystemHealthPage() {
  const router = useRouter();
  const token = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('adminToken');
  }, []);

  const [health, setHealth] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadHealth = useCallback(
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
        const response = await fetch(`${API_URL}/api/admin/health`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (response.status === 401) {
          localStorage.removeItem('adminToken');
          router.push('/admin');
          return;
        }
        if (!response.ok) {
          throw new Error('Failed to load health');
        }
        const data = await response.json();
        setHealth(data);
      } catch (error) {
        if (!silent) {
          setMessage('Failed to load system health.');
        }
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [token, router]
  );

  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const timer = setInterval(() => loadHealth({ silent: true }), 15000);
    return () => clearInterval(timer);
  }, [autoRefresh, loadHealth]);

  const overallBadge = statusMeta(health?.status);
  const services = health?.services || {};

  return (
    <div className="admin-card">
      <div className="admin-toolbar" style={{ justifyContent: 'space-between' }}>
        <div>
          <h2 className="admin-title" style={{ marginBottom: 6 }}>
            System Health{' '}
            {health?.status ? (
              <span className={`admin-badge ${overallBadge.className || ''}`}>{overallBadge.label}</span>
            ) : null}
          </h2>
          <p className="admin-subtitle" style={{ marginBottom: 0 }}>
            Live status for core services and background jobs.
          </p>
        </div>

        <div className="admin-toolbar" style={{ margin: 0 }}>
          <label className="admin-inline-toggle">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(event) => setAutoRefresh(event.target.checked)}
            />
            Auto-refresh
          </label>
          <button type="button" className="admin-button secondary" onClick={() => loadHealth()}>
            Refresh
          </button>
        </div>
      </div>

      {message && <p className="admin-subtitle">{message}</p>}

      {isLoading ? (
        <p>Loading health checks...</p>
      ) : !health ? (
        <p>No health data yet.</p>
      ) : (
        <>
          <p className="admin-subtitle" style={{ marginTop: 12 }}>
            Last updated: {health.generated_at ? new Date(health.generated_at).toLocaleString() : '--'}
          </p>

          <div
            className="admin-grid"
            style={{
              marginTop: 16,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 14,
            }}
          >
            {Object.entries(services).map(([key, value]) => {
              const meta = statusMeta(value?.status);
              return (
                <div key={key} className="admin-mini-card">
                  <div className="admin-mini-card-header">
                    <p className="admin-mini-card-label">{serviceTitle(key)}</p>
                    <span className={`admin-badge ${meta.className || ''}`}>{meta.label}</span>
                  </div>
                  <p className="admin-mini-card-value" style={{ fontSize: 14 }}>
                    {value?.detail || '--'}
                  </p>
                  {value?.note ? (
                    <p className="admin-subtitle" style={{ marginTop: 10 }}>
                      {value.note}
                    </p>
                  ) : null}
                  {value?.path ? (
                    <p className="admin-subtitle" style={{ marginTop: 10 }}>
                      Path: {value.path}
                    </p>
                  ) : null}
                  {value?.provider ? (
                    <p className="admin-subtitle" style={{ marginTop: 10 }}>
                      Provider: {value.provider}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="admin-card" style={{ marginTop: 18 }}>
            <h3 className="admin-title" style={{ fontSize: 16 }}>
              Queue Snapshot
            </h3>
            <p className="admin-subtitle">
              Pending Jobs: {services.queue?.pending ?? '--'} | Failed Jobs: {services.queue?.failed ?? '--'}
            </p>
            <p className="admin-subtitle">Tip: Failed jobs should be reviewed and retried if needed.</p>
          </div>
        </>
      )}
    </div>
  );
}

