'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';
const PAGE_SIZE = 1;
const REFRESH_MS = 20000;

export default function AdminKPIDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState({
    totalUsers: 0,
    freeUsers: 0,
    premiumUsers: 0,
    activePremiumUsers: 0,
    expiredPremiumUsers: 0,
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
            length: Number.isFinite(Number(textStream.length)) ? Number(textStream.length) : null,
            group: visionStream.group && typeof visionStream.group === 'object' ? visionStream.group : null,
          },
        },
      },
    };
  }, [router, token]);

  const loadStats = useCallback(async () => {
    if (!token) {
      router.push('/admin');
      return;
    }
    try {
      const [
        totalUsers,
        freeUsers,
        premiumUsers,
        activePremiumUsers,
        expiredPremiumUsers,
        totalRecipes,
        totalBlogPosts,
        salesData,
        imageUsageData,
        queueMetricsData,
      ] = await Promise.all([
        fetchCount(),
        fetchCount('free'),
        fetchCount('premium'),
        fetchCount('premium', 'active'),
        fetchCount('premium', 'inactive'),
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
      ]);

      if (
        totalUsers === null ||
        freeUsers === null ||
        premiumUsers === null ||
        activePremiumUsers === null ||
        expiredPremiumUsers === null ||
        totalBlogPosts === null ||
        salesData === null ||
        imageUsageData === null ||
        queueMetricsData === null
      ) {
        return;
      }

      setStats({
        totalUsers,
        freeUsers,
        premiumUsers,
        activePremiumUsers,
        expiredPremiumUsers,
        totalRecipes: totalRecipes || 0,
        totalBlogPosts,
      });
      setSales(salesData);
      setImageUsage(imageUsageData);
      setQueueMetrics(queueMetricsData);
    } catch (error) {
      setStats({
        totalUsers: 0,
        freeUsers: 0,
        premiumUsers: 0,
        activePremiumUsers: 0,
        expiredPremiumUsers: 0,
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
    }
  }, [fetchBlogPostCount, fetchCount, fetchQueueMetrics, fetchSales, fetchImageUsage, router, token]);

  const formatMoney = useCallback((value, currency) => {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) return 'â€”';
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

  return (
    <div className="admin-card">
      <h2 className="admin-title">Dashboard</h2>
      <p className="admin-subtitle">Quick overview of your user base.</p>

      <div className="admin-grid">
        <div className="admin-card">
          <h3>Total recipes</h3>
          <p style={{ fontSize: '32px', fontWeight: 700 }}>{stats.totalRecipes}</p>
          <Link className="admin-link" href="/admin/recipes">
            Manage recipes
          </Link>
          <p className="admin-subtitle" style={{ marginTop: 10 }}>
            Blog posts: <strong>{stats.totalBlogPosts}</strong>
          </p>
          <Link className="admin-link" href="/admin/blog">
            Manage blog
          </Link>
        </div>
        <div className="admin-card">
          <h3>Total users</h3>
          <p style={{ fontSize: '32px', fontWeight: 700 }}>{stats.totalUsers}</p>
          <div className="admin-inline admin-subcards">
            <div className="admin-subcard">
              <span>Free users</span>
              <strong>{stats.freeUsers}</strong>
            </div>
            <div className="admin-subcard">
              <span>Premium users</span>
              <strong>{stats.premiumUsers}</strong>
            </div>
            <div className="admin-subcard">
              <span>Active premium</span>
              <strong>{stats.activePremiumUsers}</strong>
            </div>
            <div className="admin-subcard">
              <span>Expired premium</span>
              <strong>{stats.expiredPremiumUsers}</strong>
            </div>
          </div>
          <Link className="admin-link" href="/admin/users">
            Manage users
          </Link>
        </div>
        <div className="admin-card">
          <h3>Sales</h3>
          <p className="admin-subtitle">Live RevenueCat overview metrics.</p>
          <div className="admin-inline admin-subcards" style={{ marginTop: 0 }}>
            <div className="admin-subcard">
              <span>This month</span>
              <strong suppressHydrationWarning>
                {sales.available ? formatMoney(sales.metrics?.revenue, sales.currency) : 'â€”'}
              </strong>
            </div>
            <div className="admin-subcard">
              <span>Total sales</span>
              <strong suppressHydrationWarning>
                {sales.available ? formatMoney(sales.metrics?.revenue_total, sales.currency) : 'â€”'}
              </strong>
            </div>
          </div>
          {!sales.available && (
            <p className="admin-help" style={{ marginTop: 10 }}>
              {sales.message || 'RevenueCat metrics not configured.'}
            </p>
          )}
          {sales.available && (
            <p className="admin-help" style={{ marginTop: 10 }}>
              Note: RevenueCat â€œoverviewâ€ revenue is typically the last 28 days (not calendar-month). All-time totals
              may require data export.
            </p>
          )}
        </div>
        <div className="admin-card">
          <h3>Recipe images</h3>
          <p className="admin-subtitle">AI recipe image generations (estimated spend).</p>
          <div className="admin-inline admin-subcards" style={{ marginTop: 0 }}>
            <div className="admin-subcard">
              <span>Today</span>
              <strong>
                {imageUsage.today?.count} /{' '}
                <span suppressHydrationWarning>{formatMoney(imageUsage.today?.cost_usd, imageUsage.currency)}</span>
              </strong>
            </div>
            <div className="admin-subcard">
              <span>This week</span>
              <strong>
                {imageUsage.week?.count} /{' '}
                <span suppressHydrationWarning>{formatMoney(imageUsage.week?.cost_usd, imageUsage.currency)}</span>
              </strong>
            </div>
            <div className="admin-subcard">
              <span>This month</span>
              <strong>
                {imageUsage.month?.count} /{' '}
                <span suppressHydrationWarning>{formatMoney(imageUsage.month?.cost_usd, imageUsage.currency)}</span>
              </strong>
            </div>
          </div>
          <Link className="admin-link" href="/admin/recipes">
            Manage recipes
          </Link>
        </div>
        <div className="admin-card">
          <h3>AI queue</h3>
          <p className="admin-subtitle">Queue backend status and stream size.</p>

          <p className="admin-help">
            Backend: <strong>{queueMetrics.backend}</strong>
          </p>
          {queueMetrics.backend === 'redis' && (
            <p className="admin-help">
              Redis: <strong>{queueMetrics.redis?.available ? 'available' : 'unavailable'}</strong>
            </p>
          )}
          <div className="admin-inline admin-subcards" style={{ marginTop: 10 }}>
            <div className="admin-subcard">
              <span>Text stream</span>
              <strong>{queueMetrics.redis?.streams?.text?.length ?? 'â€”'}</strong>
            </div>
            <div className="admin-subcard">
              <span>Vision stream</span>
              <strong>{queueMetrics.redis?.streams?.vision?.length ?? 'â€”'}</strong>
            </div>
          </div>
          <Link className="admin-link" href="/admin/system-health">
            View system health
          </Link>
        </div>
      </div>
    </div>
  );
}

