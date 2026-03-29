'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import EmptyState from '../ui/EmptyState';
import LoadingState from '../ui/LoadingState';
import { adminFetch, clearAdminTokens } from '../lib/adminAuth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';
const REFRESH_MS = 30000;

function hasPermission(permissions, required) {
  if (!required) return true;
  const perms = Array.isArray(permissions) ? permissions : [];
  if (perms.includes('*')) return true;
  if (Array.isArray(required)) return required.some((r) => perms.includes(r));
  return perms.includes(required);
}

function formatRelativeTime(iso) {
  if (!iso) return '';
  try {
    const dt = new Date(iso);
    const diffMs = Date.now() - dt.getTime();
    if (!Number.isFinite(diffMs)) return '';
    const diffSec = Math.max(0, Math.floor(diffMs / 1000));
    if (diffSec < 45) return 'just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
  } catch {
    return '';
  }
}

function startOfWeekUtcISO(todayUtcISO) {
  const d = new Date(`${todayUtcISO}T00:00:00Z`);
  const day = d.getUTCDay(); // 0=Sun
  const delta = (day + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - delta);
  return d.toISOString().slice(0, 10);
}

function Widget({ title, subtitle, href, actionLabel, children }) {
  return (
    <section className="admin-card admin-widget">
      <div className="admin-widget-header">
        <div>
          <h3 className="admin-widget-title">{title}</h3>
          {subtitle ? <p className="admin-help admin-widget-subtitle">{subtitle}</p> : null}
        </div>
        {href ? (
          <Link className="admin-link admin-widget-link" href={href}>
            {actionLabel || 'View'}
          </Link>
        ) : null}
      </div>
      <div className="admin-widget-body">{children}</div>
    </section>
  );
}

function MiniWeek({ days }) {
  const rows = Array.isArray(days) ? days : [];
  return (
    <div className="admin-mini-week" aria-label="This week overview">
      {rows.map((d) => {
        const date = String(d?.work_date || '');
        const label = (() => {
          try {
            const dt = new Date(`${date}T00:00:00Z`);
            return dt.toLocaleDateString(undefined, { weekday: 'short' });
          } catch {
            return date;
          }
        })();
        const hasAttendance = Boolean(d?.attendance?.clock_in_at);
        const clockedOut = Boolean(d?.attendance?.clock_out_at);
        const hasLog = Boolean(d?.work_log?.id);
        const missingLog = Boolean(d?.missing_log);

        let tone = 'off';
        let title = 'No attendance';
        if (hasAttendance && !clockedOut) {
          tone = 'progress';
          title = 'Clocked in';
        } else if (hasAttendance && clockedOut && hasLog) {
          tone = 'good';
          title = 'Complete';
        } else if (hasAttendance && missingLog) {
          tone = 'warn';
          title = 'Missing work log';
        } else if (hasAttendance) {
          tone = 'warn';
          title = 'Attendance recorded';
        }

        return (
          <div key={date} className={`admin-mini-day tone-${tone}`} title={`${label}: ${title}`}>
            <div className="admin-mini-day-label">{label}</div>
          </div>
        );
      })}
    </div>
  );
}

function IntranetTicker({ items }) {
  const rows = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!rows.length) return null;

  const tickerLabel = (u) => {
    const title = String(u?.title || 'Update').trim() || 'Update';
    const bodyRaw = String(u?.body || '');
    const body = bodyRaw.replace(/\s+/g, ' ').trim();
    if (!body) return title;
    return `${title} (${body})`;
  };

  return (
    <div className="admin-ticker" aria-label="Intranet updates ticker">
      <div className="admin-ticker-badge">Updates</div>
      <div className="admin-ticker-viewport">
        <div className="admin-ticker-track">
          <div className="admin-ticker-group">
            {rows.map((u) => (
              <Link key={u.id} className="admin-ticker-item" href="/admin/updates" title={tickerLabel(u)}>
                <span className="admin-ticker-text">{tickerLabel(u)}</span>
                {u.created_at ? <span className="admin-ticker-time">{formatRelativeTime(u.created_at)}</span> : null}
              </Link>
            ))}
          </div>
          <div className="admin-ticker-group" aria-hidden="true">
            {rows.map((u) => (
              <Link key={`dup-${u.id}`} className="admin-ticker-item" href="/admin/updates" tabIndex={-1}>
                <span className="admin-ticker-text">{tickerLabel(u)}</span>
                {u.created_at ? <span className="admin-ticker-time">{formatRelativeTime(u.created_at)}</span> : null}
              </Link>
            ))}
          </div>
        </div>
      </div>
      <Link className="admin-ticker-link" href="/admin/updates">
        View all
      </Link>
    </div>
  );
}

