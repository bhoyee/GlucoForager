'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';
const PAGE_SIZE = 1;
const REFRESH_MS = 20000;

export default function AdminDashboard() {
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
      ] = await Promise.all([
        fetchCount(),
        fetchCount('free'),
        fetchCount('premium'),
        fetchCount('premium', 'active'),
        fetchCount('premium', 'inactive'),
        fetch(`${API_URL}/api/admin/recipes`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then(async (response) => {
            if (response.status === 401) {
              localStorage.removeItem('adminToken');
              router.push('/admin');
              return null;
            }
            const data = await response.json();
            return Array.isArray(data.items) ? data.items.length : 0;
          })
          .catch(() => 0),
        fetchBlogPostCount().catch(() => 0),
      ]);
      if (
        totalUsers === null
        || freeUsers === null
        || premiumUsers === null
        || activePremiumUsers === null
        || expiredPremiumUsers === null
        || totalRecipes === null
        || totalBlogPosts === null
      ) {
        return;
      }
      setStats({
        totalUsers,
        freeUsers,
        premiumUsers,
        activePremiumUsers,
        expiredPremiumUsers,
        totalRecipes,
        totalBlogPosts,
      });
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
    }
  }, [fetchBlogPostCount, fetchCount, router, token]);

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
          <Link className="admin-link" href="/admin/blog">
            Manage blog
          </Link>
          <p className="admin-subtitle" style={{ marginTop: 10 }}>
            Blog posts: <strong>{stats.totalBlogPosts}</strong>
          </p>
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
      </div>
    </div>
  );
}
