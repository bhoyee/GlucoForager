'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

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

const shortId = (value) => {
  const raw = String(value || '');
  if (raw.length <= 12) return raw || '--';
  return `${raw.slice(0, 8)}...${raw.slice(-4)}`;
};

const compactList = (items) => (Array.isArray(items) ? items.filter(Boolean) : []);

export default function SystemHealthClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('adminToken');
  }, []);

  const [health, setHealth] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isDeletingJobs, setIsDeletingJobs] = useState(false);

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

  const clearJobs = useCallback(
    async (scope) => {
      if (!token || isDeletingJobs) return;
      const labels = {
        failed: 'all failed jobs',
        operational: 'operational failed jobs',
        invalid_input: 'invalid input failed jobs',
        queue: 'pending queued jobs',
      };
      const label = labels[scope] || 'selected jobs';
      const ok = window.confirm(`Delete ${label}? This cannot be undone.`);
      if (!ok) return;
      setIsDeletingJobs(true);
      setMessage('');
      try {
        const response = await fetch(`${API_URL}/api/admin/health/ai-jobs?scope=${encodeURIComponent(scope)}`, {
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
          throw new Error(data?.detail || 'Delete failed.');
        }
        setMessage(`Deleted ${data.deleted || 0} ${label}.`);
        await loadHealth({ silent: true });
      } catch (error) {
        setMessage(error?.message || 'Delete failed.');
      } finally {
        setIsDeletingJobs(false);
      }
    },
    [isDeletingJobs, loadHealth, router, token]
  );

  const overallBadge = statusMeta(health?.status);
  const services = health?.services || {};
  const [failureView, setFailureView] = useState('operational');

  useEffect(() => {
    const requested = (searchParams?.get('failureView') || '').toLowerCase();
    if (requested === 'operational' || requested === 'invalid_input') {
      setFailureView(requested);
    }
  }, [searchParams]);

  const failedOperationalJobs = services?.queue?.failed_operational_items || [];
  const failedInvalidInputJobs = services?.queue?.failed_invalid_input_items || [];
  const failureBreakdown = services?.queue?.failed_breakdown || {};
  const cleanupInfo = services?.queue?.cleanup || null;
  const failedJobsToShow = failureView === 'operational' ? failedOperationalJobs : failedInvalidInputJobs;

  const renderFailedJob = (job) => {
    const summary = job?.payload_summary || {};
    const ingredients = compactList(summary.ingredients);
    const originalIngredients = compactList(summary.original_ingredients);
    const filters = compactList(summary.filters);
    const corrections = Array.isArray(summary.corrections) ? summary.corrections : [];
    const correctionText = corrections
      .map((item) => {
        if (!item || typeof item !== 'object') return '';
        return [item.from, item.to].filter(Boolean).join(' -> ');
      })
      .filter(Boolean)
      .join(', ');
    return (
      <div key={job.id} className="admin-health-failed-card">
        <div className="admin-health-failed-top">
          <div>
            <strong>{job.mode || job.source || 'job'}</strong>
            <p className="admin-health-job-id" title={job.id}>
              Job: {shortId(job.id)}
            </p>
          </div>
          <span className="admin-health-failed-time">{formatDateTime(job.failed_at)}</span>
        </div>

        <div className="admin-health-trace-grid">
          <div>
            <span className="admin-health-trace-label">User</span>
            <strong>{job.user_id || '--'}</strong>
          </div>
          <div>
            <span className="admin-health-trace-label">Source</span>
            <strong>{job.source || '--'}</strong>
          </div>
          <div>
            <span className="admin-health-trace-label">Reason</span>
            <strong>{job.error_code || '--'}</strong>
          </div>
          <div>
            <span className="admin-health-trace-label">Provider / model</span>
            <strong>{[job.provider, job.model].filter(Boolean).join(' / ') || '--'}</strong>
          </div>
        </div>

        <div className="admin-health-trace-block">
          <span className="admin-health-trace-label">Public message</span>
          <p>{job.public_message || job.error || '--'}</p>
        </div>

        {job.internal_reason ? (
          <div className="admin-health-trace-block">
            <span className="admin-health-trace-label">Internal reason</span>
            <p className="admin-health-trace-code">{job.internal_reason}</p>
          </div>
        ) : null}

        <div className="admin-health-trace-block">
          <span className="admin-health-trace-label">Ingredients used</span>
          {ingredients.length ? (
            <div className="admin-health-chip-row">
              {ingredients.map((item) => (
                <span key={item} className="admin-health-chip">
                  {item}
                </span>
              ))}
            </div>
          ) : (
            <p>--</p>
          )}
        </div>

        {originalIngredients.length ? (
          <div className="admin-health-trace-block">
            <span className="admin-health-trace-label">Original input</span>
            <div className="admin-health-chip-row">
              {originalIngredients.map((item) => (
                <span key={item} className="admin-health-chip muted">
                  {item}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {corrections.length || filters.length || summary.device_id ? (
          <div className="admin-health-failed-footer">
            {correctionText ? <span>Corrections: {correctionText}</span> : null}
            {summary.normalization_source ? <span>Normalization: {summary.normalization_source}</span> : null}
            {filters.length ? <span>Filters: {filters.join(', ')}</span> : null}
            {summary.device_id ? <span>Device: {summary.device_id}</span> : null}
          </div>
        ) : null}
      </div>
    );
  };

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
          <button type="button" className="admin-button info" onClick={() => loadHealth()}>
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

          <div className="admin-card admin-health-secondary" id="failed-jobs">
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
              <button
                type="button"
                className="admin-button danger"
                disabled={isDeletingJobs || (failureView === 'operational' ? !failedOperationalJobs.length : !failedInvalidInputJobs.length)}
                onClick={() => clearJobs(failureView)}
              >
                Delete shown
              </button>
              <button
                type="button"
                className="admin-button secondary"
                disabled={isDeletingJobs || !(services.queue?.failed ?? 0)}
                onClick={() => clearJobs('failed')}
              >
                Delete all failed
              </button>
              <button
                type="button"
                className="admin-button secondary"
                disabled={isDeletingJobs || !(services.queue?.pending ?? 0)}
                onClick={() => clearJobs('queue')}
              >
                Clear queue
              </button>
            </div>

            <div className="admin-health-breakdown">
              <div className="admin-health-breakdown-card">
                <p className="admin-health-breakdown-title">Top operational reasons (sample)</p>
                <div className="admin-health-breakdown-list">
                  {Object.entries(failureBreakdown?.operational || {}).length ? (
                    Object.entries(failureBreakdown.operational).map(([key, value]) => (
                      <div key={key} className="admin-health-breakdown-row">
                        <span className="admin-health-breakdown-key">{key}</span>
                        <span className="admin-health-breakdown-value">{value}</span>
                      </div>
                    ))
                  ) : (
                    <p className="admin-help">No operational breakdown available.</p>
                  )}
                </div>
              </div>
              <div className="admin-health-breakdown-card">
                <p className="admin-health-breakdown-title">Top invalid input reasons (sample)</p>
                <div className="admin-health-breakdown-list">
                  {Object.entries(failureBreakdown?.invalid_input || {}).length ? (
                    Object.entries(failureBreakdown.invalid_input).map(([key, value]) => (
                      <div key={key} className="admin-health-breakdown-row">
                        <span className="admin-health-breakdown-key">{key}</span>
                        <span className="admin-health-breakdown-value">{value}</span>
                      </div>
                    ))
                  ) : (
                    <p className="admin-help">No invalid input breakdown available.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="admin-health-failed-list">
              {failedJobsToShow.length ? (
                failedJobsToShow.map(renderFailedJob)
              ) : (
                <p className="admin-help">
                  No {failureView === 'operational' ? 'operational' : 'invalid input'} failures today.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