export default function StaffDashboard() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');
  const [me, setMe] = useState(null);
  const [todayLabel, setTodayLabel] = useState('');
  const [lastUpdatedLabel, setLastUpdatedLabel] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  const [attendanceMonth, setAttendanceMonth] = useState([]);
  const [week, setWeek] = useState(null);
  const [intranetUpdates, setIntranetUpdates] = useState([]);

  const permissions = Array.isArray(me?.permissions) ? me.permissions : [];
  const loadInFlightRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);

  const todayUtcISO = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const currentYear = useMemo(() => Number(todayUtcISO.slice(0, 4)), [todayUtcISO]);
  const currentMonth = useMemo(() => Number(todayUtcISO.slice(5, 7)), [todayUtcISO]);
  const weekStartISO = useMemo(() => startOfWeekUtcISO(todayUtcISO), [todayUtcISO]);

  useEffect(() => {
    // Avoid hydration mismatches due to server/client locale differences.
    try {
      const dt = new Date(`${todayUtcISO}T00:00:00Z`);
      setTodayLabel(
        dt.toLocaleDateString(undefined, {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          timeZone: 'UTC',
        })
      );
    } catch {
      setTodayLabel(todayUtcISO);
    }
  }, [todayUtcISO]);

  useEffect(() => {
    if (!lastUpdatedAt) return;
    try {
      const dt = new Date(lastUpdatedAt);
      setLastUpdatedLabel(
        dt.toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
        })
      );
    } catch {
      setLastUpdatedLabel(String(lastUpdatedAt));
    }
  }, [lastUpdatedAt]);

  const safeJson = useCallback(
    async (url, { timeoutMs, allowUnauthorized } = {}) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs || 12000)));
      try {
        const res = await adminFetch(url, { signal: controller.signal });
        if (res.status === 401) {
          if (!allowUnauthorized) {
            clearAdminTokens();
            router.push('/admin');
          }
          return { ok: false, status: 401, data: null };
        }
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.status, data };
      } catch (e) {
        return { ok: false, status: 0, data: null, error: e?.message || 'Network error' };
      } finally {
        clearTimeout(timeout);
      }
    },
    [router]
  );

  const load = useCallback(
    async ({ silent } = {}) => {
      if (loadInFlightRef.current) return;
      loadInFlightRef.current = true;
      try {
        const isSilent = Boolean(silent) && hasLoadedOnceRef.current;
        if (isSilent) {
          setRefreshing(true);
          setMessage('');
        } else {
          setLoading(true);
          setMessage('');
        }

        const meRes = await safeJson(`${API_URL}/api/admin/me`, { timeoutMs: 12000, allowUnauthorized: false });
        if (!meRes.ok) {
          if (meRes.status === 401) {
            // adminFetch already clears tokens and redirects; just stop the spinner to avoid an infinite loading state.
            setLoading(false);
            setRefreshing(false);
            return;
          }
          setMe(null);
          setAttendanceMonth([]);
          setWeek(null);
          setIntranetUpdates([]);
          setMessage(meRes?.data?.detail || meRes?.error || 'Dashboard is taking too long to load. Check the backend and try refresh.');
          setLoading(false);
          setRefreshing(false);
          return;
        }

        const meData = meRes.data && typeof meRes.data === 'object' ? meRes.data : null;
        setMe(meData);

        const perms = Array.isArray(meData?.permissions) ? meData.permissions : [];
        const roles = Array.isArray(meData?.roles) ? meData.roles : [];
        const isAdmin = perms.includes('*') || perms.includes('admin.manage') || roles.includes('admin');
        if (isAdmin) {
          router.replace('/admin/admin-dashboard');
          setLoading(false);
          setRefreshing(false);
          return;
        }

        const requests = [];

        if (hasPermission(perms, 'attendance.read')) {
          requests.push(
            safeJson(`${API_URL}/api/admin/attendance/month?year=${currentYear}&month=${currentMonth}`, {
              timeoutMs: 12000,
              allowUnauthorized: true,
            }).then((r) => setAttendanceMonth(Array.isArray(r?.data?.items) ? r.data.items : []))
          );
        } else {
          setAttendanceMonth([]);
        }

        if (hasPermission(perms, 'work_logs.read')) {
          requests.push(
            safeJson(`${API_URL}/api/admin/work-logs/week?start=${encodeURIComponent(weekStartISO)}`, {
              timeoutMs: 12000,
              allowUnauthorized: true,
            }).then((r) => setWeek(r?.data && typeof r.data === 'object' ? r.data : null))
          );
        } else {
          setWeek(null);
        }

        if (hasPermission(perms, 'intranet_updates.read')) {
          requests.push(
            safeJson(`${API_URL}/api/admin/intranet-updates?limit=6&offset=0`, {
              timeoutMs: 12000,
              allowUnauthorized: true,
            }).then((r) => setIntranetUpdates(Array.isArray(r?.data?.items) ? r.data.items : []))
          );
        } else {
          setIntranetUpdates([]);
        }

        await Promise.allSettled(requests);
        setLastUpdatedAt(new Date().toISOString());
        setLoading(false);
        setRefreshing(false);
      } catch (e) {
        setMessage(e?.message || 'Dashboard failed to load.');
        setLoading(false);
        setRefreshing(false);
      } finally {
        hasLoadedOnceRef.current = true;
        loadInFlightRef.current = false;
      }
    },
    [currentMonth, currentYear, safeJson, weekStartISO]
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => load({ silent: true }), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const attendanceToday = useMemo(() => {
    const key = todayUtcISO;
    return (Array.isArray(attendanceMonth) ? attendanceMonth : []).find((e) => String(e?.work_date || '') === key) || null;
  }, [attendanceMonth, todayUtcISO]);

  const todayStatus = useMemo(() => {
    const inAt = attendanceToday?.clock_in_at;
    const outAt = attendanceToday?.clock_out_at;
    if (!inAt) return { label: 'Not clocked in', badge: 'secondary' };
    if (inAt && !outAt) return { label: 'Clocked in', badge: 'warning' };
    return { label: 'Complete', badge: 'success' };
  }, [attendanceToday]);

  const weekSummary = week?.summary && typeof week.summary === 'object' ? week.summary : null;
  const weekDays = Array.isArray(week?.days) ? week.days : [];
  const todayInWeek = useMemo(() => weekDays.find((d) => String(d?.work_date || '') === todayUtcISO) || null, [todayUtcISO, weekDays]);

  const weekTasks = useMemo(() => {
    const summaryTotal = Number(weekSummary?.tasks_total ?? 0) || 0;
    const summaryDone = Number(weekSummary?.tasks_done ?? 0) || 0;
    if (summaryTotal > 0 || summaryDone > 0) return { total: summaryTotal, done: summaryDone };

    // Fallback for older servers: try per-day task counts (if present), else legacy work-log payload tasks.
    let total = 0;
    let done = 0;
    for (const d of weekDays) {
      const dt = Number(d?.tasks_total ?? 0) || 0;
      const dd = Number(d?.tasks_done ?? 0) || 0;
      if (dt || dd) {
        total += dt;
        done += dd;
        continue;
      }
      const tasks = d?.work_log?.payload?.tasks;
      if (Array.isArray(tasks)) {
        total += tasks.length;
        done += tasks.filter((t) => t && typeof t === 'object' && Boolean(t.done)).length;
      }
    }
    return { total, done };
  }, [weekDays, weekSummary]);

  const workLogToday = todayInWeek?.work_log?.id ? todayInWeek.work_log : null;
  const missingLogToday = Boolean(todayInWeek?.missing_log);

  const quickActions = useMemo(() => {
    const actions = [
      { href: '/admin/attendance', label: 'Clock in/out', perm: 'attendance.read' },
      { href: '/admin/work-logs', label: 'Write work log', perm: 'work_logs.read' },
      { href: '/admin/blog/new', label: 'New blog post', perm: ['blog.write', 'blog.publish'] },
      { href: '/admin/payroll', label: 'Run payroll', perm: 'payroll.manage' },
    ];
    return actions.filter((a) => hasPermission(permissions, a.perm));
  }, [permissions]);

  const primaryQuickActions = useMemo(() => {
    const preferred = ['/admin/attendance', '/admin/work-logs'];
    const byHref = new Map((quickActions || []).map((a) => [a.href, a]));
    return preferred.map((h) => byHref.get(h)).filter(Boolean);
  }, [quickActions]);

  const secondaryQuickActions = useMemo(() => {
    const primaryHrefs = new Set((primaryQuickActions || []).map((a) => a.href));
    return (quickActions || []).filter((a) => !primaryHrefs.has(a.href));
  }, [primaryQuickActions, quickActions]);

  const tickerUpdates = useMemo(() => (Array.isArray(intranetUpdates) ? intranetUpdates.slice(0, 8) : []), [intranetUpdates]);

  return (
    <div className="admin-dashboard">
      <div className="admin-card admin-dashboard-hero">
        <div className="admin-dashboard-hero-top">
          <div>
            <h2 className="admin-title">Dashboard</h2>
            <p className="admin-subtitle" style={{ marginBottom: 0 }}>
              Your staff workspace — attendance, work logs, and updates.
            </p>
          </div>
          <div className="admin-dashboard-hero-actions">
            <div className="admin-dashboard-refresh-note" suppressHydrationWarning>
              {refreshing ? 'Refreshing…' : lastUpdatedLabel ? `Updated ${lastUpdatedLabel}` : ''}
            </div>
            <button className="admin-button info" type="button" onClick={() => load({ silent: true })} disabled={loading || refreshing}>
              Refresh
            </button>
          </div>
        </div>

        {message ? (
          <div className="admin-alert warning" style={{ marginTop: 14 }}>
            {message}
          </div>
        ) : null}

        <div className="admin-dashboard-hero-row">
          <div className="admin-dashboard-hero-meta">
            <div className="admin-dashboard-meta-item">
              <div className="admin-dashboard-meta-label">Signed in as</div>
              <div className="admin-dashboard-meta-value">{me?.email || '—'}</div>
            </div>
            <div className="admin-dashboard-meta-item">
              <div className="admin-dashboard-meta-label">Timezone</div>
              <div className="admin-dashboard-meta-value">{me?.timezone || 'UTC'}</div>
            </div>
            <div className="admin-dashboard-meta-item">
              <div className="admin-dashboard-meta-label">Today</div>
              <div className="admin-dashboard-meta-value" suppressHydrationWarning>
                {todayLabel || '—'}
              </div>
            </div>
          </div>

          {secondaryQuickActions.length ? (
            <div className="admin-dashboard-quick-actions" aria-label="Quick actions">
              {secondaryQuickActions.slice(0, 6).map((a) => (
                <Link key={a.href} href={a.href} className="admin-quick-action">
                  {a.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>

        {primaryQuickActions.length ? (
          <div className="admin-actions" style={{ marginTop: 12, justifyContent: 'flex-start' }} aria-label="Primary quick actions">
            {primaryQuickActions.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className={`admin-button ${a.href === '/admin/work-logs' ? 'info' : ''}`.trim()}
                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
              >
                {a.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      {hasPermission(permissions, 'intranet_updates.read') ? <IntranetTicker items={tickerUpdates} /> : null}

      {loading ? (
        <div className="admin-card" style={{ marginTop: 16 }}>
          <LoadingState label="Loading your dashboard…" />
        </div>
      ) : !me ? (
        <div className="admin-card" style={{ marginTop: 16 }}>
          <EmptyState title="No session" body="Please sign in again to continue.">
            <Link className="admin-button secondary" href="/admin">
              Go to login
            </Link>
          </EmptyState>
        </div>
      ) : (
        <div className="admin-dashboard-grid" style={{ marginTop: 16 }}>
          <div className="admin-dashboard-span-6">
            <Widget title="Today at a glance" subtitle="Stay on top of the basics." href="/admin/attendance" actionLabel="Open">
              <div className="admin-dashboard-stats">
                <div className="admin-dashboard-stat">
                  <div className="admin-dashboard-stat-label">Attendance</div>
                  <div className="admin-dashboard-stat-value">
                    <span className={`admin-badge ${todayStatus.badge}`}>{todayStatus.label}</span>
                  </div>
                </div>
                <div className="admin-dashboard-stat">
                  <div className="admin-dashboard-stat-label">Work log</div>
                  <div className="admin-dashboard-stat-value">
                    {workLogToday ? (
                      <span className="admin-badge success">Submitted</span>
                    ) : missingLogToday ? (
                      <span className="admin-badge warning">Missing</span>
                    ) : (
                      <span className="admin-badge secondary">Not yet</span>
                    )}
                  </div>
                </div>
              </div>
            </Widget>
          </div>

          <div className="admin-dashboard-span-6">
            <Widget title="This week" subtitle={`Week of ${weekStartISO} (UTC work-week)`} href="/admin/work-logs" actionLabel="Work logs">
              {!hasPermission(permissions, 'work_logs.read') ? (
                <EmptyState title="No access" body="You don’t have permission to view work logs." />
              ) : !weekSummary ? (
                <EmptyState title="No data yet" body="Clock in this week to start building your work log timeline." />
              ) : (
                <div>
                  <MiniWeek days={weekDays} />
                  <div className="admin-dashboard-week-row">
                    <div className="admin-dashboard-week-metric">
                      <div className="admin-dashboard-week-label">Logs written</div>
                      <div className="admin-dashboard-week-value">{weekSummary.logs_written || 0} / 7</div>
                    </div>
                    <div className="admin-dashboard-week-metric">
                      <div className="admin-dashboard-week-label">Missing logs</div>
                      <div className="admin-dashboard-week-value">{weekSummary.missing_logs || 0}</div>
                    </div>
                    <div className="admin-dashboard-week-metric">
                      <div className="admin-dashboard-week-label">Tasks</div>
                      <div className="admin-dashboard-week-value">
                        {weekTasks.done} / {weekTasks.total} done
                      </div>
                    </div>
                    <div className="admin-dashboard-week-metric">
                      <div className="admin-dashboard-week-label">Feedback</div>
                      <div className="admin-dashboard-week-value">{weekSummary.comments_total || 0}</div>
                    </div>
                  </div>
                </div>
              )}
            </Widget>
          </div>


        </div>
      )}
    </div>
  );
}
