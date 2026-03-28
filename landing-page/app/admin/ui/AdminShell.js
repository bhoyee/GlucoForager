'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { adminFetch, clearAdminTokens, getAdminAccessToken, getAdminRefreshToken } from '../lib/adminAuth';

export default function AdminShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === '/admin';
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [session, setSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(false);

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
    if (isLogin) return undefined;

    const token = getAdminAccessToken();
    if (!token) {
      router.push('/admin');
      return undefined;
    }

    let cancelled = false;
    const load = async () => {
      setSessionLoading(true);
      try {
        const response = await adminFetch(`${API_URL}/api/admin/me`);
        if (response.status === 401) {
          clearAdminTokens();
          router.push('/admin');
          return;
        }
        const data = await response.json();
        if (!cancelled) setSession(data);
      } catch {
        // If we can't load session, keep UI but user may see 401s inside pages.
        if (!cancelled) setSession(null);
      } finally {
        if (!cancelled) setSessionLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [isLogin, router]);

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

  if (isLogin) {
    return <div className="admin-shell">{children}</div>;
  }

  const permissions = Array.isArray(session?.permissions) ? session.permissions : [];
  const hasPermission = (required) => {
    if (!required) return true;
    if (permissions.includes('*')) return true;
    if (Array.isArray(required)) return required.some((r) => permissions.includes(r));
    return permissions.includes(required);
  };

  const navItems = [
    { href: '/admin/dashboard', label: 'Dashboard', icon: 'D' },
    { href: '/admin/inbox', label: 'Inbox', icon: 'IN', perm: 'notifications.read' },
    { href: '/admin/attendance', label: 'Clock In/Out', icon: 'CI' },
    { href: '/admin/work-logs', label: 'Work Logs', icon: 'WL' },
    { href: '/admin/library', label: 'Library', icon: 'LB' },
    { href: '/admin/help', label: 'Help', icon: '?' },
    { href: '/admin/reports', label: 'Reports', icon: 'RP', perm: 'reports.read' },
    { href: '/admin/users', label: 'Users', icon: 'U', perm: 'users.read' },
    { href: '/admin/recipes', label: 'Recipes', icon: 'R', perm: 'recipes.write' },
    { href: '/admin/recipes/new', label: 'New Recipe', icon: '+', perm: 'recipes.write' },
    { href: '/admin/tips', label: 'Daily Tips', icon: 'T', perm: 'tips.write' },
    { href: '/admin/challenge', label: 'Daily Challenge', icon: 'C', perm: 'challenge.write' },
    { href: '/admin/blog', label: 'Blog', icon: 'B', perm: ['blog.read', 'blog.write', 'blog.publish'] },
    { href: '/admin/blog/new', label: 'New Post', icon: '+', perm: ['blog.write', 'blog.publish'] },
    { href: '/admin/blog/comments', label: 'Comments', icon: 'M', perm: ['blog.read', 'blog.write', 'blog.publish'] },
    { href: '/admin/newsletter', label: 'Newsletter', icon: 'N', perm: 'newsletter.send' },
    { href: '/admin/newsletter/send', label: 'Send Email', icon: 'S', perm: 'newsletter.send' },
    { href: '/admin/user-email', label: 'User Email', icon: 'E', perm: 'email.send' },
    { href: '/admin/notifications', label: 'Notifications', icon: '!', perm: 'push.send' },
    { href: '/admin/push-campaigns', label: 'Push Campaigns', icon: 'PN', perm: 'push.send' },
    { href: '/admin/system-health', label: 'System Health', icon: 'H', perm: 'system.read' },
    { href: '/admin/system-logs', label: 'System Logs', icon: 'L', perm: 'logs.read' },
    { href: '/admin/mobile-logs', label: 'Mobile Logs', icon: 'P', perm: 'logs.read' },
    { href: '/admin/db-backups', label: 'Database Backups', icon: 'DB', perm: 'backups.run' },
    { href: '/admin/staff', label: 'Staff', icon: 'ST', perm: 'staff.manage' },
    { href: '/admin/expenses', label: 'Expenses', icon: 'EX', perm: 'expenses.read' },
    { href: '/admin/audit', label: 'Audit Log', icon: 'AL', perm: 'admin.manage' },
  ].filter((item) => hasPermission(item.perm));

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
          <nav className="admin-nav">
            {navItems.map((item) => (
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
              </Link>
            ))}
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
            <p>
              {sessionLoading
                ? 'Loading staff session...'
                : session?.email
                  ? `Signed in as ${session.email}`
                  : 'Manage recipes, blog posts, and moderation.'}
            </p>
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}

