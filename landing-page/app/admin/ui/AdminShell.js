'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function AdminShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === '/admin';
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
    localStorage.removeItem('adminToken');
    router.push('/admin');
  };

  const closeSidebar = () => setSidebarOpen(false);
  const toggleSidebar = () => setSidebarOpen((open) => !open);
  const toggleCollapsed = () => setSidebarCollapsed((collapsed) => !collapsed);

  if (isLogin) {
    return <div className="admin-shell">{children}</div>;
  }

  const navItems = [
    { href: '/admin/dashboard', label: 'Dashboard', icon: '📊' },
    { href: '/admin/users', label: 'Users', icon: '👤' },
    { href: '/admin/recipes', label: 'Recipes', icon: '🍲' },
    { href: '/admin/recipes/new', label: 'New Recipe', icon: '➕' },
    { href: '/admin/blog', label: 'Blog', icon: '📝' },
    { href: '/admin/blog/new', label: 'New Post', icon: '➕' },
    { href: '/admin/blog/comments', label: 'Comments', icon: '💬' },
    { href: '/admin/newsletter', label: 'Newsletter', icon: '✉️' },
    { href: '/admin/newsletter/send', label: 'Send Email', icon: '📨' },
    { href: '/admin/system-health', label: 'System Health', icon: '❤️' },
    { href: '/admin/system-logs', label: 'System Logs', icon: '🧾' },
    { href: '/admin/mobile-logs', label: 'Mobile Logs', icon: '📱' },
    { href: '/admin/db-backups', label: 'Database Backups', icon: '🗄️' },
  ];

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
              {sidebarCollapsed ? '»' : '«'}
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
            <p>Manage recipes, blog posts, and moderation.</p>
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}
