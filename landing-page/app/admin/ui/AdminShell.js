'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { adminFetch, clearAdminTokens, getAdminAccessToken, getAdminRefreshToken } from '../lib/adminAuth';

const NAV_ICONS = {
  dashboard: (
    <>
      <path d="M4 13h6V4H4v9Z" />
      <path d="M14 20h6V4h-6v16Z" />
      <path d="M4 20h6v-3H4v3Z" />
    </>
  ),
  team: (
    <>
      <path d="M16 11a4 4 0 1 0-8 0" />
      <path d="M4 20a8 8 0 0 1 16 0" />
      <path d="M18 8a3 3 0 0 1 3 3" />
    </>
  ),
  updates: <path d="M4 12a8 8 0 0 1 13.7-5.7L20 8" />,
  notes: (
    <>
      <path d="M7 4h10a2 2 0 0 1 2 2v14l-4-2-4 2-4-2-4 2V6a2 2 0 0 1 2-2Z" />
      <path d="M8 9h8" />
      <path d="M8 13h6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v5l3 2" />
    </>
  ),
  workLogs: (
    <>
      <path d="M7 4h10a2 2 0 0 1 2 2v14H5V6a2 2 0 0 1 2-2Z" />
      <path d="M8 9h8" />
      <path d="M8 13h8" />
      <path d="M8 17h5" />
    </>
  ),
  requests: (
    <>
      <path d="M6 3h9l3 3v15H6V3Z" />
      <path d="M14 3v4h4" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </>
  ),
  drive: (
    <>
      <path d="M4 7h7l2 2h7v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z" />
      <path d="M4 10h16" />
    </>
  ),
  plan: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="M8 12h8" />
      <path d="M8 16h5" />
    </>
  ),
  milestone: (
    <>
      <path d="M5 20V5" />
      <path d="M5 6h11l-2 4 2 4H5" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.8 2.8 0 1 1 4.8 2c-.9.8-1.8 1.2-1.8 2.7" />
      <path d="M12 17h.01" />
    </>
  ),
  library: (
    <>
      <path d="M5 5h14v14H5z" />
      <path d="M9 5v14" />
      <path d="M5 9h14" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4" />
      <path d="M8 8l4-4 4 4" />
      <path d="M5 20h14" />
    </>
  ),
  inbox: (
    <>
      <path d="M4 6h16v12H4z" />
      <path d="m4 8 8 6 8-6" />
    </>
  ),
  payroll: (
    <>
      <rect x="4" y="6" width="16" height="12" rx="2" />
      <path d="M8 12h.01" />
      <path d="M12 12h4" />
    </>
  ),
  reports: (
    <>
      <path d="M5 20V4h14v16" />
      <path d="M9 16V9" />
      <path d="M12 16v-4" />
      <path d="M15 16V7" />
    </>
  ),
  staff: (
    <>
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  expenses: (
    <>
      <path d="M6 4h12v16l-3-2-3 2-3-2-3 2V4Z" />
      <path d="M9 9h6" />
      <path d="M9 13h4" />
    </>
  ),
  audit: (
    <>
      <path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6l-7-3Z" />
      <path d="m9 12 2 2 4-5" />
    </>
  ),
  users: (
    <>
      <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M17 8a3 3 0 0 1 3 3" />
      <path d="M16 20a5 5 0 0 1 5-5" />
    </>
  ),
  recipes: (
    <>
      <path d="M7 3v8" />
      <path d="M5 3v4a2 2 0 0 0 4 0V3" />
      <path d="M17 3v18" />
      <path d="M13 3h4a4 4 0 0 1 0 8h-4" />
    </>
  ),
  ai: (
    <>
      <path d="M12 3 13.8 8.2 19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
      <path d="M19 15v4" />
      <path d="M17 17h4" />
    </>
  ),
  tips: (
    <>
      <path d="M12 3a6 6 0 0 0-3 11v3h6v-3a6 6 0 0 0-3-11Z" />
      <path d="M9 21h6" />
    </>
  ),
  challenge: (
    <>
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M6 4h12v4a6 6 0 0 1-12 0V4Z" />
      <path d="M6 6H3a4 4 0 0 0 4 4" />
      <path d="M18 6h3a4 4 0 0 1-4 4" />
    </>
  ),
  blog: (
    <>
      <path d="M5 4h14v16H5z" />
      <path d="M8 8h8" />
      <path d="M8 12h8" />
      <path d="M8 16h5" />
    </>
  ),
  comments: (
    <>
      <path d="M4 5h16v11H8l-4 4V5Z" />
      <path d="M8 9h8" />
      <path d="M8 13h5" />
    </>
  ),
  newsletter: (
    <>
      <path d="M4 7h16v10H4z" />
      <path d="m4 8 8 6 8-6" />
      <path d="M18 4v4" />
    </>
  ),
  send: (
    <>
      <path d="m21 3-9 18-3-8-8-3 20-7Z" />
      <path d="m9 13 5-5" />
    </>
  ),
  email: (
    <>
      <path d="M4 6h16v12H4z" />
      <path d="m4 8 8 6 8-6" />
      <path d="M8 4h8" />
    </>
  ),
  notifications: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" />
      <path d="M10 21h4" />
    </>
  ),
  push: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M11 18h2" />
      <path d="M12 7v5" />
      <path d="m9.5 9.5 2.5 2.5 2.5-2.5" />
    </>
  ),
  health: (
    <>
      <path d="M12 21s-8-4.5-8-11a5 5 0 0 1 8-4 5 5 0 0 1 8 4c0 6.5-8 11-8 11Z" />
      <path d="M8 12h2l1-2 2 4 1-2h2" />
    </>
  ),
  logs: (
    <>
      <path d="M5 4h14v16H5z" />
      <path d="M8 9h8" />
      <path d="M8 13h8" />
      <path d="M8 17h5" />
    </>
  ),
  mobile: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M11 17h2" />
      <path d="M10 7h4" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="5" rx="7" ry="3" />
      <path d="M5 5v7c0 1.7 3.1 3 7 3s7-1.3 7-3V5" />
      <path d="M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
    </>
  ),
  logout: (
    <>
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
      <path d="M21 4v16" />
    </>
  ),
};

