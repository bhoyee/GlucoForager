'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';
const PAGE_SIZE = 1;
const REFRESH_MS = 20000;
const GROWTH_RANGES = {
  week: { label: 'Weekly' },
  month: { label: 'Monthly' },
  year: { label: 'Yearly' },
};

function clampPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, numeric));
}

function formatNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0';
  return new Intl.NumberFormat('en-US').format(numeric);
}

function formatRelativeTime(iso) {
  if (!iso) return '';
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(diffMs)) return '';
    const minutes = Math.max(0, Math.floor(diffMs / 60000));
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  } catch {
    return '';
  }
}

function KpiTile({ label, value, detail, tone = 'green', href, actionLabel }) {
  return (
    <div className={`admin-kpi-tile tone-${tone}`}>
      <div className="admin-kpi-tile-top">
        <span>{label}</span>
        {href ? (
          <Link className="admin-kpi-tile-link" href={href}>
            {actionLabel || 'Open'}
          </Link>
        ) : null}
      </div>
      <div className="admin-kpi-tile-value">{value}</div>
      {detail ? <div className="admin-kpi-tile-detail">{detail}</div> : null}
    </div>
  );
}

function ProgressBar({ label, value, meta, tone = 'green' }) {
  return (
    <div className="admin-kpi-progress-row">
      <div className="admin-kpi-progress-head">
        <span>{label}</span>
        <strong>{meta}</strong>
      </div>
      <div className="admin-kpi-progress-track" aria-hidden="true">
        <div className={`admin-kpi-progress-fill tone-${tone}`} style={{ width: `${clampPercent(value)}%` }} />
      </div>
    </div>
  );
}

