'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminFetch, clearAdminTokens, getAdminAccessToken, getAdminRefreshToken } from '../lib/adminAuth';

export default function AdminShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublicRoute =
    pathname === '/admin' ||
    pathname === '/admin/' ||
    pathname === '/admin/forgot-password' ||
    pathname === '/admin/reset-password';
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [session, setSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [navSectionOpen, setNavSectionOpen] = useState({});
  const [helpUnreadCount, setHelpUnreadCount] = useState(0);

  const loadSession = useCallback(async () => {
    if (isPublicRoute) return;

    const token = getAdminAccessToken();
    if (!token) {
      router.push('/admin');
      return;
    }

    setSessionLoading(true);
    try {
      const response = await adminFetch(`${API_URL}/api/admin/me`);
      if (response.status === 401) {
        clearAdminTokens();
        router.push('/admin');
        return;
      }
      const data = await response.json();
      setSession(data);
    } catch {
      setSession(null);
    } finally {
      setSessionLoading(false);
    }
  }, [API_URL, isPublicRoute, router]);

  const loadHelpUnreadCount = useCallback(async () => {
    if (isPublicRoute) return;
    const token = getAdminAccessToken();
    if (!token) return;

    const permissions = Array.isArray(session?.permissions) ? session.permissions : [];
    const canReadNotifications = permissions.includes('*') || permissions.includes('notifications.read');
    if (!canReadNotifications) {
      setHelpUnreadCount(0);
      return;
    }

    try {
      const response = await adminFetch(`${API_URL}/api/admin/help/notifications?unread_only=1&limit=200`);
      if (response.status === 401) return;
      const data = await response.json().catch(() => ({}));
      const items = Array.isArray(data?.items) ? data.items : [];
      setHelpUnreadCount(items.length);
    } catch {
      // ignore
    }
  }, [API_URL, isPublicRoute, session?.permissions]);

  useEffect(() => {
    // Persist the desktop collapsed state for a more "app-like" feel.
    try {
      const stored = localStorage.getItem('adminSidebarCollapsed');
      if (stored === '1') setSidebarCollapsed(true);
    } catch {
      // Ignore storage failures (private mode / blocked storage).
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('adminNavSectionOpen');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') setNavSectionOpen(parsed);
    } catch {
      // Ignore.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('adminNavSectionOpen', JSON.stringify(navSectionOpen || {}));
    } catch {
      // Ignore.
    }
  }, [navSectionOpen]);

  useEffect(() => {
    try {
      localStorage.setItem('adminSidebarCollapsed', sidebarCollapsed ? '1' : '0');
    } catch {
      // Ignore.
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    // Close the sidebar on navigation.
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    loadHelpUnreadCount();
  }, [loadHelpUnreadCount, pathname]);

  useEffect(() => {
    if (isPublicRoute) return undefined;
    const handler = () => loadHelpUnreadCount();
    window.addEventListener('admin-help-notifications-updated', handler);
    return () => window.removeEventListener('admin-help-notifications-updated', handler);
  }, [isPublicRoute, loadHelpUnreadCount]);

  useEffect(() => {
    if (isPublicRoute) return undefined;
    const timer = setInterval(() => loadHelpUnreadCount(), 20_000);
    return () => clearInterval(timer);
  }, [isPublicRoute, loadHelpUnreadCount]);

  useEffect(() => {
    if (isPublicRoute) return undefined;
    const handler = () => loadSession();
    window.addEventListener('admin-profile-updated', handler);
    return () => window.removeEventListener('admin-profile-updated', handler);
  }, [isPublicRoute, loadSession]);

  useEffect(() => {
    if (!sidebarOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setSidebarOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [sidebarOpen]);

  useEffect(() => {
    // Prevent background scrolling when the mobile drawer is open.
    if (!sidebarOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [sidebarOpen]);

  const handleLogout = () => {
    try {
      const rt = getAdminRefreshToken();
      if (rt) {
        fetch(`${API_URL}/api/admin/staff/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: rt }),
        }).catch(() => null);
      }
    } catch {
      // Ignore.
    }
    clearAdminTokens();
    router.push('/admin');
  };

  const closeSidebar = () => setSidebarOpen(false);
  const toggleSidebar = () => setSidebarOpen((open) => !open);
  const toggleCollapsed = () => setSidebarCollapsed((collapsed) => !collapsed);

  const firstName = useMemo(() => {
    const full = String(session?.full_name || '').trim();
    if (!full) return '';
    const first = full.split(/\s+/).filter(Boolean)[0] || '';
    return first.slice(0, 60);
  }, [session?.full_name]);

  const profileIncomplete = useMemo(() => {
    const full = String(session?.full_name || '').trim();
    const country = String(session?.country || '').trim();
    const address = String(session?.address || '').trim();
    const phone = String(session?.phone_number || '').trim();
    const gender = String(session?.gender || '').trim();
    return !full || !country || !address || !phone || !gender;
  }, [session?.address, session?.country, session?.full_name, session?.gender, session?.phone_number]);

  const navSections = useMemo(() => {
    const permissions = Array.isArray(session?.permissions) ? session.permissions : [];
    const roles = Array.isArray(session?.roles) ? session.roles : [];
    const isAdmin = permissions.includes('*') || permissions.includes('admin.manage') || roles.includes('admin');
    const canSeeUpdatesMenu = isAdmin || roles.includes('hr');

    const hasPermission = (required) => {
      if (!required) return true;
      if (permissions.includes('*')) return true;
      if (Array.isArray(required)) return required.some((r) => permissions.includes(r));
      return permissions.includes(required);
    };

    const sections = [
      {
        id: 'staff',
        label: 'Staff',
        defaultOpen: true,
        items: [
          { href: isAdmin ? '/admin/admin-dashboard' : '/admin/dashboard', label: 'Dashboard', icon: 'D' },
          { href: '/admin/profile', label: 'My Profile', icon: 'ME' },
          ...(canSeeUpdatesMenu ? [{ href: '/admin/updates', label: 'Updates', icon: 'UP', perm: 'intranet_updates.read' }] : []),
          { href: '/admin/attendance', label: 'Clock In/Out', icon: 'CI' },
          { href: '/admin/work-logs', label: 'Work Logs', icon: 'WL' },
          { href: '/admin/work-plans', label: 'Work Plans', icon: 'WP', perm: 'work_logs.manage' },
          { href: '/admin/milestones', label: 'Milestones', icon: 'MS', perm: 'work_logs.manage' },
          { href: '/admin/help', label: 'Help', icon: '?' },
          { href: '/admin/library', label: 'Library', icon: 'LB' },
          { href: '/admin/library/upload', label: 'Upload Asset', icon: '+', perm: 'library.upload' },
          { href: '/admin/inbox', label: 'Inbox', icon: 'IN', perm: 'notifications.read' },
          { href: '/admin/my-payroll', label: 'My Payroll', icon: '$', perm: 'payroll.read_own' },
        ],
      },
      {
        id: 'ops',
        label: 'Operations',
        defaultOpen: isAdmin,
        items: [
          { href: '/admin/reports', label: 'Reports', icon: 'RP', perm: 'reports.read' },
          { href: '/admin/payroll', label: 'Payroll', icon: 'PR', perm: 'payroll.manage' },
          { href: '/admin/staff', label: 'Staff', icon: 'ST', perm: 'staff.manage' },
          { href: '/admin/expenses', label: 'Expenses', icon: 'EX', perm: 'expenses.read' },
          { href: '/admin/audit', label: 'Audit Log', icon: 'AL', perm: 'admin.manage' },
        ],
      },
      {
        id: 'content',
        label: 'Content',
        defaultOpen: isAdmin,
        items: [
          { href: '/admin/users', label: 'Users', icon: 'U', perm: 'users.read' },
          { href: '/admin/recipes', label: 'Recipes', icon: 'R', perm: 'recipes.write' },
          { href: '/admin/recipes/new', label: 'New Recipe', icon: '+', perm: 'recipes.write' },
          { href: '/admin/tips', label: 'Daily Tips', icon: 'T', perm: 'tips.write' },
          { href: '/admin/challenge', label: 'Daily Challenge', icon: 'C', perm: 'challenge.write' },
          { href: '/admin/blog', label: 'Blog', icon: 'B', perm: ['blog.read', 'blog.write', 'blog.publish'] },
          { href: '/admin/blog/new', label: 'New Post', icon: '+', perm: ['blog.write', 'blog.publish'] },
          { href: '/admin/blog/comments', label: 'Comments', icon: 'M', perm: ['blog.read', 'blog.write', 'blog.publish'] },
        ],
      },
      {
        id: 'marketing',
        label: 'Marketing',
        defaultOpen: isAdmin,
        items: [
          { href: '/admin/newsletter', label: 'Newsletter', icon: 'N', perm: 'newsletter.send' },
          { href: '/admin/newsletter/send', label: 'Send Email', icon: 'S', perm: 'newsletter.send' },
          { href: '/admin/user-email', label: 'User Email', icon: 'E', perm: 'email.send' },
          { href: '/admin/notifications', label: 'Notifications', icon: '!', perm: 'push.send' },
          { href: '/admin/push-campaigns', label: 'Push Campaigns', icon: 'PN', perm: 'push.send' },
        ],
      },
      {
        id: 'engineering',
        label: 'Engineering',
        defaultOpen: false,
        items: [
          { href: '/admin/system-health', label: 'System Health', icon: 'H', perm: 'system.read' },
          { href: '/admin/system-logs', label: 'System Logs', icon: 'L', perm: 'logs.read' },
          { href: '/admin/mobile-logs', label: 'Mobile Logs', icon: 'P', perm: 'logs.read' },
          { href: '/admin/db-backups', label: 'Database Backups', icon: 'DB', perm: 'backups.run' },
        ],
      },
    ];

    const cleaned = sections
      .map((s) => ({
        ...s,
        items: (s.items || []).filter((item) => hasPermission(item.perm)),
      }))
      .filter((s) => (s.items || []).length > 0);

    return cleaned;
  }, [session]);

  useEffect(() => {
    if (!navSections.length) return;
    setNavSectionOpen((prev) => {
      const next = { ...(prev || {}) };
      const activeId = navSections.find((s) => (s.items || []).some((i) => i.href === pathname))?.id || null;
      let changed = false;

      for (const s of navSections) {
        if (typeof next[s.id] === 'boolean') continue;
        next[s.id] = s.id === activeId ? true : Boolean(s.defaultOpen);
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [navSections, pathname]);

  const toggleSection = (id) => {
    setNavSectionOpen((prev) => ({ ...(prev || {}), [id]: !(prev || {})[id] }));
  };

  if (isPublicRoute) {
    return <div className="admin-shell">{children}</div>;
  }

  return (
    <div className="admin-shell">
      <div className={`admin-container admin-layout${sidebarCollapsed ? ' is-collapsed' : ''}`}>
        <div
          className={`admin-backdrop${sidebarOpen ? ' is-open' : ''}`}
          onClick={closeSidebar}
          aria-hidden="true"
        />

        <aside
          className={`admin-sidebar${sidebarOpen ? ' is-open' : ''}${sidebarCollapsed ? ' is-collapsed' : ''}`}
          id="admin-sidebar"
        >
          <div className="admin-brand">
            <span className="admin-brand-mark">GF</span>
            <div>
              <p className="admin-brand-title">GlucoForager</p>
              <p className="admin-brand-subtitle">Admin Console</p>
            </div>
            <button
              className="admin-collapse-toggle"
              type="button"
              onClick={toggleCollapsed}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? '>>' : '<<'}
            </button>
            <button
              className="admin-mobile-close"
              type="button"
              onClick={closeSidebar}
              aria-label="Close menu"
            >
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M6 6l12 12" />
                <path d="M18 6L6 18" />
              </svg>
            </button>
          </div>
          <nav className="admin-nav" aria-label="Admin navigation">
            {navSections.map((section) => {
              const open = Boolean(navSectionOpen?.[section.id]);
              return (
                <div key={section.id} className="admin-nav-section">
                  <button
                    type="button"
                    className="admin-nav-section-toggle"
                    onClick={() => toggleSection(section.id)}
                    aria-expanded={open}
                  >
                    <span className="admin-nav-section-title">{section.label}</span>
                    <span className="admin-nav-section-chevron" aria-hidden="true">
                      {open ? '▾' : '▸'}
                    </span>
                  </button>
                  {open ? (
                    <div className="admin-nav-section-items">
                      {section.items.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={pathname === item.href ? 'active' : ''}
                          onClick={closeSidebar}
                          title={item.label}
                        >
                          <span className="admin-nav-icon" aria-hidden="true">
                            {item.icon}
                          </span>
                          <span className="admin-nav-label">{item.label}</span>
                          {item.href === '/admin/help' && helpUnreadCount > 0 ? (
                            <span className="admin-badge danger" style={{ marginLeft: 'auto' }}>
                              {helpUnreadCount}
                            </span>
                          ) : null}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </nav>
          <button className="admin-button secondary" type="button" onClick={handleLogout}>
            Log out
          </button>
        </aside>

        <main className="admin-main">
          <header className="admin-header">
            <button
              className="admin-mobile-menu-button"
              type="button"
              onClick={toggleSidebar}
              aria-label="Toggle menu"
              aria-controls="admin-sidebar"
              aria-expanded={sidebarOpen}
            >
              <svg
                viewBox="0 0 24 24"
                width="22"
                height="22"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M4 6h16" />
                <path d="M4 12h16" />
                <path d="M4 18h16" />
              </svg>
            </button>
            <h1>GlucoForager Admin</h1>
            <p className="admin-signed-in-pill">
              {sessionLoading
                ? 'Loading staff session...'
                : session?.email
                  ? firstName
                    ? `Signed in as ${firstName} (${session.email})`
                    : `Signed in as ${session.email}`
                  : 'Manage recipes, blog posts, and moderation.'}
            </p>
            {!sessionLoading && session?.email && profileIncomplete ? (
              <div className="admin-alert warning" style={{ marginTop: 10 }}>
                Your profile is incomplete — please update it now (urgent).{' '}
                <Link className="admin-link" href="/admin/profile">
                  Update profile
                </Link>
              </div>
            ) : null}
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}

