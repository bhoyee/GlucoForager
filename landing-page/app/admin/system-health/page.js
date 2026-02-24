'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

const statusMeta = (status) => {
  const normalized = (status || '').toLowerCase();
  if (normalized === 'error') return { label: 'ERROR', className: 'danger' };
  if (normalized === 'warning') return { label: 'WARNING', className: 'warning' };
  return { label: 'OK', className: 'success' };
};

const statusDotClass = (status) => {
  const normalized = (status || '').toLowerCase();
  if (normalized === 'error') return 'is-danger';
  if (normalized === 'warning') return 'is-warning';
  return 'is-ok';
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

const serviceIcon = (key) => {
  const mapping = {
    application: '🟢',
    database: '🗄️',
    cache: '⚡',
    queue: '🧵',
    mail: '✉️',
    storage: '📁',
    disk: '💽',
    cpu: '🧠',
  };
  return mapping[key] || 'ℹ️';
};

const formatDateTime = (value) => {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
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
  const [failureView, setFailureView] = useState('operational');

  const failedOperationalJobs = services?.queue?.failed_operational_items || [];
  const failedInvalidInputJobs = services?.queue?.failed_invalid_input_items || [];
  const failureBreakdown = services?.queue?.failed_breakdown || {};
  const cleanupInfo = services?.queue?.cleanup || null;

  return (
    <div className="admin-card admin-health-page">
      <div className="admin-health-header">
        <div>
          <div className="admin-health-title-row">
            <h2 className="admin-title" style={{ marginBottom: 0 }}>
              System Health
            </h2>
            {health?.status ? (
              <span className={`admin-badge ${overallBadge.className || ''}`}>{overallBadge.label}</span>
            ) : null}
          </div>
          <p className="admin-subtitle" style={{ marginBottom: 0 }}>
            Live status for core services and background jobs.
          </p>
        </div>

        <div className="admin-health-actions">
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
          <div className="admin-health-meta">
            <span className="admin-health-meta-item">
              <span className="admin-health-meta-label">Last updated</span>
              <span className="admin-health-meta-value">
                {health.generated_at ? new Date(health.generated_at).toLocaleString() : '--'}
              </span>
            </span>
            <span className="admin-health-meta-item">
              <span className="admin-health-meta-label">Queue</span>
              <span className="admin-health-meta-value">
                Pending: {services.queue?.pending ?? '--'} • Failed: {services.queue?.failed ?? '--'} (
                {services.queue?.failed_operational ?? '--'} system, {services.queue?.failed_invalid_input ?? '--'} input)
              </span>
            </span>
            {cleanupInfo?.ran ? (
              <span className="admin-health-meta-item">
                <span className="admin-health-meta-label">Cleanup</span>
                <span className="admin-health-meta-value">
                  Deleted {cleanupInfo.deleted} old jobs (retention {cleanupInfo.retention_days}d)
                </span>
              </span>
            ) : null}
          </div>

          <div className="admin-health-grid">
            {Object.entries(services).map(([key, value]) => {
              const meta = statusMeta(value?.status);
              return (
                <div key={key} className="admin-health-card">
                  <div className="admin-health-card-top">
                    <div className="admin-health-card-title">
                      <span className="admin-health-icon" aria-hidden="true">
                        {serviceIcon(key)}
                      </span>
                      <div>
                        <p className="admin-health-card-label">
                          <span className={`admin-health-dot ${statusDotClass(value?.status)}`} aria-hidden="true" />
                          {serviceTitle(key)}
                        </p>
                        <p className="admin-health-card-detail">{value?.detail || '--'}</p>
                      </div>
                    </div>
                    <span className={`admin-badge ${meta.className || ''}`}>{meta.label}</span>
                  </div>

                  {value?.note ? <p className="admin-health-card-note">{value.note}</p> : null}

                  <div className="admin-health-card-footer">
                    {value?.path ? <span>Path: {value.path}</span> : null}
                    {value?.provider ? <span>Provider: {value.provider}</span> : null}
                    {typeof value?.used_percent === 'number' ? <span>Used: {value.used_percent}%</span> : null}
                    {typeof value?.load1 === 'number' ? <span>Load1: {value.load1.toFixed(2)}</span> : null}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="admin-card admin-health-secondary">
            <h3 className="admin-title" style={{ fontSize: 18 }}>
              Failed Jobs
            </h3>
            <p className="admin-subtitle">
              Operational failures are issues to investigate (timeouts, provider errors, crashes). Invalid input failures
              (e.g. “not food”) are normal user behaviour and should be tracked separately.
            </p>

            <div className="admin-toolbar" style={{ marginBottom: 16 }}>
              <button
                type="button"
                className={`admin-button ${failureView === 'operational' ? '' : 'secondary'}`}
                onClick={() => setFailureView('operational')}
              >
                Operational ({services.queue?.failed_operational ?? 0})
              </button>
              <button
                type="button"
                className={`admin-button ${failureView === 'invalid_input' ? '' : 'secondary'}`}
                onClick={() => setFailureView('invalid_input')}
              >
                Invalid input ({services.queue?.failed_invalid_input ?? 0})
              </button>
            </div>

            <div className="admin-health-breakdown">
              <div className="admin-health-breakdown-card">
                <p className="admin-health-breakdown-title">Top operational reasons (sample)</p>
                <div className="admin-health-breakdown-list">
                  {Object.keys(failureBreakdown?.operational || {}).length === 0 ? (
                    <span className="admin-subtitle" style={{ margin: 0 }}>
                      --
                    </span>
                  ) : (
                    Object.entries(failureBreakdown.operational).map(([code, count]) => (
                      <span className="admin-health-breakdown-pill" key={code}>
                        {code}: <strong>{count}</strong>
                      </span>
                    ))
                  )}
                </div>
              </div>
              <div className="admin-health-breakdown-card">
                <p className="admin-health-breakdown-title">Top invalid-input reasons (sample)</p>
                <div className="admin-health-breakdown-list">
                  {Object.keys(failureBreakdown?.invalid_input || {}).length === 0 ? (
                    <span className="admin-subtitle" style={{ margin: 0 }}>
                      --
                    </span>
                  ) : (
                    Object.entries(failureBreakdown.invalid_input).map(([code, count]) => (
                      <span className="admin-health-breakdown-pill" key={code}>
                        {code}: <strong>{count}</strong>
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>

            {failureView === 'operational' && failedOperationalJobs.length === 0 ? (
              <p className="admin-subtitle" style={{ marginBottom: 0 }}>
                No failed jobs found.
              </p>
            ) : failureView === 'invalid_input' && failedInvalidInputJobs.length === 0 ? (
              <p className="admin-subtitle" style={{ marginBottom: 0 }}>
                No invalid-input failures found.
              </p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table admin-health-table">
                  <thead>
                    <tr>
                      <th>Job</th>
                      <th>Source</th>
                      <th>User</th>
                      <th>Updated</th>
                      <th>Code</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(failureView === 'operational' ? failedOperationalJobs : failedInvalidInputJobs).map((job) => (
                      <tr key={job.id}>
                        <td className="mono">{String(job.id).slice(0, 8)}</td>
                        <td>{job.source || '--'}</td>
                        <td>{job.user_id ?? '--'}</td>
                        <td>{formatDateTime(job.updated_at)}</td>
                        <td className="mono">{job.error_code || '--'}</td>
                        <td style={{ maxWidth: 520 }}>{job.error || '--'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
