'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

export default function AdminUserDetail() {
  const router = useRouter();
  const params = useParams();
  const userId = params?.id;
  const token = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('adminToken');
  }, []);

  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('profile');
  const [form, setForm] = useState({
    email: '',
    full_name: '',
    gender: '',
    country: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [pendingAction, setPendingAction] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [grantExpiresAt, setGrantExpiresAt] = useState('');
  const [blockReason, setBlockReason] = useState('');
  const [blockUntil, setBlockUntil] = useState('');
  const [txSearch, setTxSearch] = useState('');
  const [txStatusFilter, setTxStatusFilter] = useState('all');
  const [txSortKey, setTxSortKey] = useState('started_at');
  const [txSortOrder, setTxSortOrder] = useState('desc');
  const [txPage, setTxPage] = useState(1);
  const TX_PAGE_SIZE = 8;

  const loadUser = async () => {
    if (!token) {
      router.push('/admin');
      return;
    }
    setIsLoading(true);
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) {
        setMessage('Failed to load user.');
        return;
      }
      const data = await response.json();
      setUser(data);
      setForm({
        email: data.email || '',
        full_name: data.full_name || '',
        gender: data.gender || '',
        country: data.country || '',
      });
    } catch (error) {
      setMessage('Failed to load user.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (userId) {
      loadUser();
    }
  }, [userId]);

  useEffect(() => {
    setActiveTab('profile');
  }, [userId]);

  const handleSave = async () => {
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) {
        setMessage('Failed to update user.');
        return;
      }
      setMessage('User updated.');
      loadUser();
    } catch (error) {
      setMessage('Failed to update user.');
    }
  };

  const handleGrantPremium = async () => {
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${userId}/tier`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tier: 'premium',
          expires_at: grantExpiresAt ? new Date(grantExpiresAt).toISOString() : null,
        }),
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) {
        setMessage('Failed to update subscription.');
        return;
      }
      loadUser();
    } catch (error) {
      setMessage('Failed to update subscription.');
    }
  };

  const handleRevokeComp = async () => {
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${userId}/premium-comp-revoke`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) {
        setMessage('Failed to revoke comp.');
        return;
      }
      loadUser();
    } catch (error) {
      setMessage('Failed to revoke comp.');
    }
  };

  const handleBlockPremium = async () => {
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${userId}/premium-block`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: blockReason || null,
          until: blockUntil ? new Date(blockUntil).toISOString() : null,
        }),
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) {
        setMessage('Failed to block premium access.');
        return;
      }
      loadUser();
    } catch (error) {
      setMessage('Failed to block premium access.');
    }
  };

  const handleUnblockPremium = async () => {
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${userId}/premium-unblock`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) {
        setMessage('Failed to unblock premium access.');
        return;
      }
      loadUser();
    } catch (error) {
      setMessage('Failed to unblock premium access.');
    }
  };

  const handleSuspend = async () => {
    if (!user) return;
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${userId}/suspend`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Account locked by admin.' }),
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) {
        setMessage('Failed to suspend user.');
        return;
      }
      loadUser();
    } catch (error) {
      setMessage('Failed to suspend user.');
    }
  };

  const handleUnsuspend = async () => {
    if (!user) return;
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${userId}/unsuspend`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) {
        setMessage('Failed to unsuspend user.');
        return;
      }
      loadUser();
    } catch (error) {
      setMessage('Failed to unsuspend user.');
    }
  };

  const handleDelete = async () => {
    if (!user) return;
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) {
        setMessage('Failed to delete user.');
        return;
      }
      router.push('/admin/users');
    } catch (error) {
      setMessage('Failed to delete user.');
    }
  };

  if (isLoading) {
    return <div className="admin-card">Loading user...</div>;
  }

  if (!user) {
    return <div className="admin-card">User not found.</div>;
  }

  const requestAction = (type) => {
    if (type === 'grant_premium') {
      setGrantExpiresAt('');
    }
    if (type === 'block_premium') {
      setBlockReason('');
      setBlockUntil('');
    }
    setPendingAction({ type });
  };

  const getConfirmContent = (action) => {
    if (!action || !user) return null;
    if (action.type === 'grant_premium') {
      return {
        title: 'Grant Premium (manual comp)',
        message: `Grant Premium access for ${user.email}. Optional: set an expiry date/time.`,
        confirmLabel: 'Grant Premium',
        tone: 'primary',
      };
    }
    if (action.type === 'revoke_comp') {
      return {
        title: 'Revoke Premium comp',
        message: `Remove any active admin Premium comps for ${user.email}.`,
        confirmLabel: 'Revoke comp',
        tone: 'danger',
      };
    }
    if (action.type === 'block_premium') {
      return {
        title: 'Block Premium access',
        message: `Block Premium features for ${user.email}. Use this only for fraud/abuse (billing may still be active).`,
        confirmLabel: 'Block Premium',
        tone: 'danger',
      };
    }
    if (action.type === 'unblock_premium') {
      return {
        title: 'Unblock Premium access',
        message: `Restore Premium access for ${user.email}.`,
        confirmLabel: 'Unblock Premium',
        tone: 'secondary',
      };
    }
    if (action.type === 'suspend') {
      return {
        title: 'Suspend user',
        message: `Suspend ${user.email}? They will be unable to log in.`,
        confirmLabel: 'Suspend',
        tone: 'danger',
      };
    }
    if (action.type === 'unsuspend') {
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
    if (pendingAction.type === 'grant_premium') {
      await handleGrantPremium();
    } else if (pendingAction.type === 'revoke_comp') {
      await handleRevokeComp();
    } else if (pendingAction.type === 'block_premium') {
      await handleBlockPremium();
    } else if (pendingAction.type === 'unblock_premium') {
      await handleUnblockPremium();
    } else if (pendingAction.type === 'suspend') {
      await handleSuspend();
    } else if (pendingAction.type === 'unsuspend') {
      await handleUnsuspend();
    } else if (pendingAction.type === 'delete') {
      await handleDelete();
    }
    setActionBusy(false);
    setPendingAction(null);
  };

  const confirmContent = getConfirmContent(pendingAction);
  const transactions = Array.isArray(user.subscriptions) ? user.subscriptions : [];
  const filteredTransactions = transactions
    .filter((sub) => {
      if (txStatusFilter === 'all') return true;
      return sub.status === txStatusFilter;
    })
    .filter((sub) => {
      if (!txSearch.trim()) return true;
      const term = txSearch.trim().toLowerCase();
      return [
        sub.plan,
        sub.status,
        sub.product_id,
        sub.transaction_id,
        sub.store,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    })
    .sort((a, b) => {
      const getDate = (value) => (value ? new Date(value).getTime() : 0);
      const getValue = (value) => (value ? String(value).toLowerCase() : '');
      let result = 0;
      if (txSortKey === 'status') {
        result = getValue(a.status).localeCompare(getValue(b.status));
      } else if (txSortKey === 'plan') {
        result = getValue(a.plan).localeCompare(getValue(b.plan));
      } else if (txSortKey === 'expires_at') {
        result = getDate(a.expires_at) - getDate(b.expires_at);
      } else {
        result = getDate(a.started_at) - getDate(b.started_at);
      }
      return txSortOrder === 'asc' ? result : -result;
    });
  const txTotalPages = Math.max(1, Math.ceil(filteredTransactions.length / TX_PAGE_SIZE));
  const txStart = (txPage - 1) * TX_PAGE_SIZE;
  const txPageItems = filteredTransactions.slice(txStart, txStart + TX_PAGE_SIZE);
  const billing = user.billing || null;
  const adminComp = user.admin_comp || null;

  const renderValue = (value) => {
    if (value === null || value === undefined) return '--';
    if (Array.isArray(value)) return value.length ? value.join(', ') : '--';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'string') return value.trim() ? value : '--';
    return String(value);
  };

  const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : '--');
  const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : '--');
  const displayPlatform =
    user.registered_platform === 'ios'
      ? 'iOS'
      : user.registered_platform === 'android'
        ? 'Android'
        : user.registered_platform || '--';

  const displayTier = String(user.subscription_tier || user.subscription || 'free');
  const tierLabel = displayTier.toLowerCase() === 'premium' ? 'Premium' : displayTier;
  const isPremium = displayTier.toLowerCase() === 'premium';
  const isSuspended = Boolean(user.suspended_at);
  const isPremiumBlocked = Boolean(user.premium_access_blocked);
  const premiumAccessBadgeLabel = user.status === 'active' ? 'Premium: Active' : 'Premium: Inactive';

  const initials = (() => {
    const raw = (user.full_name || user.email || 'U').trim();
    const parts = raw.split(/\s+/).filter(Boolean);
    if (!parts.length) return 'U';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  })();

  const userTitle = user.full_name?.trim() ? user.full_name.trim() : user.email;
  const userSubtitleParts = [
    user.id ? `User #${user.id}` : null,
    displayPlatform !== '--' ? displayPlatform : null,
    user.registered_app_version ? `v${user.registered_app_version}` : null,
  ].filter(Boolean);

  const Badge = ({ tone = 'neutral', children, title }) => (
    <span className={`admin-badge admin-badge--${tone}`} title={title}>
      {children}
    </span>
  );

  const TabButton = ({ id, children }) => (
    <button
      type="button"
      className={`admin-tab${activeTab === id ? ' is-active' : ''}`}
      onClick={() => setActiveTab(id)}
    >
      {children}
    </button>
  );

  return (
    <div className="admin-user-detail">
      <div className="admin-card admin-user-hero">
        <div className="admin-user-hero-top">
          <button className="admin-button secondary" type="button" onClick={() => router.push('/admin/users')}>
            Back
          </button>

          <div className="admin-user-hero-actions">
            <button className="admin-button" type="button" onClick={() => requestAction('grant_premium')}>
              Grant Premium
            </button>

            <details className="admin-action-menu">
              <summary className="admin-button secondary">More actions</summary>
              <div className="admin-action-menu-panel">
                {adminComp?.status === 'active' ? (
                  <button
                    className="admin-action-menu-item danger"
                    type="button"
                    onClick={() => requestAction('revoke_comp')}
                  >
                    Revoke comp
                  </button>
                ) : null}
                {isPremiumBlocked ? (
                  <button
                    className="admin-action-menu-item"
                    type="button"
                    onClick={() => requestAction('unblock_premium')}
                  >
                    Unblock Premium
                  </button>
                ) : (
                  <button
                    className="admin-action-menu-item danger"
                    type="button"
                    onClick={() => requestAction('block_premium')}
                  >
                    Block Premium
                  </button>
                )}
                {isSuspended ? (
                  <button className="admin-action-menu-item" type="button" onClick={() => requestAction('unsuspend')}>
                    Unsuspend
                  </button>
                ) : (
                  <button
                    className="admin-action-menu-item danger"
                    type="button"
                    onClick={() => requestAction('suspend')}
                  >
                    Suspend
                  </button>
                )}
                <button className="admin-action-menu-item danger" type="button" onClick={() => requestAction('delete')}>
                  Delete user
                </button>
              </div>
            </details>
          </div>
        </div>

        <div className="admin-user-hero-main">
          <div className="admin-user-avatar" aria-hidden="true">
            {initials}
          </div>
          <div className="admin-user-identity">
            <h2 className="admin-user-name">{userTitle}</h2>
            <p className="admin-user-email">{user.email}</p>
            {userSubtitleParts.length ? <p className="admin-user-subline">{userSubtitleParts.join(' | ')}</p> : null}
          </div>
          <div className="admin-user-badges">
            <Badge tone={isPremium ? 'success' : 'neutral'} title="Subscription tier">
              {tierLabel}
            </Badge>
            <Badge
              tone={String(user.status).toLowerCase() === 'active' ? 'success' : 'neutral'}
              title="Premium entitlement status (active = user currently has Premium access)"
            >
              {premiumAccessBadgeLabel}
            </Badge>
            {isSuspended ? <Badge tone="warning">Suspended</Badge> : null}
            {isPremiumBlocked ? (
              <Badge
                tone="danger"
                title={
                  user.premium_access_blocked_until
                    ? `Blocked until ${formatDateTime(user.premium_access_blocked_until)}`
                    : 'Premium blocked'
                }
              >
                Premium blocked
              </Badge>
            ) : null}
          </div>
        </div>

        {message ? <div className="admin-user-toast">{message}</div> : null}

        <div className="admin-tabs" role="tablist" aria-label="User detail sections">
          <TabButton id="profile">Profile</TabButton>
          <TabButton id="access">Access & Billing</TabButton>
          <TabButton id="preferences">Preferences</TabButton>
          <TabButton id="transactions">Transactions</TabButton>
        </div>
      </div>

      {activeTab === 'profile' ? (
        <div className="admin-grid" style={{ marginTop: 18 }}>
          <div className="admin-card">
            <div className="admin-card-header">
              <div>
                <h3 className="admin-title admin-title--sm">Profile</h3>
                <p className="admin-subtitle admin-subtitle--sm">Support and identity fields.</p>
              </div>
              <button className="admin-button" type="button" onClick={handleSave}>
                Save changes
              </button>
            </div>

            <div className="admin-field">
              <label>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
            </div>
            <div className="admin-field">
              <label>Full name</label>
              <input
                type="text"
                value={form.full_name}
                onChange={(event) => setForm({ ...form, full_name: event.target.value })}
              />
            </div>
            <div className="admin-inline">
              <div className="admin-field">
                <label>Gender</label>
                <input
                  type="text"
                  value={form.gender}
                  onChange={(event) => setForm({ ...form, gender: event.target.value })}
                />
              </div>
              <div className="admin-field">
                <label>Country</label>
                <input
                  type="text"
                  value={form.country}
                  onChange={(event) => setForm({ ...form, country: event.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="admin-stack">
            <div className="admin-card admin-card--subtle">
              <h3 className="admin-title admin-title--sm">Account</h3>
            <div className="admin-kv">
              <div className="admin-kv-row">
                <div className="admin-kv-label">Premium entitlement</div>
                <div className="admin-kv-value">{user.status || '--'}</div>
              </div>
              <div className="admin-kv-row">
                <div className="admin-kv-label">Suspended</div>
                <div className="admin-kv-value">{isSuspended ? formatDateTime(user.suspended_at) : 'No'}</div>
              </div>
                <div className="admin-kv-row">
                  <div className="admin-kv-label">Premium blocked</div>
                  <div className="admin-kv-value">
                    {isPremiumBlocked
                      ? user.premium_access_blocked_until
                        ? `Yes (until ${formatDateTime(user.premium_access_blocked_until)})`
                        : 'Yes'
                      : 'No'}
                  </div>
                </div>
              </div>
            </div>

            <div className="admin-card">
              <h3 className="admin-title admin-title--sm">App & Device</h3>
              <div className="admin-kv">
                <div className="admin-kv-row">
                  <div className="admin-kv-label">Platform</div>
                  <div className="admin-kv-value">{displayPlatform}</div>
                </div>
                <div className="admin-kv-row">
                  <div className="admin-kv-label">App version</div>
                  <div className="admin-kv-value">{user.registered_app_version || '--'}</div>
                </div>
                <div className="admin-kv-row">
                  <div className="admin-kv-label">Build</div>
                  <div className="admin-kv-value">{user.registered_build_number || '--'}</div>
                </div>
                <div className="admin-kv-row">
                  <div className="admin-kv-label">OS</div>
                  <div className="admin-kv-value">{user.registered_os_version || '--'}</div>
                </div>
                <div className="admin-kv-row">
                  <div className="admin-kv-label">Device</div>
                  <div className="admin-kv-value">{user.registered_device_model || '--'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === 'access' ? (
        <div className="admin-grid" style={{ marginTop: 18 }}>
          <div className="admin-card">
            <h3 className="admin-title admin-title--sm">Subscription & Access</h3>
            <p className="admin-subtitle admin-subtitle--sm">What tier the user is on, and why.</p>
            <div className="admin-kv">
              <div className="admin-kv-row">
                <div className="admin-kv-label">Plan</div>
                <div className="admin-kv-value">{user.subscription_tier || '--'}</div>
              </div>
              <div className="admin-kv-row">
                <div className="admin-kv-label">Tier source</div>
                <div className="admin-kv-value">{user.tier_source || '--'}</div>
              </div>
              <div className="admin-kv-row">
                <div className="admin-kv-label">Status</div>
                <div className="admin-kv-value">{user.status || '--'}</div>
              </div>
              <div className="admin-kv-row">
                <div className="admin-kv-label">Expires</div>
                <div className="admin-kv-value">{formatDate(user.expires_at)}</div>
              </div>
              <div className="admin-kv-row">
                <div className="admin-kv-label">Admin comp expires</div>
                <div className="admin-kv-value">{formatDateTime(adminComp?.expires_at)}</div>
              </div>
              <div className="admin-kv-row">
                <div className="admin-kv-label">Premium blocked</div>
                <div className="admin-kv-value">
                  {isPremiumBlocked
                    ? user.premium_access_blocked_until
                      ? `Yes (until ${formatDateTime(user.premium_access_blocked_until)})`
                      : 'Yes'
                    : 'No'}
                </div>
              </div>
              {user.premium_access_blocked_reason ? (
                <div className="admin-kv-row">
                  <div className="admin-kv-label">Block reason</div>
                  <div className="admin-kv-value">{user.premium_access_blocked_reason}</div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="admin-card">
            <h3 className="admin-title admin-title--sm">Billing (Latest)</h3>
            <p className="admin-subtitle admin-subtitle--sm">Most recent billing payload received.</p>
            <div className="admin-kv">
              <div className="admin-kv-row">
                <div className="admin-kv-label">Store</div>
                <div className="admin-kv-value">{billing?.store || '--'}</div>
              </div>
              <div className="admin-kv-row">
                <div className="admin-kv-label">Status</div>
                <div className="admin-kv-value">{billing?.status || '--'}</div>
              </div>
              <div className="admin-kv-row">
                <div className="admin-kv-label">Started</div>
                <div className="admin-kv-value">{formatDateTime(billing?.started_at)}</div>
              </div>
              <div className="admin-kv-row">
                <div className="admin-kv-label">Expires</div>
                <div className="admin-kv-value">{formatDateTime(billing?.expires_at)}</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === 'preferences' ? (
        <div className="admin-card" style={{ marginTop: 18 }}>
          <h3 className="admin-title admin-title--sm">Food Preferences (Onboarding)</h3>
          <p className="admin-subtitle admin-subtitle--sm">What the user selected during onboarding.</p>
          <div className="admin-kv admin-kv--grid">
            <div className="admin-kv-row">
              <div className="admin-kv-label">Profile completed</div>
              <div className="admin-kv-value">{renderValue(user.profile_completed)}</div>
            </div>
            <div className="admin-kv-row">
              <div className="admin-kv-label">Blood sugar profile</div>
              <div className="admin-kv-value">{renderValue(user.blood_sugar_profile)}</div>
            </div>
            <div className="admin-kv-row">
              <div className="admin-kv-label">Dietary pattern</div>
              <div className="admin-kv-value">{renderValue(user.dietary_pattern)}</div>
            </div>
            <div className="admin-kv-row">
              <div className="admin-kv-label">Cook time preference</div>
              <div className="admin-kv-value">{renderValue(user.cook_time_preference)}</div>
            </div>
            <div className="admin-kv-row">
              <div className="admin-kv-label">Country code</div>
              <div className="admin-kv-value">{renderValue(user.country_code)}</div>
            </div>
            <div className="admin-kv-row">
              <div className="admin-kv-label">Preferred cuisines</div>
              <div className="admin-kv-value">{renderValue(user.preferred_cuisines)}</div>
            </div>
            <div className="admin-kv-row">
              <div className="admin-kv-label">Meal goals</div>
              <div className="admin-kv-value">{renderValue(user.meal_goals)}</div>
            </div>
            <div className="admin-kv-row">
              <div className="admin-kv-label">Allergens</div>
              <div className="admin-kv-value">{renderValue(user.allergens)}</div>
            </div>
            <div className="admin-kv-row">
              <div className="admin-kv-label">Food exclusions</div>
              <div className="admin-kv-value">{renderValue(user.food_exclusions)}</div>
            </div>
            <div className="admin-kv-row">
              <div className="admin-kv-label">Available equipment</div>
              <div className="admin-kv-value">{renderValue(user.available_equipment)}</div>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === 'transactions' ? (
        <div className="admin-card" style={{ marginTop: 18 }}>
          <h3 className="admin-title admin-title--sm">Transactions</h3>
          <p className="admin-subtitle admin-subtitle--sm">Search, filter, and inspect subscription events.</p>
          <div className="admin-toolbar">
            <input
              className="admin-search-input"
              type="text"
              placeholder="Search plan, status, product, transaction..."
              value={txSearch}
              onChange={(event) => {
                setTxSearch(event.target.value);
                setTxPage(1);
              }}
            />
            <select
              value={txStatusFilter}
              onChange={(event) => {
                setTxStatusFilter(event.target.value);
                setTxPage(1);
              }}
            >
              <option value="all">All status</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
              <option value="trialing">Trialing</option>
              <option value="canceled">Canceled</option>
            </select>
            <select
              value={`${txSortKey}:${txSortOrder}`}
              onChange={(event) => {
                const [nextKey, nextOrder] = event.target.value.split(':');
                setTxSortKey(nextKey);
                setTxSortOrder(nextOrder);
                setTxPage(1);
              }}
            >
              <option value="started_at:desc">Newest first</option>
              <option value="started_at:asc">Oldest first</option>
              <option value="expires_at:desc">Expires latest</option>
              <option value="expires_at:asc">Expires soon</option>
              <option value="status:asc">Status (A-Z)</option>
              <option value="plan:asc">Plan (A-Z)</option>
            </select>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Plan</th>
                  <th>Started</th>
                  <th>Expires</th>
                  <th>Product</th>
                  <th>Transaction</th>
                  <th>Store</th>
                </tr>
              </thead>
              <tbody>
                {txPageItems.length ? (
                  txPageItems.map((sub) => (
                    <tr key={sub.id}>
                      <td>{sub.status}</td>
                      <td>{sub.plan}</td>
                      <td>{formatDate(sub.started_at)}</td>
                      <td>{formatDate(sub.expires_at)}</td>
                      <td>{sub.product_id || '--'}</td>
                      <td>{sub.transaction_id || '--'}</td>
                      <td>{sub.store || '--'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7}>No subscription history.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="admin-pagination">
            <button type="button" onClick={() => setTxPage(Math.max(1, txPage - 1))} disabled={txPage === 1}>
              Prev
            </button>
            <span>
              Page {txPage} of {txTotalPages} ({filteredTransactions.length} transactions)
            </span>
            <button
              type="button"
              onClick={() => setTxPage(Math.min(txTotalPages, txPage + 1))}
              disabled={txPage === txTotalPages}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      {pendingAction && confirmContent && (
        <div className="admin-modal-backdrop" role="presentation">
          <div className="admin-modal" role="dialog" aria-modal="true">
            <h3>{confirmContent.title}</h3>
            <p>{confirmContent.message}</p>
            {pendingAction.type === 'grant_premium' ? (
              <div className="admin-field" style={{ marginTop: 12 }}>
                <label>Expiry (optional)</label>
                <input
                  type="datetime-local"
                  value={grantExpiresAt}
                  onChange={(event) => setGrantExpiresAt(event.target.value)}
                />
                <p className="admin-help">Leave blank for no expiry. Times use your local timezone.</p>
              </div>
            ) : null}
            {pendingAction.type === 'block_premium' ? (
              <div style={{ marginTop: 12 }}>
                <div className="admin-field">
                  <label>Reason (optional)</label>
                  <input
                    type="text"
                    value={blockReason}
                    onChange={(event) => setBlockReason(event.target.value)}
                    placeholder="e.g. chargeback / abuse / fraud"
                  />
                </div>
                <div className="admin-field">
                  <label>Block until (optional)</label>
                  <input
                    type="datetime-local"
                    value={blockUntil}
                    onChange={(event) => setBlockUntil(event.target.value)}
                  />
                  <p className="admin-help">Leave blank for indefinite block.</p>
                </div>
              </div>
            ) : null}
            <div className="admin-actions">
              <button
                className="admin-button secondary"
                type="button"
                onClick={() => setPendingAction(null)}
                disabled={actionBusy}
              >
                Cancel
              </button>
              <button
                className={`admin-button${confirmContent.tone === 'danger' ? ' danger' : ''}`}
                type="button"
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
