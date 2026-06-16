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
  legacy_grace: { label: 'Legacy grace', badge: 'warning' },
  grace: { label: 'Legacy grace', badge: 'warning' },
  expired: { label: 'Expired', badge: 'danger' },
  blocked: { label: 'Blocked', badge: 'danger' },
  suspended: { label: 'Suspended', badge: 'danger' },
  free: { label: 'Free', badge: 'plan-free' },
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

export default function AdminUsersPage() {
  const router = useRouter();
  const token = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('adminToken');
  }, []);

  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [sortKey, setSortKey] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [page, setPage] = useState(1);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [platformSummary, setPlatformSummary] = useState({ ios: 0, android: 0, total: 0 });
  const [accessSummary, setAccessSummary] = useState({
    trialing: 0,
    cancelled_active: 0,
    legacy_grace: 0,
    expired: 0,
    premium: 0,
    blocked: 0,
    suspended: 0,
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
  }, [token, page, sortKey, sortOrder, search, tierFilter, router]);

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
        trialing: Number(data.trialing || data.trial || 0),
        cancelled_active: Number(data.cancelled_active || 0),
        legacy_grace: Number(data.legacy_grace || data.grace || 0),
        expired: Number(data.expired || 0),
        premium: Number(data.premium || 0),
        blocked: Number(data.blocked || 0),
        suspended: Number(data.suspended || 0),
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
      if (!response.ok) throw new Error();
      loadUsers({ silent: true });
      return true;
    } catch (error) {
      setMessage('Failed to delete user.');
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
    return {
      title: 'Delete user',
      message: `Delete ${user.email} permanently? This cannot be undone.`,
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, margin: '18px 0' }}>
        <div style={{ border: '1px solid #dbeafe', borderRadius: 16, padding: 16, background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)' }}>
          <div className="admin-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 800, color: '#1d4ed8' }}>iOS users</span>
            <span className="admin-badge secondary">Live</span>
          </div>
          <div style={{ fontSize: 34, lineHeight: 1, fontWeight: 900, color: '#0f172a', marginTop: 12 }}>{platformSummary.ios}</div>
          <p className="admin-help" style={{ marginTop: 8 }}>
            {platformUpdatedAt ? `Updated ${platformUpdatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Updating quietly'}
          </p>
        </div>
        <div style={{ border: '1px solid #dcfce7', borderRadius: 16, padding: 16, background: 'linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)' }}>
          <div className="admin-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 800, color: '#166534' }}>Android users</span>
            <span className="admin-badge success">Live</span>
          </div>
          <div style={{ fontSize: 34, lineHeight: 1, fontWeight: 900, color: '#0f172a', marginTop: 12 }}>{platformSummary.android}</div>
          <p className="admin-help" style={{ marginTop: 8 }}>
            Auto-refreshes in the background
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, margin: '0 0 18px' }}>
        {[
          ['trialing', 'Store trials', accessSummary.trialing, '#dcfce7', '#166534'],
          ['cancelled_active', 'Cancelled active', accessSummary.cancelled_active, '#fff7ed', '#9a3412'],
          ['legacy_grace', 'Legacy grace', accessSummary.legacy_grace, '#fffbeb', '#92400e'],
          ['expired', 'Expired', accessSummary.expired, '#fef2f2', '#991b1b'],
          ['premium', 'Premium', accessSummary.premium, '#fff7ed', '#9a3412'],
          ['blocked', 'Blocked', accessSummary.blocked, '#f8fafc', '#334155'],
          ['suspended', 'Suspended', accessSummary.suspended, '#f5f3ff', '#6d28d9'],
        ].map(([key, label, value, bg, color]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setTierFilter(key);
              setPage(1);
            }}
            style={{
              textAlign: 'left',
              border: tierFilter === key ? `1px solid ${color}` : '1px solid #e2e8f0',
              borderRadius: 14,
              padding: 14,
              background: bg,
              cursor: 'pointer',
            }}
          >
            <span style={{ display: 'block', fontSize: 12, fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: 0 }}>
              {label}
            </span>
            <span style={{ display: 'block', marginTop: 8, fontSize: 26, lineHeight: 1, fontWeight: 900, color: '#0f172a' }}>
              {value}
            </span>
          </button>
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
          <option value="trialing">Store trial</option>
          <option value="cancelled_active">Cancelled active</option>
          <option value="legacy_grace">Legacy grace</option>
          <option value="expired">Expired</option>
          <option value="premium">Premium</option>
          <option value="blocked">Blocked</option>
          <option value="suspended">Suspended</option>
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
                  const platformLabel = getPlatformLabel(user.registered_platform);
                  
                  return (
                    <div key={user.id} className={`admin-mobile-user-card ${isSuspended ? 'suspended' : ''}`}>
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
                        {isSuspended ? (
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
                        <button
                          type="button"
                          className="admin-button danger admin-mobile-action-button"
                          onClick={() => requestAction('delete', user)}
                        >
                          Delete
                        </button>
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
                      const platformLabel = getPlatformLabel(user.registered_platform);

                      return (
                        <tr key={user.id} className={isSuspended ? 'admin-row-suspended' : undefined}>
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
                              {isSuspended ? (
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
                              <button
                                type="button"
                                className="admin-icon-button danger"
                                onClick={() => requestAction('delete', user)}
                                title="Delete"
                                aria-label="Delete user"
                              >
                                <IconTrash />
                              </button>
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
