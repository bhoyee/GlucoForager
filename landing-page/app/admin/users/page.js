'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';
const PAGE_SIZE = 12;

const ACCESS_META = {
  premium: { label: 'Premium active', badge: 'plan-premium' },
  trialing: { label: 'Store trial', badge: 'success' },
  trial: { label: 'Store trial', badge: 'success' },
  cancelled_active: { label: 'Cancelled active', badge: 'warning' },
  legacy_grace: { label: 'Welcome week', badge: 'welcome' },
  grace: { label: 'Welcome week', badge: 'welcome' },
  // Free plan users who once had a store trial or subscription (win-back audience).
  expired: { label: 'Lapsed', badge: 'warning' },
  blocked: { label: 'Blocked', badge: 'danger' },
  suspended: { label: 'Suspended', badge: 'danger' },
  deleted: { label: 'Deleted', badge: 'danger' },
  free: { label: 'Free plan', badge: 'plan-free' },
};

const getAccessMeta = (status) => ACCESS_META[String(status || 'free').toLowerCase()] || ACCESS_META.free;

const formatAccessDaysLeft = (user) => {
  const status = String(user?.access_status || '').toLowerCase();
  const days = Number(user?.trial_days_left || 0);
  if (!['trialing', 'trial', 'cancelled_active', 'legacy_grace', 'grace'].includes(status) || days <= 0) return '';
  return `${days} day${days === 1 ? '' : 's'} left`;
};

const getAccessEndDate = (user) => {
  const status = String(user?.access_status || '').toLowerCase();
  if (['trialing', 'trial', 'cancelled_active'].includes(status)) return user?.trial_ends_at || user?.expires_at;
  if (['legacy_grace', 'grace'].includes(status)) return user?.trial_grace_ends_at;
  return user?.expires_at;
};

const STAT_ICONS = {
  users: 'M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0Zm-12 9a8 8 0 0 1 16 0',
  phone: 'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm3 17h2',
  spark: 'M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5m7 7L18 18M6 18l2.5-2.5m7-7L18 6',
};

// One stat card: accent bar, label, big number, share of all users and a one-line hint.
function StatCard({ label, value, hint, accent, icon, total, live, active, onClick }) {
  const pct = total ? Math.round((Number(value || 0) / total) * 100) : null;
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`admin-stat-card${active ? ' is-active' : ''}${onClick ? ' is-clickable' : ''}`}
      style={{ '--accent': accent }}
    >
      <span className="admin-stat-top">
        <span className="admin-stat-label">
          {icon ? (
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
              <path d={STAT_ICONS[icon]} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <span className="admin-stat-dot" />
          )}
          {label}
        </span>
        {live ? <span className="admin-stat-live">Live</span> : null}
      </span>
      <span className="admin-stat-value">{Number(value || 0).toLocaleString()}</span>
      <span className="admin-stat-hint">
        {pct !== null && label !== 'Total users' ? <strong>{pct}%</strong> : null}
        {pct !== null && label !== 'Total users' ? ' · ' : ''}
        {hint}
      </span>
    </Tag>
  );
}