function NavIcon({ name }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {NAV_ICONS[name] || NAV_ICONS.dashboard}
    </svg>
  );
}

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
  const [sidebarCollapsedInitialized, setSidebarCollapsedInitialized] = useState(false);
  const [session, setSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [accessToken, setAccessToken] = useState(null);
  const [navSectionOpen, setNavSectionOpen] = useState({});
  const [navSectionOpenInitialized, setNavSectionOpenInitialized] = useState(false);
  const [helpUnreadCount, setHelpUnreadCount] = useState(0);
  const [inboxUnreadCount, setInboxUnreadCount] = useState(0);
  const [requestsPendingCount, setRequestsPendingCount] = useState(0);
  const [workLogsOpenCount, setWorkLogsOpenCount] = useState(0);
  const [workLogsSubmittedUnreadCount, setWorkLogsSubmittedUnreadCount] = useState(0);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef(null);
  const prevWorkLogsOpenCountRef = useRef(0);

  const loadSession = useCallback(async () => {
    if (isPublicRoute) return;

    const token = accessToken || getAdminAccessToken();
    if (!token) return;

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
  }, [API_URL, accessToken, isPublicRoute, router]);

  useEffect(() => {
    setHydrated(true);
    if (isPublicRoute) return;
    setAccessToken(getAdminAccessToken());
  }, [isPublicRoute]);

  useEffect(() => {
    if (!hydrated) return;
    if (isPublicRoute) return;
    // Avoid redirect race when transitioning from /admin -> protected routes.
    // localStorage is already updated synchronously on login, but React state may lag by 1 render.
    const token = accessToken || getAdminAccessToken();
    if (token) return;
    router.replace('/admin');
  }, [accessToken, hydrated, isPublicRoute, router]);

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
      // Backstop: only count ticket.* types even if backend changes.
      setHelpUnreadCount(items.filter((n) => String(n?.type || '').startsWith('ticket.')).length);
    } catch {
      // ignore
    }
  }, [API_URL, isPublicRoute, session?.permissions]);

  const loadInboxUnreadCount = useCallback(async () => {
    if (isPublicRoute) return;
    const token = getAdminAccessToken();
    if (!token) return;

    const permissions = Array.isArray(session?.permissions) ? session.permissions : [];
    const canReadInbox = permissions.includes('*') || permissions.includes('notifications.read');
    if (!canReadInbox) {
      setInboxUnreadCount(0);
      return;
    }

    try {
      const mailRes = await adminFetch(`${API_URL}/api/admin/inbox/messages?box=inbox&unread_only=1&limit=200`);
      if (mailRes.status === 401) return;
      const mailData = await mailRes.json().catch(() => ({}));
      const mailItems = Array.isArray(mailData?.items) ? mailData.items : [];
      // Inbox badge should reflect unread mail only (not general notifications).
      setInboxUnreadCount(mailItems.length);
    } catch {
      // ignore
    }
  }, [API_URL, isPublicRoute, session?.permissions]);

  const loadRequestsPendingCount = useCallback(async () => {
    if (isPublicRoute) return;
    const token = getAdminAccessToken();
    if (!token) return;

    const permissions = Array.isArray(session?.permissions) ? session.permissions : [];
    const canManageRequests = permissions.includes('*') || permissions.includes('requests.manage');
    if (!canManageRequests) {
      setRequestsPendingCount(0);
      return;
    }

    try {
      const response = await adminFetch(`${API_URL}/api/admin/requests/pending-count`);
      if (response.status === 401) return;
      const data = await response.json().catch(() => ({}));
      setRequestsPendingCount(Number(data?.count || 0) || 0);
    } catch {
      // ignore
    }
  }, [API_URL, isPublicRoute, session?.permissions]);

  const loadWorkLogsOpenCount = useCallback(async () => {
    if (isPublicRoute) return;
    const token = getAdminAccessToken();
    if (!token) return;

    const permissions = Array.isArray(session?.permissions) ? session.permissions : [];
    const roles = Array.isArray(session?.roles) ? session.roles : [];
    const isAdminForBadge = permissions.includes('*') || permissions.includes('admin.manage') || roles.includes('admin');
    const canReadWorkLogs = permissions.includes('*') || permissions.includes('work_logs.read');
    if (isAdminForBadge || !canReadWorkLogs) {
      setWorkLogsOpenCount(0);
      return;
    }

    try {
      const response = await adminFetch(`${API_URL}/api/admin/work-plans/open-count`);
      if (response.status === 401) return;
      const data = await response.json().catch(() => ({}));
      setWorkLogsOpenCount(Number(data?.count || 0) || 0);
    } catch {
      // ignore
    }
  }, [API_URL, isPublicRoute, session?.permissions, session?.roles]);

  const loadWorkLogsSubmittedUnreadCount = useCallback(async () => {
    if (isPublicRoute) return;
    const token = getAdminAccessToken();
    if (!token) return;

    const permissions = Array.isArray(session?.permissions) ? session.permissions : [];
    const roles = Array.isArray(session?.roles) ? session.roles : [];
    const isAdminForBadge = permissions.includes('*') || permissions.includes('admin.manage') || roles.includes('admin');
    const canReadNotifications = permissions.includes('*') || permissions.includes('notifications.read');
    if (!isAdminForBadge || !canReadNotifications) {
      setWorkLogsSubmittedUnreadCount(0);
      return;
    }

    try {
      const response = await adminFetch(`${API_URL}/api/admin/staff-notifications?unread_only=1&limit=200`);
      if (response.status === 401) return;
      const data = await response.json().catch(() => ({}));
      const items = Array.isArray(data?.items) ? data.items : [];
      setWorkLogsSubmittedUnreadCount(items.filter((n) => String(n?.type || '') === 'worklog.submitted').length);
    } catch {
      // ignore
    }
  }, [API_URL, isPublicRoute, session?.permissions, session?.roles]);

  useEffect(() => {
    if (!session?.email) return;
    if (!navSectionOpenInitialized) return;
    try {
      const permissions = Array.isArray(session?.permissions) ? session.permissions : [];
      const roles = Array.isArray(session?.roles) ? session.roles : [];
      const isAdminForKey = permissions.includes('*') || permissions.includes('admin.manage') || roles.includes('admin');
      const key = isAdminForKey ? 'adminNavSectionOpen' : 'staffNavSectionOpen';
      localStorage.setItem(key, JSON.stringify(navSectionOpen || {}));
    } catch {
      // Ignore.
    }
  }, [navSectionOpen, navSectionOpenInitialized, session?.email, session?.permissions, session?.roles]);

  useEffect(() => {
    // Persist collapsed state, but keep admin + staff separated so one user's preference
    // doesn't make the sidebar look "missing" for another role.
    if (!session?.email) return;
    if (!sidebarCollapsedInitialized) return;
    try {
      const permissions = Array.isArray(session?.permissions) ? session.permissions : [];
      const roles = Array.isArray(session?.roles) ? session.roles : [];
      const isAdminForKey = permissions.includes('*') || permissions.includes('admin.manage') || roles.includes('admin');
      const key = isAdminForKey ? 'adminSidebarCollapsed' : 'staffSidebarCollapsed';
      localStorage.setItem(key, sidebarCollapsed ? '1' : '0');
    } catch {
      // Ignore.
    }
  }, [session?.email, session?.permissions, session?.roles, sidebarCollapsed, sidebarCollapsedInitialized]);

  useEffect(() => {
    // Close the sidebar on navigation.
    setSidebarOpen(false);
    setProfileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!profileMenuOpen) return undefined;
    const handlePointerDown = (event) => {
      if (profileMenuRef.current?.contains?.(event.target)) return;
      setProfileMenuOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setProfileMenuOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [profileMenuOpen]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    loadHelpUnreadCount();
  }, [loadHelpUnreadCount, pathname]);

  useEffect(() => {
    loadInboxUnreadCount();
  }, [loadInboxUnreadCount, pathname]);

  useEffect(() => {
    loadRequestsPendingCount();
  }, [loadRequestsPendingCount, pathname]);

  useEffect(() => {
    loadWorkLogsOpenCount();
  }, [loadWorkLogsOpenCount, pathname]);

  useEffect(() => {
    loadWorkLogsSubmittedUnreadCount();
  }, [loadWorkLogsSubmittedUnreadCount, pathname]);

  useEffect(() => {
    // If the Work Logs badge increases while the user is already on /admin/work-logs,
    // trigger a refresh so new tasks appear without manual reloads.
    if (pathname !== '/admin/work-logs') {
      prevWorkLogsOpenCountRef.current = Number(workLogsOpenCount || 0) || 0;
      return;
    }

    const prev = Number(prevWorkLogsOpenCountRef.current || 0) || 0;
    const next = Number(workLogsOpenCount || 0) || 0;
    prevWorkLogsOpenCountRef.current = next;
    if (next > prev) {
      try {
        window.dispatchEvent(new Event('admin-work-logs-updated'));
      } catch {
        // ignore
      }
    }
  }, [pathname, workLogsOpenCount]);

  useEffect(() => {
    if (isPublicRoute) return undefined;
    const handler = () => loadHelpUnreadCount();
    window.addEventListener('admin-help-notifications-updated', handler);
    return () => window.removeEventListener('admin-help-notifications-updated', handler);
  }, [isPublicRoute, loadHelpUnreadCount]);

  useEffect(() => {
    if (isPublicRoute) return undefined;
    const handler = () => loadInboxUnreadCount();
    window.addEventListener('admin-inbox-updated', handler);
    return () => window.removeEventListener('admin-inbox-updated', handler);
  }, [isPublicRoute, loadInboxUnreadCount]);

  useEffect(() => {
    if (isPublicRoute) return undefined;
    const handler = () => loadWorkLogsSubmittedUnreadCount();
    window.addEventListener('admin-inbox-updated', handler);
    return () => window.removeEventListener('admin-inbox-updated', handler);
  }, [isPublicRoute, loadWorkLogsSubmittedUnreadCount]);

  useEffect(() => {
    if (isPublicRoute) return undefined;
    const handler = () => loadRequestsPendingCount();
    window.addEventListener('admin-requests-updated', handler);
    return () => window.removeEventListener('admin-requests-updated', handler);
  }, [isPublicRoute, loadRequestsPendingCount]);

  useEffect(() => {
    if (isPublicRoute) return undefined;
    const handler = () => loadWorkLogsOpenCount();
    window.addEventListener('admin-work-logs-updated', handler);
    return () => window.removeEventListener('admin-work-logs-updated', handler);
  }, [isPublicRoute, loadWorkLogsOpenCount]);

  useEffect(() => {
    if (isPublicRoute) return undefined;
    const timer = setInterval(() => loadHelpUnreadCount(), 20_000);
    return () => clearInterval(timer);
  }, [isPublicRoute, loadHelpUnreadCount]);

  useEffect(() => {
    if (isPublicRoute) return undefined;
    const timer = setInterval(() => loadInboxUnreadCount(), 12_000);
    return () => clearInterval(timer);
  }, [isPublicRoute, loadInboxUnreadCount]);

  useEffect(() => {
    if (isPublicRoute) return undefined;
    const timer = setInterval(() => loadRequestsPendingCount(), 20_000);
    return () => clearInterval(timer);
  }, [isPublicRoute, loadRequestsPendingCount]);

  useEffect(() => {
    if (isPublicRoute) return undefined;
    const timer = setInterval(() => loadWorkLogsOpenCount(), 20_000);
    return () => clearInterval(timer);
  }, [isPublicRoute, loadWorkLogsOpenCount]);

  useEffect(() => {
    if (isPublicRoute) return undefined;
    const timer = setInterval(() => loadWorkLogsSubmittedUnreadCount(), 20_000);
    return () => clearInterval(timer);
  }, [isPublicRoute, loadWorkLogsSubmittedUnreadCount]);

  useEffect(() => {
    if (isPublicRoute) return undefined;
    const handler = () => {
      if (document.visibilityState !== 'visible') return;
      loadInboxUnreadCount();
    };
    document.addEventListener('visibilitychange', handler);
    window.addEventListener('focus', handler);
    return () => {
      document.removeEventListener('visibilitychange', handler);
      window.removeEventListener('focus', handler);
    };
  }, [isPublicRoute, loadInboxUnreadCount]);

  useEffect(() => {
    if (isPublicRoute) return undefined;
    const handler = () => {
      if (document.visibilityState !== 'visible') return;
      loadWorkLogsOpenCount();
    };
    document.addEventListener('visibilitychange', handler);
    window.addEventListener('focus', handler);
    return () => {
      document.removeEventListener('visibilitychange', handler);
      window.removeEventListener('focus', handler);
    };
  }, [isPublicRoute, loadWorkLogsOpenCount]);

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

  const permissions = Array.isArray(session?.permissions) ? session.permissions : [];
  const roles = Array.isArray(session?.roles) ? session.roles : [];
  const isAdmin = permissions.includes('*') || permissions.includes('admin.manage') || roles.includes('admin');
  const isDemo = Boolean(session?.is_demo) || roles.includes('demo_admin') || roles.includes('demo');
  const isMarketer = roles.includes('marketer');
  const canSeeUpdatesMenu = isAdmin || roles.includes('hr');
  const canSeeStandupNotesMenu = permissions.includes('*') || permissions.includes('dashboard_notes.manage');

  useEffect(() => {
    if (isPublicRoute) return;
    if (!hydrated) return;
    if (sessionLoading) return;
    if (!session?.email) return;

    if (isDemo && (pathname === '/admin/admin-dashboard' || pathname === '/admin/dashboard')) {
      router.replace('/admin/users');
      return;
    }

    // Guard admin-only routes from non-admin staff to avoid exposing partial admin screens.
    if (!isAdmin && pathname === '/admin/admin-dashboard') {
      router.replace('/admin/dashboard');
    }
  }, [hydrated, isAdmin, isDemo, isPublicRoute, pathname, router, session?.email, sessionLoading]);

  useEffect(() => {
    if (isPublicRoute) return;
    if (sessionLoading) return;
    if (!session?.email) return;
    if (sidebarCollapsedInitialized) return;

    try {
      const key = isAdmin ? 'adminSidebarCollapsed' : 'staffSidebarCollapsed';
      const stored = localStorage.getItem(key);
      setSidebarCollapsed(stored === '1');
    } catch {
      setSidebarCollapsed(false);
    } finally {
      setSidebarCollapsedInitialized(true);
    }
  }, [isAdmin, isPublicRoute, session?.email, sessionLoading, sidebarCollapsedInitialized]);

  useEffect(() => {
    if (isPublicRoute) return;
    if (sessionLoading) return;
    if (!session?.email) return;
    if (navSectionOpenInitialized) return;

    try {
      const key = isAdmin ? 'adminNavSectionOpen' : 'staffNavSectionOpen';
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') setNavSectionOpen(parsed);
    } catch {
      // ignore
    } finally {
      setNavSectionOpenInitialized(true);
    }
  }, [isAdmin, isPublicRoute, navSectionOpenInitialized, session?.email, sessionLoading]);

  const navSections = useMemo(() => {
    const hasPermission = (required) => {
      if (!required) return true;
      if (permissions.includes('*')) return true;
      if (Array.isArray(required)) return required.some((r) => permissions.includes(r));
      return permissions.includes(required);
    };

    if (isDemo) {
      return [
        {
          id: 'content',
          label: 'Content',
          defaultOpen: true,
          items: [
            { href: '/admin/users', label: 'Users', icon: 'users' },
            { href: '/admin/recipes', label: 'Recipes', icon: 'recipes' },
            { href: '/admin/recipes/ai-generator', label: 'AI Recipe Studio', icon: 'ai' },
            { href: '/admin/recipes/new', label: 'New Recipe', icon: 'upload' },
            { href: '/admin/tips', label: 'Daily Tips', icon: 'tips' },
            { href: '/admin/challenge', label: 'Daily Challenge', icon: 'challenge' },
            { href: '/admin/blog', label: 'Blog', icon: 'blog' },
            { href: '/admin/blog/new', label: 'New Post', icon: 'upload' },
            { href: '/admin/blog/comments', label: 'Comments', icon: 'comments' },
          ],
        },
        {
          id: 'marketing',
          label: 'Marketing',
          defaultOpen: true,
          items: [
            { href: '/admin/newsletter', label: 'Newsletter', icon: 'newsletter' },
            { href: '/admin/newsletter/send', label: 'Send Email', icon: 'send' },
            { href: '/admin/user-email', label: 'User Email', icon: 'email' },
            { href: '/admin/notifications', label: 'Notifications', icon: 'notifications' },
            { href: '/admin/push-campaigns', label: 'Push Campaigns', icon: 'push' },
          ],
        },
        {
          id: 'engineering',
          label: 'Engineering',
          defaultOpen: true,
          items: [
            { href: '/admin/system-health', label: 'System Health', icon: 'health' },
            { href: '/admin/system-logs', label: 'System Logs', icon: 'logs' },
            { href: '/admin/mobile-logs', label: 'Mobile Logs', icon: 'mobile' },
            { href: '/admin/db-backups', label: 'Database Backups', icon: 'database' },
          ],
        },
      ];
    }

    const sections = [
      {
        id: 'staff',
        label: 'Staff',
        defaultOpen: true,
        items: [
          { href: isAdmin ? '/admin/admin-dashboard' : '/admin/dashboard', label: 'Dashboard', icon: 'dashboard' },
          ...(session?.email && !isAdmin ? [{ href: '/admin/my-team', label: 'My Team', icon: 'team' }] : []),
          ...(canSeeUpdatesMenu ? [{ href: '/admin/updates', label: 'Updates', icon: 'updates', perm: 'intranet_updates.read' }] : []),
          ...(canSeeStandupNotesMenu ? [{ href: '/admin/standup-notes', label: 'Standup Notes', icon: 'notes', perm: 'dashboard_notes.manage' }] : []),
          { href: '/admin/attendance', label: 'Clock In/Out', icon: 'clock' },
          { href: '/admin/work-logs', label: 'Work Logs', icon: 'workLogs' },
          { href: '/admin/requests', label: 'My Requests', icon: 'requests', perm: ['requests.read_own', 'requests.write_own'] },
          { href: '/admin/my-drive', label: 'MyDrive', icon: 'drive' },
          ...(isAdmin ? [{ href: '/admin/staff-drive', label: 'StaffDrive', icon: 'drive', perm: 'admin.manage' }] : []),
          { href: '/admin/work-plans', label: 'Work Plans', icon: 'plan', perm: 'work_logs.manage' },
          { href: '/admin/milestones', label: 'Milestones', icon: 'milestone', perm: 'work_logs.manage' },
          { href: '/admin/help', label: 'Help', icon: 'help' },
          { href: '/admin/library', label: 'Library', icon: 'library' },
          { href: '/admin/library/upload', label: 'Upload Asset', icon: 'upload', perm: 'library.upload' },
          { href: '/admin/inbox', label: 'Inbox', icon: 'inbox', perm: 'notifications.read' },
          { href: '/admin/my-payroll', label: 'My Payroll', icon: 'payroll', perm: 'payroll.read_own' },
        ],
      },
      {
        id: 'ops',
        label: 'Operations',
        defaultOpen: isAdmin,
        items: [
          { href: '/admin/reports', label: 'Reports', icon: 'reports', perm: 'reports.read' },
          { href: '/admin/payroll', label: 'Payroll', icon: 'payroll', perm: 'payroll.manage' },
          { href: '/admin/staff', label: 'Staff', icon: 'staff', perm: 'staff.manage' },
          { href: '/admin/expenses', label: 'Expenses', icon: 'expenses', perm: 'expenses.read' },
          { href: '/admin/requests/manage', label: 'Requests', icon: 'requests', perm: 'requests.manage' },
          { href: '/admin/audit', label: 'Audit Log', icon: 'audit', perm: 'admin.manage' },
        ],
      },
      {
        id: 'content',
        label: 'Content',
        defaultOpen: isAdmin,
        items: [
          { href: '/admin/users', label: 'Users', icon: 'users', perm: 'users.read' },
          { href: '/admin/recipes', label: 'Recipes', icon: 'recipes', perm: 'recipes.write' },
          { href: '/admin/recipes/ai-generator', label: 'AI Recipe Studio', icon: 'ai', perm: 'recipes.write' },
          { href: '/admin/recipes/new', label: 'New Recipe', icon: 'upload', perm: 'recipes.write' },
          { href: '/admin/tips', label: 'Daily Tips', icon: 'tips', perm: 'tips.write' },
          { href: '/admin/challenge', label: 'Daily Challenge', icon: 'challenge', perm: 'challenge.write' },
          { href: '/admin/blog', label: 'Blog', icon: 'blog', perm: ['blog.read', 'blog.write', 'blog.publish'] },
          { href: '/admin/blog/new', label: 'New Post', icon: 'upload', perm: ['blog.write', 'blog.publish'] },
          { href: '/admin/blog/comments', label: 'Comments', icon: 'comments', perm: ['blog.read', 'blog.write', 'blog.publish'] },
        ],
      },
      {
        id: 'marketing',
        label: 'Marketing',
        defaultOpen: isAdmin,
        // Hide Marketing tools from marketer staff accounts (admin keeps access).
        items:
          isMarketer && !isAdmin
            ? []
            : [
                { href: '/admin/newsletter', label: 'Newsletter', icon: 'newsletter', perm: 'newsletter.send' },
                { href: '/admin/newsletter/send', label: 'Send Email', icon: 'send', perm: 'newsletter.send' },
                { href: '/admin/user-email', label: 'User Email', icon: 'email', perm: 'email.send' },
                { href: '/admin/notifications', label: 'Notifications', icon: 'notifications', perm: 'push.send' },
                { href: '/admin/push-campaigns', label: 'Push Campaigns', icon: 'push', perm: 'push.send' },
              ],
      },
      {
        id: 'engineering',
        label: 'Engineering',
        defaultOpen: false,
        items: [
          { href: '/admin/system-health', label: 'System Health', icon: 'health', perm: 'system.read' },
          { href: '/admin/system-logs', label: 'System Logs', icon: 'logs', perm: 'logs.read' },
          { href: '/admin/mobile-logs', label: 'Mobile Logs', icon: 'mobile', perm: 'logs.read' },
          { href: '/admin/db-backups', label: 'Database Backups', icon: 'database', perm: 'backups.run' },
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
  }, [canSeeStandupNotesMenu, canSeeUpdatesMenu, isAdmin, isDemo, isMarketer, permissions, session]);

  const portalTitle = isDemo ? 'GlucoForager Demo' : isAdmin ? 'GlucoForager Admin' : 'GlucoForager Staff Portal';
  const signedInLabel = useMemo(() => {
    if (sessionLoading) return 'Loading staff session...';
    if (!session?.email) return 'Manage recipes, blog posts, and moderation.';
    if (isDemo) {
      if (firstName) return `Demo walkthrough as ${firstName}`;
      return 'Read-only demo walkthrough';
    }
    if (isAdmin) {
      if (firstName) return `Signed in as ${firstName} (${session.email})`;
      return `Signed in as ${session.email}`;
    }
    if (firstName) return `Welcome ${firstName}`;
    return `Welcome ${session.email}`;
  }, [firstName, isAdmin, isDemo, session?.email, sessionLoading]);

  const primaryRoleLabel = useMemo(() => {
    const r = Array.isArray(roles) ? roles[0] : null;
    const key = String(r || '').trim().toLowerCase();
    if (!key) return '';
    if (key === 'hr') return 'HR';
    if (key === 'admin') return 'Admin';
    if (key === 'demo_admin' || key === 'demo') return 'Demo';
    return key.charAt(0).toUpperCase() + key.slice(1);
  }, [roles]);

  const employeeCode = useMemo(() => {
    const c = String(session?.employee_code || '').trim();
    if (c) return c.slice(0, 32);
    return '';
  }, [session?.employee_code]);

  const profileInitials = useMemo(() => {
    const source = String(session?.full_name || session?.email || 'GF').trim();
    const parts = source.split(/[\s@._-]+/).filter(Boolean);
    return (parts[0]?.[0] || 'G').toUpperCase() + (parts[1]?.[0] || '').toUpperCase();
  }, [session?.email, session?.full_name]);

  const avatarUrl = useMemo(() => {
    const raw = String(session?.avatar_url || '').trim();
    if (!raw) return '';
    return raw;
  }, [session?.avatar_url]);

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

  // Important: keep the first render identical between server + client to avoid hydration errors.
  // We only read localStorage (token) after hydration.
  if (!hydrated) return <div className="admin-shell" />;

  // If there's no token, redirect (handled in effect) and don't render any admin UI.
  if (!accessToken) return <div className="admin-shell" />;

  // While loading the session, render a minimal shell without navigation to avoid content flashes.
  if (sessionLoading) {
    return (
      <div className={`admin-shell${isDemo ? ' is-demo' : ''}`}>
        <div className="admin-container admin-layout">
          <main className="admin-main w-full">
            <div className="admin-card">
              <h2 className="admin-title">Loading…</h2>
              <p className="admin-subtitle">Checking your session.</p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  // Token exists but session couldn't load (expired token / network / backend down).
  if (!session) {
    return (
      <div className="admin-shell">
        <div className="admin-container admin-layout">
          <main className="admin-main w-full">
            <div className="admin-card">
              <h2 className="admin-title">Session required</h2>
              <p className="admin-subtitle">Please sign in again to access the admin portal.</p>
              <div className="admin-actions">
                <button
                  type="button"
                  className="admin-button"
                  onClick={() => {
                    clearAdminTokens();
                    router.replace('/admin');
                  }}
                >
                  Go to login
                </button>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className={`admin-shell${isDemo ? ' is-demo' : ''}`}>
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
            <span className="admin-brand-mark">
              <img src="/images/logo.png" alt="" />
            </span>
            <div>
              <p className="admin-brand-title">GlucoForager</p>
              <p className="admin-brand-subtitle">{isDemo ? 'Demo Portal' : isAdmin ? 'Admin Console' : 'Staff Portal'}</p>
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
              // When the sidebar is collapsed into an icon rail, always show items.
              // Otherwise, a persisted "closed" section state could result in an empty sidebar
              // (since section headers are hidden in collapsed mode).
              const open = sidebarCollapsed ? true : Boolean(navSectionOpen?.[section.id]);
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
                          onClick={(e) => {
                            // Next.js won't "navigate" when clicking the same route.
                            // Use this as a manual refresh gesture to avoid confusion.
                            if (pathname === item.href) {
                              e?.preventDefault?.();
                              try {
                                window.dispatchEvent(new CustomEvent('admin-route-refresh', { detail: { href: item.href } }));
                              } catch {
                                // ignore
                              }
                            }
                            closeSidebar();
                          }}
                          title={item.label}
                        >
                          <span className="admin-nav-icon" aria-hidden="true">
                            <NavIcon name={item.icon} />
                          </span>
                          <span className="admin-nav-label">{item.label}</span>
                          {item.href === '/admin/help' && helpUnreadCount > 0 ? (
                            <span className="admin-badge danger" style={{ marginLeft: 'auto' }}>
                              {helpUnreadCount}
                            </span>
                          ) : null}
                          {item.href === '/admin/inbox' && inboxUnreadCount > 0 ? (
                            <span className="admin-badge danger" style={{ marginLeft: 'auto' }}>
                              {inboxUnreadCount}
                            </span>
                          ) : null}
                          {item.href === '/admin/requests/manage' && requestsPendingCount > 0 ? (
                            <span className="admin-badge warning" style={{ marginLeft: 'auto' }}>
                              {requestsPendingCount}
                            </span>
                          ) : null}
                          {item.href === '/admin/work-logs' && !isAdmin && workLogsOpenCount > 0 ? (
                            <span className="admin-badge danger" style={{ marginLeft: 'auto' }}>
                              {workLogsOpenCount}
                            </span>
                          ) : null}
                          {item.href === '/admin/work-logs' && isAdmin && workLogsSubmittedUnreadCount > 0 ? (
                            <span className="admin-badge danger" style={{ marginLeft: 'auto' }}>
                              {workLogsSubmittedUnreadCount}
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
          <div className="admin-sidebar-footer">
            <button className="admin-sidebar-logout" type="button" onClick={handleLogout} title="Log out">
              <span className="admin-nav-icon" aria-hidden="true">
                <NavIcon name="logout" />
              </span>
              <span className="admin-nav-label">Log out</span>
            </button>
          </div>
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
            <div className="admin-header-topline">
              <div>
                <h1>{portalTitle}</h1>
                {isDemo ? <p className="admin-demo-header-note">Read-only portfolio walkthrough. Write actions are disabled.</p> : null}
              </div>
              <div className="admin-account-menu" ref={profileMenuRef}>
                <button
                  className="admin-account-trigger"
                  type="button"
                  onClick={() => setProfileMenuOpen((open) => !open)}
                  aria-haspopup="menu"
                  aria-expanded={profileMenuOpen}
                >
                  <span className="admin-account-avatar">
                    {avatarUrl ? <img src={avatarUrl} alt="" /> : profileInitials}
                  </span>
                  <span className="admin-account-name">{firstName || primaryRoleLabel || 'Account'}</span>
                  <span className="admin-account-chevron" aria-hidden="true">▾</span>
                </button>
                {profileMenuOpen ? (
                  <div className="admin-account-dropdown" role="menu">
                    <div className="admin-account-dropdown-head">
                      <div className="admin-account-dropdown-profile">
                        <span className="admin-account-avatar">
                          {avatarUrl ? <img src={avatarUrl} alt="" /> : profileInitials}
                        </span>
                        <div>
                          <strong>{session?.full_name || firstName || 'Staff account'}</strong>
                          <span>{session?.email}</span>
                        </div>
                      </div>
                    </div>
                    <Link className="admin-account-dropdown-item" href="/admin/profile" role="menuitem">
                      My profile
                    </Link>
                    <button className="admin-account-dropdown-item danger" type="button" onClick={handleLogout} role="menuitem">
                      Log out
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
            <p className="admin-signed-in-pill" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span>{signedInLabel}</span>
              {!sessionLoading && session?.email && !isAdmin && primaryRoleLabel ? (
                <span className="admin-badge info" style={{ marginLeft: 6 }}>
                  Role: {primaryRoleLabel}
                </span>
              ) : null}
              {!sessionLoading && session?.email && !isAdmin && employeeCode ? (
                <span className="admin-badge secondary" style={{ marginLeft: 6 }}>
                  Employee ID: {employeeCode}
                </span>
              ) : null}
            </p>
            {!sessionLoading && session?.email && !isDemo && profileIncomplete ? (
              <div className="admin-alert warning" style={{ marginTop: 10 }}>
                Your profile is incomplete — please update it now (urgent).{' '}
                <Link className="admin-link" href="/admin/profile">
                  Update profile
                </Link>
              </div>
            ) : null}
          </header>
          {isDemo ? (
            <div className="admin-alert info admin-demo-banner">
              Demo mode: this account can view selected Content, Marketing, and Engineering screens only. Data-changing actions are blocked.
            </div>
          ) : null}
          {children}
          {!sessionLoading && session?.email && !isAdmin ? (
            <footer className="admin-footer" role="contentinfo">
              <div className="admin-footer-left">
                <span className="admin-footer-brand">GF-Staff Portal v1.0</span>
              </div>
              <div className="admin-footer-right">
                <span className="admin-footer-muted">
                  Powered by{' '}
                  <a className="admin-link" href="https://www.bhoyee.com/" target="_blank" rel="noopener noreferrer">
                    Bhoyee Global Dev Team
                  </a>
                </span>
              </div>
            </footer>
          ) : null}
        </main>
      </div>
    </div>
  );
}
