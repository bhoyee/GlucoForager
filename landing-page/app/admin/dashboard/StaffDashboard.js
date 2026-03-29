'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
  const [tickets, setTickets] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [libraryFolders, setLibraryFolders] = useState([]);
  const [myPayrollItems, setMyPayrollItems] = useState([]);
  const [intranetUpdates, setIntranetUpdates] = useState([]);

  const permissions = Array.isArray(me?.permissions) ? me.permissions : [];

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
    async (url, { timeoutMs } = {}) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs || 12000)));
      try {
        const res = await adminFetch(url, { signal: controller.signal });
        if (res.status === 401) {
          clearAdminTokens();
          router.push('/admin');
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
      const isSilent = Boolean(silent) && !loading;
      if (isSilent) {
        setRefreshing(true);
        setMessage('');
      } else {
        setLoading(true);
        setMessage('');
      }

      const meRes = await safeJson(`${API_URL}/api/admin/me`, { timeoutMs: 12000 });
      if (!meRes.ok) {
        if (meRes.status === 401) return;
        setMe(null);
        setAttendanceMonth([]);
        setWeek(null);
        setTickets([]);
        setNotifications([]);
        setLibraryFolders([]);
        setMyPayrollItems([]);
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
          safeJson(`${API_URL}/api/admin/attendance/month?year=${currentYear}&month=${currentMonth}`, { timeoutMs: 12000 }).then((r) =>
            setAttendanceMonth(Array.isArray(r?.data?.items) ? r.data.items : [])
          )
        );
      } else {
        setAttendanceMonth([]);
      }

      if (hasPermission(perms, 'work_logs.read')) {
        requests.push(
          safeJson(`${API_URL}/api/admin/work-logs/week?start=${encodeURIComponent(weekStartISO)}`, { timeoutMs: 12000 }).then((r) =>
            setWeek(r?.data && typeof r.data === 'object' ? r.data : null)
          )
        );
      } else {
        setWeek(null);
      }

      if (hasPermission(perms, 'tickets.read')) {
        requests.push(
          safeJson(`${API_URL}/api/admin/help/tickets?mine=1`, { timeoutMs: 12000 }).then((r) =>
            setTickets(Array.isArray(r?.data?.items) ? r.data.items : [])
          )
        );
      } else {
        setTickets([]);
      }

      if (hasPermission(perms, 'notifications.read')) {
        requests.push(
          safeJson(`${API_URL}/api/admin/staff-notifications?unread_only=1&limit=200&offset=0`, { timeoutMs: 12000 }).then((r) =>
            setNotifications(Array.isArray(r?.data?.items) ? r.data.items : [])
          )
        );
      } else {
        setNotifications([]);
      }

      if (hasPermission(perms, 'library.read')) {
        requests.push(
          safeJson(`${API_URL}/api/admin/library/folders`, { timeoutMs: 12000 }).then((r) =>
            setLibraryFolders(Array.isArray(r?.data?.items) ? r.data.items : [])
          )
        );
      } else {
        setLibraryFolders([]);
      }

      if (hasPermission(perms, 'payroll.read_own')) {
        requests.push(
          safeJson(`${API_URL}/api/admin/payroll/my/items`, { timeoutMs: 12000 }).then((r) =>
            setMyPayrollItems(Array.isArray(r?.data?.items) ? r.data.items : [])
          )
        );
      } else {
        setMyPayrollItems([]);
      }

      if (hasPermission(perms, 'intranet_updates.read')) {
        requests.push(
          safeJson(`${API_URL}/api/admin/intranet-updates?limit=6&offset=0`, { timeoutMs: 12000 }).then((r) =>
            setIntranetUpdates(Array.isArray(r?.data?.items) ? r.data.items : [])
          )
        );
      } else {
        setIntranetUpdates([]);
      }

      await Promise.allSettled(requests);
      setLastUpdatedAt(new Date().toISOString());
      setLoading(false);
      setRefreshing(false);
    },
    [currentMonth, currentYear, loading, safeJson, weekStartISO]
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

  const workLogToday = todayInWeek?.work_log?.id ? todayInWeek.work_log : null;
  const missingLogToday = Boolean(todayInWeek?.missing_log);

  const unreadCount = useMemo(() => {
    const c = Array.isArray(notifications) ? notifications.length : 0;
    return c >= 200 ? '200+' : String(c);
  }, [notifications]);

  const openTickets = useMemo(() => {
    const rows = Array.isArray(tickets) ? tickets : [];
    return rows.filter((t) => String(t?.status || '').toLowerCase() !== 'closed');
  }, [tickets]);

  const myPayrollLatest = useMemo(() => {
    const rows = Array.isArray(myPayrollItems) ? myPayrollItems : [];
    const withPeriod = rows
      .map((r) => ({
        ...r,
        _period: `${Number(r?.year || 0)}-${String(Number(r?.month || 0)).padStart(2, '0')}`,
      }))
      .filter((r) => /^\\d{4}-\\d{2}$/.test(r._period))
      .sort((a, b) => b._period.localeCompare(a._period));
    if (!withPeriod.length) return null;
    const period = withPeriod[0]._period;
    const periodRows = withPeriod.filter((r) => r._period === period);
    const totals = new Map();
    for (const r of periodRows) {
      const cur = String(r?.currency || '').toUpperCase() || '—';
      const net = Number(r?.net || 0) || 0;
      totals.set(cur, (totals.get(cur) || 0) + net);
    }
    return { period, totals: Array.from(totals.entries()).map(([currency, net]) => ({ currency, net })) };
  }, [myPayrollItems]);

  const quickActions = useMemo(() => {
    const actions = [
      { href: '/admin/attendance', label: 'Clock in/out', perm: 'attendance.read' },
      { href: '/admin/work-logs', label: 'Write work log', perm: 'work_logs.read' },
      { href: '/admin/help', label: 'Help tickets', perm: 'tickets.read' },
      { href: '/admin/library', label: 'Open library', perm: 'library.read' },
      { href: '/admin/blog/new', label: 'New blog post', perm: ['blog.write', 'blog.publish'] },
      { href: '/admin/payroll', label: 'Run payroll', perm: 'payroll.manage' },
    ];
    return actions.filter((a) => hasPermission(permissions, a.perm));
  }, [permissions]);

  return (
    <div className="admin-dashboard">
      <div className="admin-card admin-dashboard-hero">
        <div className="admin-dashboard-hero-top">
          <div>
            <h2 className="admin-title">Dashboard</h2>
            <p className="admin-subtitle" style={{ marginBottom: 0 }}>
              Your staff workspace — attendance, work logs, tickets, and updates.
            </p>
          </div>
          <div className="admin-dashboard-hero-actions">
            <div className="admin-dashboard-refresh-note" suppressHydrationWarning>
              {refreshing ? 'Refreshing…' : lastUpdatedLabel ? `Updated ${lastUpdatedLabel}` : ''}
            </div>
            <button className="admin-button secondary" type="button" onClick={() => load({ silent: true })} disabled={loading || refreshing}>
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

          {quickActions.length ? (
            <div className="admin-dashboard-quick-actions" aria-label="Quick actions">
              {quickActions.slice(0, 6).map((a) => (
                <Link key={a.href} href={a.href} className="admin-quick-action">
                  {a.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </div>

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
          <div className="admin-dashboard-span-4">
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
                {hasPermission(permissions, 'notifications.read') ? (
                  <div className="admin-dashboard-stat">
                    <div className="admin-dashboard-stat-label">Unread</div>
                    <div className="admin-dashboard-stat-value">{unreadCount}</div>
                    <Link className="admin-link" href="/admin/inbox">
                      View inbox
                    </Link>
                  </div>
                ) : null}
                {hasPermission(permissions, 'tickets.read') ? (
                  <div className="admin-dashboard-stat">
                    <div className="admin-dashboard-stat-label">Open tickets</div>
                    <div className="admin-dashboard-stat-value">{openTickets.length}</div>
                    <Link className="admin-link" href="/admin/help">
                      View tickets
                    </Link>
                  </div>
                ) : null}
              </div>
            </Widget>
          </div>

          <div className="admin-dashboard-span-5">
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
                        {weekSummary.tasks_done || 0} / {weekSummary.tasks_total || 0} done
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

          <div className="admin-dashboard-span-3">
            <Widget title="My tickets" subtitle="Assigned and created tickets." href="/admin/help" actionLabel="Open">
              {!hasPermission(permissions, 'tickets.read') ? (
                <EmptyState title="No access" body="You don’t have permission to view tickets." />
              ) : openTickets.length === 0 ? (
                <EmptyState title="No open tickets" body="You’re all caught up. Create a ticket when you need help." />
              ) : (
                <div className="admin-widget-list">
                  {openTickets.slice(0, 6).map((t) => {
                    const status = String(t?.status || '').toLowerCase();
                    const badge = status === 'open' ? 'warning' : status === 'in_progress' ? 'secondary' : 'secondary';
                    return (
                      <div key={t.id} className="admin-widget-list-item">
                        <div className="admin-widget-list-main">
                          <div className="admin-widget-list-title">{t.subject || `Ticket #${t.id}`}</div>
                          <div className="admin-widget-list-meta">
                            <span className={`admin-badge ${badge}`}>{status || 'open'}</span>
                            <span className="admin-widget-list-dot">·</span>
                            <span className="admin-help" style={{ margin: 0 }}>
                              {formatRelativeTime(t.updated_at || t.created_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <Link className="admin-link" href="/admin/help" style={{ marginTop: 10, display: 'inline-block' }}>
                    View all tickets
                  </Link>
                </div>
              )}
            </Widget>
          </div>

          {hasPermission(permissions, 'notifications.read') ? (
            <div className="admin-dashboard-span-4">
              <Widget title="Inbox" subtitle="Unread updates and notifications." href="/admin/inbox" actionLabel="Inbox">
                {notifications.length === 0 ? (
                  <EmptyState title="All caught up" body="No unread notifications right now." />
                ) : (
                  <div className="admin-widget-list">
                    {notifications.slice(0, 6).map((n) => (
                      <div key={n.id} className="admin-widget-list-item">
                        <div className="admin-widget-list-main">
                          <div className="admin-widget-list-title">{n.title || 'Notification'}</div>
                          <div className="admin-widget-list-meta">
                            <span className="admin-badge secondary">{String(n.type || 'update').replace('.', ' ')}</span>
                            <span className="admin-widget-list-dot">·</span>
                            <span className="admin-help" style={{ margin: 0 }}>
                              {formatRelativeTime(n.created_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Widget>
            </div>
          ) : null}

          {hasPermission(permissions, 'intranet_updates.read') ? (
            <div className="admin-dashboard-span-4">
              <Widget title="Intranet updates" subtitle="Internal announcements from Admin/HR." href="/admin/updates" actionLabel="All updates">
                {intranetUpdates.length === 0 ? (
                  <EmptyState title="No updates yet" body="When Admin/HR posts an update, it will show here." />
                ) : (
                  <div className="admin-widget-list">
                    {intranetUpdates.slice(0, 6).map((u) => (
                      <div key={u.id} className="admin-widget-list-item">
                        <div className="admin-widget-list-main">
                          <div className="admin-widget-list-title">{u.title || 'Update'}</div>
                          <div className="admin-help" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                            {String(u.body || '').slice(0, 160)}
                            {String(u.body || '').length > 160 ? '…' : ''}
                          </div>
                          <div className="admin-widget-list-meta" style={{ marginTop: 8 }}>
                            <span className="admin-badge secondary">update</span>
                            <span className="admin-widget-list-dot">·</span>
                            <span className="admin-help" style={{ margin: 0 }}>
                              {formatRelativeTime(u.created_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Widget>
            </div>
          ) : null}

          {hasPermission(permissions, 'library.read') ? (
            <div className="admin-dashboard-span-4">
              <Widget title="Library" subtitle="Shared documents, images, and training." href="/admin/library" actionLabel="Open">
                {libraryFolders.length === 0 ? (
                  <EmptyState title="No uploads yet" body="Upload documents and images so the team can find them later." />
                ) : (
                  <div>
                    <div className="admin-dashboard-folder-grid">
                      {libraryFolders.slice(0, 6).map((f) => (
                        <div key={f.folder} className="admin-dashboard-folder">
                          <div className="admin-dashboard-folder-name">{f.folder}</div>
                          <div className="admin-dashboard-folder-count">{f.count} item(s)</div>
                        </div>
                      ))}
                    </div>
                    {hasPermission(permissions, 'library.upload') ? (
                      <div style={{ marginTop: 12 }}>
                        <Link className="admin-button secondary" href="/admin/library">
                          Upload to library
                        </Link>
                      </div>
                    ) : null}
                  </div>
                )}
              </Widget>
            </div>
          ) : null}

          {hasPermission(permissions, 'payroll.read_own') ? (
            <div className="admin-dashboard-span-4">
              <Widget title="My payroll" subtitle="Latest payslip snapshot." href="/admin/my-payroll" actionLabel="Payslips">
                {!myPayrollLatest ? (
                  <EmptyState title="No payslips yet" body="Once HR generates a payroll run, your payslips will show up here." />
                ) : (
                  <div className="admin-dashboard-payroll">
                    <div className="admin-dashboard-payroll-period">{myPayrollLatest.period}</div>
                    <div className="admin-dashboard-payroll-totals">
                      {myPayrollLatest.totals.map((t) => (
                        <div key={t.currency} className="admin-dashboard-payroll-total">
                          <div className="admin-help" style={{ margin: 0 }}>
                            {t.currency} net
                          </div>
                          <div className="admin-dashboard-payroll-value">{Number(t.net || 0).toFixed(2)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Widget>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