export default function AdminUsersPage() {
  const router = useRouter();
  const token = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('adminToken');
  }, []);

  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState(() => {
    if (typeof window === 'undefined') return 'all';
    return new URLSearchParams(window.location.search).get('tier') || 'all';
  });
  const [sortKey, setSortKey] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [page, setPage] = useState(1);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [platformSummary, setPlatformSummary] = useState({ ios: 0, android: 0, total: 0 });
  const [accessSummary, setAccessSummary] = useState({
    legacy_grace: 0,
    trialing: 0,
    cancelled_active: 0,
    free: 0,
    expired: 0,
    premium: 0,
    blocked: 0,
    suspended: 0,
    deleted: 0,
    total: 0,
  });
  const [platformUpdatedAt, setPlatformUpdatedAt] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [exportingUsers, setExportingUsers] = useState(false);
  const [message, setMessage] = useState('');
  const [pendingAction, setPendingAction] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const buildQuery = () => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('page_size', String(PAGE_SIZE));
    params.set('sort', sortKey);
    params.set('order', sortOrder);
    if (search.trim()) params.set('q', search.trim());
    if (tierFilter !== 'all') params.set('tier', tierFilter);
    if (includeDeleted) params.set('include_deleted', '1');
    return params.toString();
  };

  const loadUsers = useCallback(async (options = {}) => {
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
      const response = await fetch(`${API_URL}/api/admin/users?${buildQuery()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await response.json();
      const items = Array.isArray(data.items) ? data.items : [];
      setUsers(items);
      setTotalItems(data.total || items.length);
      setTotalPages(Math.max(1, Math.ceil((data.total || items.length) / PAGE_SIZE)));
    } catch (error) {
      if (!silent) {
        setMessage('Failed to load users.');
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, [token, page, sortKey, sortOrder, search, tierFilter, includeDeleted, router]);

  const loadPlatformSummary = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch(`${API_URL}/api/admin/users/platform-summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error();
      setPlatformSummary({
        ios: Number(data.ios || 0),
        android: Number(data.android || 0),
        total: Number(data.total || 0),
      });
      setPlatformUpdatedAt(new Date());
    } catch {
      // Keep the last good value; the table load handles visible error messaging.
    }
  }, [token, router]);

  const loadAccessSummary = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch(`${API_URL}/api/admin/users/access-summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error();
      setAccessSummary({
        legacy_grace: Number(data.legacy_grace || data.grace || 0),
        trialing: Number(data.trialing || data.trial || 0),
        cancelled_active: Number(data.cancelled_active || 0),
        free: Number(data.free || 0),
        expired: Number(data.expired || 0),
        premium: Number(data.premium || 0),
        blocked: Number(data.blocked || 0),
        suspended: Number(data.suspended || 0),
        deleted: Number(data.deleted || 0),
        total: Number(data.total || 0),
      });
    } catch {
      // Keep the last good value; the table load handles visible error messaging.
    }
  }, [token, router]);

  useEffect(() => {
    if (!token) {
      router.push('/admin');
      return;
    }
    loadUsers();
    loadPlatformSummary();
    loadAccessSummary();
  }, [token, loadUsers, loadPlatformSummary, loadAccessSummary]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const timer = setInterval(() => {
      loadUsers({ silent: true });
      loadPlatformSummary();
      loadAccessSummary();
    }, 20000);
    return () => clearInterval(timer);
  }, [autoRefresh, loadUsers, loadPlatformSummary, loadAccessSummary]);

  const downloadUsersExcel = async () => {
    if (!token || exportingUsers) return;
    setExportingUsers(true);
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/admin/users/export.xls`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      const href = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = 'glucoforager_users.xls';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(href);
    } catch {
      setMessage('Failed to download users Excel file.');
    } finally {
      setExportingUsers(false);
    }
  };

  const handleSuspend = async (user) => {
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${user.id}/suspend`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Account locked by admin.' }),
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) throw new Error();
      loadUsers({ silent: true });
      return true;
    } catch (error) {
      setMessage('Failed to suspend user.');
      return false;
    }
  };

  const handleUnsuspend = async (user) => {
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${user.id}/unsuspend`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) throw new Error();
      loadUsers({ silent: true });
      return true;
    } catch (error) {
      setMessage('Failed to unsuspend user.');
      return false;
    }
  };

  const handleDelete = async (user) => {
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${user.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to delete user.');
      }
      loadUsers({ silent: true });
      loadAccessSummary();
      loadPlatformSummary();
      return true;
    } catch (error) {
      setMessage(error?.message || 'Failed to delete user.');
      return false;
    }
  };

  const handleRestore = async (user) => {
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${user.id}/restore`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return false;
      }
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to restore user.');
      }
      loadUsers({ silent: true });
      loadAccessSummary();
      loadPlatformSummary();
      return true;
    } catch (error) {
      setMessage(error?.message || 'Failed to restore user.');
      return false;
    }
  };

  const handlePermanentDelete = async (user) => {
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${user.id}/permanent`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return false;
      }
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to permanently delete user.');
      }
      loadUsers({ silent: true });
      loadAccessSummary();
      loadPlatformSummary();
      return true;
    } catch (error) {
      setMessage(error?.message || 'Failed to permanently delete user.');
      return false;
    }
  };
  const requestAction = (type, user) => {
    setPendingAction({ type, user });
  };

  const getConfirmContent = (action) => {
    if (!action) return null;
    const { type, user } = action;
    if (type === 'suspend') {
      return {
        title: 'Suspend user',
        message: `Suspend ${user.email}? They will be unable to log in.`,
        confirmLabel: 'Suspend',
        tone: 'danger',
      };
    }
    if (type === 'unsuspend') {
      return {
        title: 'Unsuspend user',
        message: `Restore access for ${user.email}?`,
        confirmLabel: 'Unsuspend',
        tone: 'secondary',
      };
    }
    if (type === 'restore') {
      return {
        title: 'Restore deleted user',
        message: `Restore ${user.email}? They will be able to sign in again if their subscription access allows it.`,
        confirmLabel: 'Restore',
        tone: 'secondary',
      };
    }
    if (type === 'permanent_delete') {
      return {
        title: 'Delete forever',
        message: `Permanently delete ${user.email}? This cannot be undone and all linked user data will be removed.`,
        confirmLabel: 'Delete forever',
        tone: 'danger',
      };
    }
    return {
      title: 'Delete user',
      message: `Move ${user.email} to deleted users? They will be blocked from signing in, but the record will remain visible when Include deleted is enabled.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    };
  };

  const confirmAction = async () => {
    if (!pendingAction) return;
    setActionBusy(true);
    let ok = false;
    if (pendingAction.type === 'suspend') {
      ok = await handleSuspend(pendingAction.user);
    } else if (pendingAction.type === 'unsuspend') {
      ok = await handleUnsuspend(pendingAction.user);
    } else if (pendingAction.type === 'delete') {
      ok = await handleDelete(pendingAction.user);
    } else if (pendingAction.type === 'restore') {
      ok = await handleRestore(pendingAction.user);
    } else if (pendingAction.type === 'permanent_delete') {
      ok = await handlePermanentDelete(pendingAction.user);
    }
    setActionBusy(false);
    if (ok) {
      setPendingAction(null);
    }
  };

  const confirmContent = getConfirmContent(pendingAction);
  const getPlatformLabel = (value) => {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (normalized === 'ios') return 'iOS';
    if (normalized === 'android') return 'Android';
    return value || '--';
  };

  const renderAccessBadge = (user) => {
    const meta = getAccessMeta(user.access_status || user.subscription_tier);
    const daysLeft = formatAccessDaysLeft(user);
    return (
      <span>
        <span className={`admin-badge ${meta.badge}`} title={user.tier_source ? `Source: ${user.tier_source}` : ''}>
          {user.access_label || meta.label}
        </span>
        {daysLeft ? (
          <span className="admin-help" style={{ display: 'block', marginTop: 6 }}>
            {daysLeft}
          </span>
        ) : null}
      </span>
    );
  };

  const IconEye = (props) => (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" {...props}>
      <path
        fill="currentColor"
        d="M12 5c5.5 0 9.7 4.4 10.9 6.3a1.3 1.3 0 0 1 0 1.4C21.7 14.6 17.5 19 12 19S2.3 14.6 1.1 12.7a1.3 1.3 0 0 1 0-1.4C2.3 9.4 6.5 5 12 5Zm0 2C7.7 7 4.3 10.4 3.2 12c1.1 1.6 4.5 5 8.8 5s7.7-3.4 8.8-5C19.7 10.4 16.3 7 12 7Zm0 1.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Zm0 2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"
      />
    </svg>
  );

  const IconLock = (props) => (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" {...props}>
      <path
        fill="currentColor"
        d="M17 9V7a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1Zm-8 0V7a3 3 0 0 1 6 0v2H9Z"
      />
    </svg>
  );

  const IconUnlock = (props) => (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" {...props}>
      <path
        fill="currentColor"
        d="M17 9H9V7a3 3 0 0 1 5.6-1.4 1 1 0 0 0 1.7-1A5 5 0 0 0 7 7v2H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2Z"
      />
    </svg>
  );

  const IconTrash = (props) => (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" {...props}>
      <path
        fill="currentColor"
        d="M9 3h6a1 1 0 0 1 1 1v1h4a1 1 0 1 1 0 2h-1l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7H4a1 1 0 1 1 0-2h4V4a1 1 0 0 1 1-1Zm1 2h4V5h-4ZM8 7l1 14h6l1-14H8Zm2 3a1 1 0 0 1 1 1v7a1 1 0 1 1-2 0v-7a1 1 0 0 1 1-1Zm4 0a1 1 0 0 1 1 1v7a1 1 0 1 1-2 0v-7a1 1 0 0 1 1-1Z"
      />
    </svg>
  );

  return (
    <div className="admin-card">
      <h2 className="admin-title">Users</h2>
      <p className="admin-subtitle">Monitor subscription status and user activity.</p>

      {message && <p className="admin-subtitle">{message}</p>}

      {/* Overview: who's here and who has access right now. Refreshes with the table. */}
      <div className="admin-stat-grid">
        <StatCard label="Total users" value={accessSummary.total} hint="All accounts" accent="#0f172a" icon="users" />
        <StatCard label="iOS" value={platformSummary.ios} hint="Last seen on iPhone" accent="#1d4ed8" icon="phone" live />
        <StatCard label="Android" value={platformSummary.android} hint="Last seen on Android" accent="#15803d" icon="phone" live />
        <StatCard
          label="Have access now"
          value={accessSummary.legacy_grace + accessSummary.premium + accessSummary.cancelled_active + accessSummary.trialing}
          hint="Welcome week + Premium"
          accent="#0e7490"
          icon="spark"
          total={accessSummary.total}
        />
      </div>

      {/* Status: click a card to filter the table. */}
      <div className="admin-stat-grid" style={{ marginBottom: 18 }}>
        {[
          ['legacy_grace', 'Welcome week', accessSummary.legacy_grace, '#0e7490', 'New users with full access'],
          ['premium', 'Premium', accessSummary.premium, '#15803d', 'Paying subscribers'],
          ['cancelled_active', 'Cancelled active', accessSummary.cancelled_active, '#b45309', 'Access until their period ends'],
          ['free', 'Free plan', accessSummary.free, '#334155', 'Weekly free uses only'],
          ['expired', 'Lapsed', accessSummary.expired, '#a16207', 'Trial or subscription ended'],
          // Store trials were retired (Oct 2026); only shown while legacy trials are still running.
          ...(accessSummary.trialing > 0 ? [['trialing', 'Store trials (legacy)', accessSummary.trialing, '#166534', 'Old store free trials']] : []),
          ['blocked', 'Blocked', accessSummary.blocked, '#475569', 'Premium access blocked'],
          ['suspended', 'Suspended', accessSummary.suspended, '#6d28d9', 'Account suspended'],
          ['deleted', 'Deleted', accessSummary.deleted, '#991b1b', 'Deleted accounts'],
        ].map(([key, label, value, accent, hint]) => (
          <StatCard
            key={key}
            label={label}
            value={value}
            hint={hint}
            accent={accent}
            total={accessSummary.total}
            active={tierFilter === key}
            onClick={() => {
              setTierFilter(tierFilter === key ? 'all' : key);
              setPage(1);
            }}
          />
        ))}
      </div>

      <div className="admin-toolbar">
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          className="admin-search-input"
        />
        <label className="admin-inline-toggle">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(event) => setAutoRefresh(event.target.checked)}
          />
          {!isMobile ? 'Auto-refresh' : 'Auto'}
        </label>
        <label className="admin-inline-toggle">
          <input
            type="checkbox"
            checked={includeDeleted}
            onChange={(event) => {
              setIncludeDeleted(event.target.checked);
              setPage(1);
            }}
          />
          {!isMobile ? 'Include deleted' : 'Deleted'}
        </label>
        <select
          value={tierFilter}
          onChange={(event) => {
            setTierFilter(event.target.value);
            setPage(1);
          }}
          className="admin-filter-select"
          aria-label="Filter by access status"
        >
          <option value="all">All access</option>
          <option value="legacy_grace">Welcome week</option>
          <option value="free">Free plan</option>
          <option value="expired">Lapsed (past trial or subscription)</option>
          <option value="cancelled_active">Cancelled active</option>
          <option value="trialing">Store trial (legacy)</option>
          <option value="premium">Premium</option>
          <option value="blocked">Blocked</option>
          <option value="suspended">Suspended</option>
          <option value="deleted">Deleted</option>
        </select>
        <select
          value={`${sortKey}:${sortOrder}`}
          onChange={(event) => {
            const [nextKey, nextOrder] = event.target.value.split(':');
            setSortKey(nextKey);
            setSortOrder(nextOrder);
            setPage(1);
          }}
          className="admin-sort-select"
          aria-label="Sort users"
        >
          <option value="created_at:desc">Newest first</option>
          <option value="created_at:asc">Oldest first</option>
          <option value="email:asc">Email (A-Z)</option>
          <option value="tier:asc">Plan (A-Z)</option>
        </select>
        <button className="admin-button neutral" type="button" onClick={downloadUsersExcel} disabled={exportingUsers}>
          {exportingUsers ? 'Preparing...' : 'Download Excel'}
        </button>
      </div>

      {isLoading ? (
        <p className="admin-loading">Loading users...</p>
      ) : (
        <>
          <div className="admin-table-container">
            {isMobile ? (
              // Mobile Card View
              <div className="admin-mobile-user-list">
                {users.map((user) => {
                  const isSuspended = Boolean(user.suspended_at);
                  const isDeleted = Boolean(user.deleted_at);
                  const platformLabel = getPlatformLabel(user.registered_platform);
                  
                  return (
                    <div key={user.id} className={`admin-mobile-user-card ${isSuspended ? 'suspended' : ''} ${isDeleted ? 'deleted' : ''}`}>
                      <div className="admin-mobile-user-header">
                        <div className="admin-mobile-user-info">
                          <div className="admin-mobile-user-name">{user.full_name || '--'}</div>
                          <div className="admin-mobile-user-email">{user.email}</div>
                        </div>
                        <div className="admin-mobile-user-badges">
                          {renderAccessBadge(user)}
                        </div>
                      </div>
                      
                      <div className="admin-mobile-user-details">
                        <div className="admin-mobile-user-detail">
                          <span className="admin-mobile-detail-label">User ID:</span>
                          <span>{user.id}</span>
                        </div>
                        <div className="admin-mobile-user-detail">
                          <span className="admin-mobile-detail-label">Joined:</span>
                          <span>{user.created_at ? new Date(user.created_at).toLocaleDateString() : '--'}</span>
                        </div>
                        <div className="admin-mobile-user-detail">
                          <span className="admin-mobile-detail-label">Platform:</span>
                          <span>{platformLabel}</span>
                        </div>
                        <div className="admin-mobile-user-detail">
                          <span className="admin-mobile-detail-label">Access until:</span>
                          <span>{getAccessEndDate(user) ? new Date(getAccessEndDate(user)).toLocaleDateString() : '--'}</span>
                        </div>
                      </div>
                      
                      <div className="admin-mobile-actions">
                        <button
                          type="button"
                          className="admin-button secondary admin-mobile-action-button"
                          onClick={() => router.push(`/admin/users/${user.id}`)}
                        >
                          Details
                        </button>
                        {isDeleted ? (
                          <>
                            <button
                              type="button"
                              className="admin-button secondary admin-mobile-action-button"
                              onClick={() => requestAction('restore', user)}
                            >
                              Restore
                            </button>
                            <button
                              type="button"
                              className="admin-button danger admin-mobile-action-button"
                              onClick={() => requestAction('permanent_delete', user)}
                            >
                              Delete forever
                            </button>
                          </>
                        ) : isSuspended ? (
                          <button
                            type="button"
                            className="admin-button secondary admin-mobile-action-button"
                            onClick={() => requestAction('unsuspend', user)}
                          >
                            Activate
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="admin-button danger admin-mobile-action-button"
                            onClick={() => requestAction('suspend', user)}
                          >
                            Suspend
                          </button>
                        )}
                        {!isDeleted ? (
                          <button
                            type="button"
                            className="admin-button danger admin-mobile-action-button"
                            onClick={() => requestAction('delete', user)}
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              // Desktop Table View
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>User</th>
                      <th>Email</th>
                      <th>Platform</th>
                      <th>Access</th>
                      <th>Access until</th>
                      <th>Joined</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => {
                      const isSuspended = Boolean(user.suspended_at);
                      const isDeleted = Boolean(user.deleted_at);
                      const platformLabel = getPlatformLabel(user.registered_platform);

                      return (
                        <tr key={user.id} className={isDeleted ? 'admin-row-deleted' : isSuspended ? 'admin-row-suspended' : undefined}>
                          <td>{user.id}</td>
                          <td>{user.full_name || '--'}</td>
                          <td>{user.email}</td>
                          <td>{platformLabel}</td>
                          <td>
                            {renderAccessBadge(user)}
                          </td>
                          <td>{getAccessEndDate(user) ? new Date(getAccessEndDate(user)).toLocaleDateString() : '--'}</td>
                          <td>{user.created_at ? new Date(user.created_at).toLocaleDateString() : '--'}</td>
                          <td>
                            <div className="admin-action-buttons">
                              <button
                                type="button"
                                className="admin-icon-button"
                                onClick={() => router.push(`/admin/users/${user.id}`)}
                                title="Details"
                                aria-label="View user details"
                              >
                                <IconEye />
                              </button>
                              {isDeleted ? (
                                <>
                                  <button
                                    type="button"
                                    className="admin-icon-button"
                                    onClick={() => requestAction('restore', user)}
                                    title="Restore"
                                    aria-label="Restore user"
                                  >
                                    <IconUnlock />
                                  </button>
                                  <button
                                    type="button"
                                    className="admin-icon-button danger"
                                    onClick={() => requestAction('permanent_delete', user)}
                                    title="Delete forever"
                                    aria-label="Permanently delete user"
                                  >
                                    <IconTrash />
                                  </button>
                                </>
                              ) : isSuspended ? (
                                <button
                                  type="button"
                                  className="admin-icon-button"
                                  onClick={() => requestAction('unsuspend', user)}
                                  title="Unsuspend"
                                  aria-label="Unsuspend user"
                                >
                                  <IconUnlock />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="admin-icon-button danger"
                                  onClick={() => requestAction('suspend', user)}
                                  title="Suspend"
                                  aria-label="Suspend user"
                                >
                                  <IconLock />
                                </button>
                              )}
                              {!isDeleted ? (
                                <button
                                  type="button"
                                  className="admin-icon-button danger"
                                  onClick={() => requestAction('delete', user)}
                                  title="Delete"
                                  aria-label="Delete user"
                                >
                                  <IconTrash />
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="admin-pagination">
            <button
              type="button"
              className="admin-pagination-button"
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
            >
              Prev
            </button>
            <span className="admin-pagination-info">
              Page {page} of {totalPages} ({totalItems} users)
            </span>
            <button
              type="button"
              className="admin-pagination-button"
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
            >
              Next
            </button>
          </div>
        </>
      )}

      {pendingAction && confirmContent && (
        <div className="admin-modal-backdrop" role="presentation">
          <div className="admin-modal" role="dialog" aria-modal="true">
            <h3>{confirmContent.title}</h3>
            <p>{confirmContent.message}</p>
            <div className="admin-actions">
              <button
                type="button"
                className="admin-button secondary"
                onClick={() => setPendingAction(null)}
                disabled={actionBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`admin-button${confirmContent.tone === 'danger' ? ' danger' : ''}`}
                onClick={confirmAction}
                disabled={actionBusy}
              >
                {actionBusy ? 'Working...' : confirmContent.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