function SectionCard({ title, eyebrow, actionHref, actionLabel, children, className = '' }) {
  return (
    <section className={`admin-kpi-panel ${className}`.trim()}>
      <div className="admin-kpi-panel-head">
        <div>
          {eyebrow ? <div className="admin-kpi-eyebrow">{eyebrow}</div> : null}
          <h3>{title}</h3>
        </div>
        {actionHref ? (
          <Link className="admin-kpi-action" href={actionHref}>
            {actionLabel || 'View'}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export default function AdminKPIDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState({
    totalUsers: 0,
    freeUsers: 0,
    premiumUsers: 0,
    trialUsers: 0,
    cancelledActiveUsers: 0,
    legacyGraceUsers: 0,
    blockedUsers: 0,
    suspendedUsers: 0,
    totalRecipes: 0,
    totalBlogPosts: 0,
  });
  const [sales, setSales] = useState({
    available: false,
    currency: 'USD',
    metrics: {},
    message: '',
  });
  const [imageUsage, setImageUsage] = useState({
    currency: 'USD',
    today: { count: 0, cost_usd: 0 },
    week: { count: 0, cost_usd: 0 },
    month: { count: 0, cost_usd: 0 },
  });
  const [providerCredits, setProviderCredits] = useState({
    generated_at: null,
    providers: [],
  });
  const [queueMetrics, setQueueMetrics] = useState({
    backend: 'db',
    db: { counts: {} },
    redis: {
      available: false,
      streams: {
        text: { name: 'ai:jobs:text', length: null, group: null },
        vision: { name: 'ai:jobs:vision', length: null, group: null },
      },
    },
  });
  const [recentUsers, setRecentUsers] = useState([]);
  const [userGrowth, setUserGrowth] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [actionSummary, setActionSummary] = useState({
    pendingRequests: 0,
    pendingComments: 0,
    unreadNotifications: 0,
    failedJobs: 0,
  });
  const [systemHealth, setSystemHealth] = useState({
    status: 'unknown',
    services: {},
  });
  const [growthRange, setGrowthRange] = useState('week');
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const token = typeof window !== 'undefined' ? localStorage.getItem('adminToken') : null;

  const fetchCount = useCallback(
    async (tier, status) => {
      const params = new URLSearchParams();
      params.set('page', '1');
      params.set('page_size', String(PAGE_SIZE));
      if (tier) params.set('tier', tier);
      if (status) params.set('status_filter', status);
      const response = await fetch(`${API_URL}/api/admin/users?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return null;
      }
      const data = await response.json();
      return Number.isFinite(data.total) ? data.total : 0;
    },
    [router, token]
  );

  const fetchBlogPostCount = useCallback(async () => {
    const params = new URLSearchParams();
    params.set('page', '1');
    params.set('page_size', String(PAGE_SIZE));

    const response = await fetch(`${API_URL}/api/admin/blog/posts?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 401) {
      localStorage.removeItem('adminToken');
      router.push('/admin');
      return null;
    }
    const data = await response.json().catch(() => ({}));
    return Number.isFinite(data?.total) ? data.total : 0;
  }, [router, token]);

  const fetchSales = useCallback(async () => {
    const response = await fetch(`${API_URL}/api/admin/revenuecat/overview`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 401) {
      localStorage.removeItem('adminToken');
      router.push('/admin');
      return null;
    }
    const data = await response.json().catch(() => ({}));
    return data && typeof data === 'object'
      ? {
          available: Boolean(data.available),
          currency: data.currency || 'USD',
          metrics: data.metrics && typeof data.metrics === 'object' ? data.metrics : {},
          message: data.message || '',
        }
      : { available: false, currency: 'USD', metrics: {}, message: '' };
  }, [router, token]);

  const fetchImageUsage = useCallback(async () => {
    const response = await fetch(`${API_URL}/api/admin/ai/recipe-image-usage`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 401) {
      localStorage.removeItem('adminToken');
      router.push('/admin');
      return null;
    }
    const data = await response.json().catch(() => ({}));
    return data && typeof data === 'object'
      ? {
          currency: data.currency || 'USD',
          today: data.today || { count: 0, cost_usd: 0 },
          week: data.week || { count: 0, cost_usd: 0 },
          month: data.month || { count: 0, cost_usd: 0 },
        }
      : {
          currency: 'USD',
          today: { count: 0, cost_usd: 0 },
          week: { count: 0, cost_usd: 0 },
          month: { count: 0, cost_usd: 0 },
        };
  }, [router, token]);

  const fetchQueueMetrics = useCallback(async () => {
    const response = await fetch(`${API_URL}/api/admin/ai/queue-metrics`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 401) {
      localStorage.removeItem('adminToken');
      router.push('/admin');
      return null;
    }
    const data = await response.json().catch(() => ({}));
    if (!data || typeof data !== 'object') {
      return {
        backend: 'db',
        db: { counts: {} },
        redis: {
          available: false,
          streams: {
            text: { name: 'ai:jobs:text', length: null, group: null },
            vision: { name: 'ai:jobs:vision', length: null, group: null },
          },
        },
      };
    }

    const textStream = data.redis?.streams?.text && typeof data.redis.streams.text === 'object' ? data.redis.streams.text : {};
    const visionStream = data.redis?.streams?.vision && typeof data.redis.streams.vision === 'object' ? data.redis.streams.vision : {};

    return {
      backend: typeof data.backend === 'string' ? data.backend : 'db',
      db: data.db && typeof data.db === 'object' ? data.db : { counts: {} },
      redis: {
        available: Boolean(data.redis?.available),
        streams: {
          text: {
            name: typeof textStream.name === 'string' ? textStream.name : 'ai:jobs:text',
            length: Number.isFinite(Number(textStream.length)) ? Number(textStream.length) : null,
            group: textStream.group && typeof textStream.group === 'object' ? textStream.group : null,
          },
          vision: {
            name: typeof visionStream.name === 'string' ? visionStream.name : 'ai:jobs:vision',
            length: Number.isFinite(Number(visionStream.length)) ? Number(visionStream.length) : null,
            group: visionStream.group && typeof visionStream.group === 'object' ? visionStream.group : null,
          },
        },
      },
    };
  }, [router, token]);

  const fetchProviderCredits = useCallback(async () => {
    const response = await fetch(`${API_URL}/api/admin/ai/provider-credits`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 401) {
      localStorage.removeItem('adminToken');
      router.push('/admin');
      return null;
    }
    const data = await response.json().catch(() => ({}));
    return data && typeof data === 'object'
      ? {
          generated_at: data.generated_at || null,
          cached_for_seconds: Number(data.cached_for_seconds || 0) || 0,
          providers: Array.isArray(data.providers) ? data.providers : [],
        }
      : { generated_at: null, providers: [] };
  }, [router, token]);

  const safeDashboardFetch = useCallback(
    async (path, fallback) => {
      try {
        const response = await fetch(`${API_URL}${path}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.status === 401) {
          localStorage.removeItem('adminToken');
          router.push('/admin');
          return fallback;
        }
        if (!response.ok) return fallback;
        return await response.json().catch(() => fallback);
      } catch {
        return fallback;
      }
    },
    [router, token]
  );

  const loadStats = useCallback(async () => {
    if (!token) {
      router.push('/admin');
      return;
    }
    try {
      const [
        totalUsers,
        accessSummaryData,
        totalRecipes,
        totalBlogPosts,
        salesData,
        imageUsageData,
        queueMetricsData,
        providerCreditsData,
        recentUsersData,
        userGrowthData,
        userActivityData,
        pendingRequestsData,
        pendingCommentsData,
        unreadNotificationsData,
        healthData,
      ] = await Promise.all([
        fetchCount(),
        safeDashboardFetch('/api/admin/users/access-summary', { total: 0 }),
        fetch(`${API_URL}/api/admin/recipes?page=1&page_size=${PAGE_SIZE}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((res) => {
            if (res.status === 401) {
              localStorage.removeItem('adminToken');
              router.push('/admin');
              return null;
            }
            return res.json();
          })
          .then((data) => (Number.isFinite(data?.total) ? data.total : 0))
          .catch(() => 0),
        fetchBlogPostCount(),
        fetchSales(),
        fetchImageUsage(),
        fetchQueueMetrics(),
        fetchProviderCredits(),
        safeDashboardFetch('/api/admin/users?page=1&page_size=100&sort=created_at&order=desc', { items: [] }),
        safeDashboardFetch('/api/admin/users/growth', null),
        safeDashboardFetch('/api/admin/user-activity/recent?limit=8', { items: [] }),
        safeDashboardFetch('/api/admin/requests/pending-count', { count: 0 }),
        safeDashboardFetch('/api/admin/blog/comments?page=1&page_size=1&status_filter=pending', { total: 0 }),
        safeDashboardFetch('/api/admin/staff-notifications?unread_only=1&limit=200', { items: [] }),
        safeDashboardFetch('/api/admin/health', { status: 'unknown', services: {} }),
      ]);

      if (
        totalUsers === null ||
        totalBlogPosts === null ||
        salesData === null ||
        imageUsageData === null ||
        queueMetricsData === null ||
        providerCreditsData === null
      ) {
        return;
      }

      const accessSummary = accessSummaryData && typeof accessSummaryData === 'object' ? accessSummaryData : {};
      const premiumUsers = Number(accessSummary.premium || 0) || 0;
      const trialUsers = Number(accessSummary.trialing || accessSummary.trial || 0) || 0;
      const cancelledActiveUsers = Number(accessSummary.cancelled_active || 0) || 0;
      const legacyGraceUsers = Number(accessSummary.legacy_grace || accessSummary.grace || 0) || 0;
      const blockedUsers = Number(accessSummary.blocked || 0) || 0;
      const suspendedUsers = Number(accessSummary.suspended || 0) || 0;
      const countedUsers = premiumUsers + trialUsers + cancelledActiveUsers + legacyGraceUsers + blockedUsers + suspendedUsers;
      const freeUsers = Math.max(0, Number(totalUsers || 0) - countedUsers);

      setStats({
        totalUsers,
        freeUsers,
        premiumUsers,
        trialUsers,
        cancelledActiveUsers,
        legacyGraceUsers,
        blockedUsers,
        suspendedUsers,
        totalRecipes: totalRecipes || 0,
        totalBlogPosts,
      });
      setSales(salesData);
      setImageUsage(imageUsageData);
      setQueueMetrics(queueMetricsData);
      setProviderCredits(providerCreditsData);
      setRecentUsers(Array.isArray(recentUsersData?.items) ? recentUsersData.items : []);
      setUserGrowth(userGrowthData && typeof userGrowthData === 'object' ? userGrowthData : null);
      setRecentActivity(Array.isArray(userActivityData?.items) ? userActivityData.items : []);
      setActionSummary({
        pendingRequests: Number(pendingRequestsData?.count || 0) || 0,
        pendingComments: Number(pendingCommentsData?.total || 0) || 0,
        unreadNotifications: Array.isArray(unreadNotificationsData?.items) ? unreadNotificationsData.items.length : 0,
        failedJobs: Number(healthData?.services?.queue?.failed_operational || 0) || 0,
      });
      setSystemHealth(healthData && typeof healthData === 'object' ? healthData : { status: 'unknown', services: {} });
      setLastUpdatedAt(new Date().toISOString());
    } catch (error) {
      setStats({
        totalUsers: 0,
        freeUsers: 0,
        premiumUsers: 0,
        trialUsers: 0,
        cancelledActiveUsers: 0,
        legacyGraceUsers: 0,
        blockedUsers: 0,
        suspendedUsers: 0,
        totalRecipes: 0,
        totalBlogPosts: 0,
      });
      setSales({ available: false, currency: 'USD', metrics: {}, message: '' });
      setImageUsage({
        currency: 'USD',
        today: { count: 0, cost_usd: 0 },
        week: { count: 0, cost_usd: 0 },
        month: { count: 0, cost_usd: 0 },
      });
      setProviderCredits({ generated_at: null, providers: [] });
      setQueueMetrics({
        backend: 'db',
        db: { counts: {} },
        redis: {
          available: false,
          streams: {
            text: { name: 'ai:jobs:text', length: null, group: null },
            vision: { name: 'ai:jobs:vision', length: null, group: null },
          },
        },
      });
      setRecentUsers([]);
      setUserGrowth(null);
      setRecentActivity([]);
      setActionSummary({ pendingRequests: 0, pendingComments: 0, unreadNotifications: 0, failedJobs: 0 });
      setSystemHealth({ status: 'unknown', services: {} });
    }
  }, [fetchBlogPostCount, fetchCount, fetchProviderCredits, fetchQueueMetrics, fetchSales, fetchImageUsage, router, safeDashboardFetch, token]);

  const formatMoney = useCallback((value, currency) => {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) return '--';
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency || 'USD',
        currencyDisplay: 'narrowSymbol',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(numeric);
    } catch (error) {
      return `${numeric}`;
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    const timer = setInterval(() => {
      loadStats();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadStats]);

  const premiumRate = stats.totalUsers ? (stats.premiumUsers / stats.totalUsers) * 100 : 0;
  const trialRate = stats.totalUsers ? (stats.trialUsers / stats.totalUsers) * 100 : 0;
  const cancelledActiveRate = stats.totalUsers ? (stats.cancelledActiveUsers / stats.totalUsers) * 100 : 0;
  const legacyGraceRate = stats.totalUsers ? (stats.legacyGraceUsers / stats.totalUsers) * 100 : 0;
  const freeRate = stats.totalUsers ? (stats.freeUsers / stats.totalUsers) * 100 : 0;
  const activeAccessUsers = stats.premiumUsers + stats.trialUsers + stats.cancelledActiveUsers + stats.legacyGraceUsers;
  const activeAccessRate = stats.totalUsers ? (activeAccessUsers / stats.totalUsers) * 100 : 0;
  const premiumEnd = clampPercent(premiumRate);
  const trialEnd = clampPercent(premiumRate + trialRate);
  const cancelledActiveEnd = clampPercent(premiumRate + trialRate + cancelledActiveRate);
  const legacyGraceEnd = clampPercent(premiumRate + trialRate + cancelledActiveRate + legacyGraceRate);
  const contentTotal = stats.totalRecipes + stats.totalBlogPosts;
  const recipeRate = contentTotal ? (stats.totalRecipes / contentTotal) * 100 : 0;
  const textQueueLength = queueMetrics.redis?.streams?.text?.length ?? 0;
  const visionQueueLength = queueMetrics.redis?.streams?.vision?.length ?? 0;
  const queueTotal = Number(textQueueLength || 0) + Number(visionQueueLength || 0);
  const liveStatus = queueMetrics.backend === 'redis' ? (queueMetrics.redis?.available ? 'Live' : 'Degraded') : 'DB queue';
  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdatedAt) return '';
    try {
      return new Date(lastUpdatedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }, [lastUpdatedAt]);

  const imagePeak = Math.max(
    1,
    Number(imageUsage.today?.count || 0),
    Number(imageUsage.week?.count || 0),
    Number(imageUsage.month?.count || 0)
  );
  const providerCreditRows = Array.isArray(providerCredits.providers) ? providerCredits.providers : [];
  const providerCreditRefreshLabel = useMemo(() => {
    if (!providerCredits.generated_at) return '';
    try {
      return `Updated ${new Date(providerCredits.generated_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return '';
    }
  }, [providerCredits.generated_at]);
  const queuePeak = Math.max(1, Number(textQueueLength || 0), Number(visionQueueLength || 0));
  const actionItems = [
    {
      label: 'Pending requests',
      value: actionSummary.pendingRequests,
      href: '/admin/requests/manage',
      tone: actionSummary.pendingRequests > 0 ? 'warning' : 'good',
    },
    {
      label: 'Comments to review',
      value: actionSummary.pendingComments,
      href: '/admin/blog/comments',
      tone: actionSummary.pendingComments > 0 ? 'warning' : 'good',
    },
    {
      label: 'Unread notifications',
      value: actionSummary.unreadNotifications,
      href: '/admin/inbox',
      tone: actionSummary.unreadNotifications > 0 ? 'info' : 'good',
    },
    {
      label: 'Operational AI failures',
      value: actionSummary.failedJobs,
      href: '/admin/system-health',
      tone: actionSummary.failedJobs > 0 ? 'danger' : 'good',
    },
  ];
  const serviceRows = ['application', 'database', 'cache', 'queue', 'mail', 'storage', 'disk', 'cpu'].map((key) => ({
    key,
    label: key.charAt(0).toUpperCase() + key.slice(1),
    status: systemHealth.services?.[key]?.status || 'unknown',
    detail: systemHealth.services?.[key]?.detail || '',
  }));
  const signupSeries = useMemo(() => {
    const items = userGrowth?.[growthRange]?.items;
    if (!Array.isArray(items)) return [];
    return items.map((item) => ({
      key: String(item?.key || ''),
      label: String(item?.label || item?.key || ''),
      count: Number(item?.count || 0) || 0,
    }));
  }, [growthRange, userGrowth]);
  const signupScopeLabel = userGrowth?.[growthRange]?.label || '';
  const signupPeak = Math.max(1, ...signupSeries.map((d) => d.count));
  const signupTotal = signupSeries.reduce((sum, d) => sum + Number(d.count || 0), 0);
  const signupAverage = signupSeries.length ? signupTotal / signupSeries.length : 0;
  const signupChartPoints = signupSeries.map((day, index) => {
    const x = signupSeries.length <= 1 ? 0 : (index / (signupSeries.length - 1)) * 100;
    const y = 88 - (Number(day.count || 0) / signupPeak) * 72;
    return { ...day, x, y };
  });
  const signupLinePoints = signupChartPoints.map((p) => `${p.x},${p.y}`).join(' ');
  const signupAreaPoints = signupChartPoints.length
    ? `0,92 ${signupChartPoints.map((p) => `${p.x},${p.y}`).join(' ')} 100,92`
    : '';

  return (
    <div className="admin-kpi-dashboard">
      <section className="admin-kpi-hero">
        <div>
          <div className="admin-kpi-eyebrow">Executive overview</div>
          <h2 className="admin-kpi-title">Admin Dashboard</h2>
          <p className="admin-kpi-subtitle">
            Live operating snapshot across users, content, revenue, AI usage, and queue health.
          </p>
        </div>
        <div className="admin-kpi-hero-side">
          <span className={`admin-kpi-status ${liveStatus === 'Degraded' ? 'danger' : ''}`}>
            <span aria-hidden="true" />
            {liveStatus}
          </span>
          <div className="admin-kpi-updated" suppressHydrationWarning>
            {lastUpdatedLabel ? `Updated ${lastUpdatedLabel}` : 'Auto-refreshing'}
          </div>
        </div>
      </section>

      <div className="admin-kpi-tiles">
        <KpiTile
          label="Total users"
          value={formatNumber(stats.totalUsers)}
          detail={`${formatNumber(activeAccessUsers)} currently have access`}
          href="/admin/users"
          actionLabel="Users"
        />
        <KpiTile
          label="Premium users"
          value={formatNumber(stats.premiumUsers)}
          detail={`${Math.round(clampPercent(premiumRate))}% of total users`}
          tone="blue"
          href="/admin/users"
          actionLabel="Review"
        />
        <KpiTile
          label="Store trials"
          value={formatNumber(stats.trialUsers)}
          detail={`${Math.round(clampPercent(trialRate))}% of total users`}
          tone="orange"
          href="/admin/users?tier=trialing"
          actionLabel="Trials"
        />
        <KpiTile
          label="Revenue window"
          value={sales.available ? formatMoney(sales.metrics?.revenue, sales.currency) : '--'}
          detail={sales.available ? 'RevenueCat overview period' : sales.message || 'RevenueCat not configured'}
          tone="gold"
        />
        <KpiTile
          label="AI queue"
          value={formatNumber(queueTotal)}
          detail={`${formatNumber(textQueueLength)} text / ${formatNumber(visionQueueLength)} vision`}
          tone={queueTotal > 0 ? 'orange' : 'green'}
          href="/admin/system-health"
          actionLabel="Health"
        />
      </div>

      <div className="admin-kpi-layout">
        <SectionCard title="User mix" eyebrow="Audience" actionHref="/admin/users" actionLabel="Manage">
          <div className="admin-kpi-user-mix">
            <div
              className="admin-kpi-donut"
              style={{
                '--premium-end': `${premiumEnd}%`,
                '--trial-end': `${trialEnd}%`,
                '--cancelled-end': `${cancelledActiveEnd}%`,
                '--grace-end': `${legacyGraceEnd}%`,
              }}
              aria-label={`Active access users ${Math.round(clampPercent(activeAccessRate))} percent`}
            >
              <div>
                <strong>{Math.round(clampPercent(activeAccessRate))}%</strong>
                <span>Active access</span>
              </div>
            </div>
            <div className="admin-kpi-stack">
              <ProgressBar label="Premium active" value={premiumRate} meta={formatNumber(stats.premiumUsers)} tone="blue" />
              <ProgressBar label="Store trials" value={trialRate} meta={formatNumber(stats.trialUsers)} tone="orange" />
              <ProgressBar label="Cancelled, still active" value={cancelledActiveRate} meta={formatNumber(stats.cancelledActiveUsers)} tone="gold" />
              <ProgressBar label="Grace access" value={legacyGraceRate} meta={formatNumber(stats.legacyGraceUsers)} tone="green" />
              <ProgressBar label="Expired / no active access" value={freeRate} meta={formatNumber(stats.freeUsers)} />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Content library" eyebrow="Product surface" actionHref="/admin/recipes" actionLabel="Recipes">
          <div className="admin-kpi-content-grid">
            <div className="admin-kpi-content-card">
              <span>Recipes</span>
              <strong>{formatNumber(stats.totalRecipes)}</strong>
              <Link href="/admin/recipes">Manage recipes</Link>
            </div>
            <div className="admin-kpi-content-card">
              <span>Blog posts</span>
              <strong>{formatNumber(stats.totalBlogPosts)}</strong>
              <Link href="/admin/blog">Manage blog</Link>
            </div>
          </div>
          <ProgressBar label="Recipe share of content" value={recipeRate} meta={`${Math.round(clampPercent(recipeRate))}%`} tone="green" />
        </SectionCard>

        <SectionCard title="Revenue" eyebrow="RevenueCat" className="admin-kpi-wide">
          <div className="admin-kpi-revenue-grid">
            <div>
              <span>Overview revenue</span>
              <strong suppressHydrationWarning>{sales.available ? formatMoney(sales.metrics?.revenue, sales.currency) : '--'}</strong>
            </div>
            <div>
              <span>Total sales</span>
              <strong suppressHydrationWarning>{sales.available ? formatMoney(sales.metrics?.revenue_total, sales.currency) : '--'}</strong>
            </div>
          </div>
          <div className="admin-kpi-note">
            {sales.available
              ? 'RevenueCat overview revenue is typically a recent rolling period. Export data for exact all-time reporting.'
              : sales.message || 'RevenueCat metrics are not configured yet.'}
          </div>
        </SectionCard>

        <SectionCard title="Recipe image usage" eyebrow="AI spend" actionHref="/admin/recipes" actionLabel="Recipes">
          <div className="admin-kpi-bars" aria-label="AI recipe image usage">
            {[
              ['Today', imageUsage.today],
              ['Week', imageUsage.week],
              ['Month', imageUsage.month],
            ].map(([label, item], index) => {
              const count = Number(item?.count || 0);
              return (
                <div key={label} className="admin-kpi-bar-item">
                  <div className="admin-kpi-bar-track">
                    <div
                      className={`admin-kpi-bar-fill tone-${index + 1}`}
                      style={{ height: `${Math.max(8, clampPercent((count / imagePeak) * 100))}%` }}
                    />
                  </div>
                  <strong>{formatNumber(count)}</strong>
                  <span>{label}</span>
                  <small suppressHydrationWarning>{formatMoney(item?.cost_usd, imageUsage.currency)}</small>
                </div>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title="AI queue health" eyebrow="Operations" actionHref="/admin/system-health" actionLabel="Open health">
          <div className="admin-kpi-queue-meta">
            <div>
              <span>Backend</span>
              <strong>{queueMetrics.backend}</strong>
            </div>
            <div>
              <span>Redis</span>
              <strong>{queueMetrics.backend === 'redis' ? (queueMetrics.redis?.available ? 'Available' : 'Unavailable') : 'Not active'}</strong>
            </div>
          </div>
          <div className="admin-kpi-queue-bars">
            <ProgressBar label="Text stream" value={(Number(textQueueLength || 0) / queuePeak) * 100} meta={formatNumber(textQueueLength)} tone="blue" />
            <ProgressBar
              label="Vision stream"
              value={(Number(visionQueueLength || 0) / queuePeak) * 100}
              meta={formatNumber(visionQueueLength)}
              tone="gold"
            />
          </div>
        </SectionCard>

        <SectionCard title="AI provider credits" eyebrow="External APIs" className="admin-kpi-wide">
          <div className="admin-kpi-provider-grid">
            {providerCreditRows.length ? (
              providerCreditRows.map((provider) => {
                const status = String(provider?.status || 'unknown').toLowerCase();
                const balance = provider?.balance && typeof provider.balance === 'object' ? provider.balance : {};
                const spend = provider?.spend && typeof provider.spend === 'object' ? provider.spend : {};
                const usage = provider?.usage && typeof provider.usage === 'object' ? provider.usage : {};
                const currency = provider?.currency || 'USD';
                const todayUsage = usage.today && typeof usage.today === 'object' ? usage.today : null;
                const isOpenAI = provider?.name === 'OpenAI';
                const isDeepSeek = provider?.name === 'DeepSeek';
                return (
                  <div key={provider?.name || status} className="admin-kpi-provider-card">
                    <div className="admin-kpi-provider-head">
                      <strong>{provider?.name || 'Provider'}</strong>
                      <span className={`admin-kpi-provider-status status-${status}`}>
                        {provider?.configured ? status.replace(/_/g, ' ') : 'not configured'}
                      </span>
                    </div>
                    <div className="admin-kpi-provider-values">
                      <div>
                        <span>{isOpenAI ? 'Today spend' : 'Balance'}</span>
                        <strong suppressHydrationWarning>
                          {isOpenAI
                            ? formatMoney(spend.today_usd, 'USD')
                            : balance.total !== undefined && balance.total !== null
                              ? formatMoney(balance.total, currency)
                              : '--'}
                        </strong>
                      </div>
                      <div>
                        <span>{isOpenAI ? 'Month spend' : isDeepSeek ? 'Monthly tokens' : 'Today usage'}</span>
                        <strong suppressHydrationWarning>
                          {isOpenAI
                            ? formatMoney(spend.month_usd, 'USD')
                            : isDeepSeek
                              ? formatNumber(usage.monthly_total_tokens || 0)
                              : todayUsage
                                ? `${formatNumber(todayUsage.credits || 0)} cr`
                                : '--'}
                        </strong>
                      </div>
                    </div>
                    {isOpenAI ? (
                      <div className="admin-kpi-provider-foot" suppressHydrationWarning>
                        Monthly tokens {formatNumber(usage.monthly_total_tokens || 0)}
                        {usage.monthly_requests ? ` / ${formatNumber(usage.monthly_requests)} requests` : ''}
                      </div>
                    ) : todayUsage ? (
                      <div className="admin-kpi-provider-foot">
                        Today usage {formatNumber(todayUsage.credits || 0)} credits / {formatNumber(todayUsage.requests || 0)} requests
                      </div>
                    ) : isDeepSeek ? (
                      <div className="admin-kpi-provider-foot">
                        Monthly requests {formatNumber(usage.monthly_requests || 0)}
                      </div>
                    ) : null}
                    {provider?.message && !isOpenAI ? <div className="admin-kpi-provider-message">{provider.message}</div> : null}
                  </div>
                );
              })
            ) : (
              <div className="admin-kpi-note">AI provider credit data has not loaded yet.</div>
            )}
          </div>
          <div className="admin-kpi-note">
            {providerCreditRefreshLabel || 'Provider balances are cached briefly to avoid calling billing APIs on every dashboard refresh.'}
          </div>
        </SectionCard>

        <SectionCard title="Action required" eyebrow="Operations queue" className="admin-kpi-wide">
          <div className="admin-kpi-action-grid">
            {actionItems.map((item) => (
              <Link key={item.label} className={`admin-kpi-action-card tone-${item.tone}`} href={item.href}>
                <span>{item.label}</span>
                <strong>{formatNumber(item.value)}</strong>
              </Link>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="User growth" eyebrow="Recent signups" actionHref="/admin/users" actionLabel="Users" className="admin-kpi-equal-panel">
          <div className="admin-kpi-chart-toolbar" role="tablist" aria-label="User growth range">
            {Object.entries(GROWTH_RANGES).map(([key, range]) => (
              <button
                key={key}
                type="button"
                className={growthRange === key ? 'active' : ''}
                onClick={() => setGrowthRange(key)}
                role="tab"
                aria-selected={growthRange === key}
              >
                {range.label}
              </button>
            ))}
          </div>
          {signupScopeLabel ? (
            <p className="admin-subtitle" style={{ margin: '8px 0 0 0' }}>
              Showing {signupScopeLabel}
              {growthRange === 'week' ? ' (Sunday to Saturday)' : ''}
            </p>
          ) : null}
          <div className="admin-kpi-growth-summary">
            <div>
              <span>Total signups</span>
              <strong>{formatNumber(signupTotal)}</strong>
            </div>
            <div>
              <span>Average</span>
              <strong>{signupAverage.toFixed(1)}</strong>
            </div>
          </div>
          <div className="admin-kpi-line-chart" aria-label={`${GROWTH_RANGES[growthRange]?.label || 'Weekly'} user growth chart`}>
            <div className="admin-kpi-chart-axis">
              <span>{formatNumber(signupPeak)}</span>
              <span>{formatNumber(Math.round(signupPeak / 2))}</span>
              <span>0</span>
            </div>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img">
              <defs>
                <linearGradient id="signupArea" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              <line x1="0" x2="100" y1="16" y2="16" />
              <line x1="0" x2="100" y1="52" y2="52" />
              <line x1="0" x2="100" y1="88" y2="88" />
              {signupAreaPoints ? <polygon points={signupAreaPoints} fill="url(#signupArea)" /> : null}
              {signupLinePoints ? <polyline points={signupLinePoints} /> : null}
              {signupChartPoints.map((point) => (
                <circle key={point.key} cx={point.x} cy={point.y} r="1.45">
                  <title>{`${point.key}: ${point.count} signups`}</title>
                </circle>
              ))}
            </svg>
          </div>
          <div className="admin-kpi-chart-labels">
            {signupChartPoints
              .filter((_, index) => {
                if (growthRange !== 'month') return true;
                return index === 0 || index === signupChartPoints.length - 1 || index % 7 === 0;
              })
              .map((day) => (
                <span key={day.key}>{day.label}</span>
              ))}
          </div>
        </SectionCard>

        <SectionCard title="System health" eyebrow="Live services" actionHref="/admin/system-health" actionLabel="Details" className="admin-kpi-equal-panel">
          <div className="admin-kpi-health-list">
            {serviceRows.map((service) => (
              <div key={service.key} className="admin-kpi-health-row">
                <span className={`admin-kpi-health-dot status-${service.status}`} aria-hidden="true" />
                <div>
                  <strong>{service.label}</strong>
                  {service.detail ? <span>{service.detail}</span> : null}
                </div>
                <em>{service.status}</em>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Recent app activity" eyebrow="Mobile users" actionHref="/admin/users/activity" actionLabel="View all" className="admin-kpi-wide">
          {recentActivity.length ? (
            <div className="admin-kpi-activity-list">
              {recentActivity.slice(0, 8).map((item) => (
                <div key={item.id} className="admin-kpi-activity-row">
                  <div className="admin-kpi-activity-mark" aria-hidden="true">
                    {String(item.user_name || item.user_email || 'U').slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <strong>{item.label || String(item.event_type || '').replace(/\./g, ' ') || 'Activity'}</strong>
                    <span>
                      {item.user_name || item.user_email || `User #${item.user_id}`} {item.source ? `via ${item.source}` : ''}
                    </span>
                  </div>
                  <time suppressHydrationWarning>{formatRelativeTime(item.created_at)}</time>
                </div>
              ))}
            </div>
          ) : (
            <div className="admin-kpi-note">Recent mobile app activity will appear here as users generate recipes, save favorites, and create plans.</div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
