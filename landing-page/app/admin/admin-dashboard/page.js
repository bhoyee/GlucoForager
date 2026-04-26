'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import LoadingState from '../ui/LoadingState';
import EmptyState from '../ui/EmptyState';
import { adminFetch, clearAdminTokens } from '../lib/adminAuth';
import AdminKPIDashboard from '../dashboard/AdminKPIDashboard';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

export default function AdminDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const roles = Array.isArray(session?.roles) ? session.roles : [];
  const perms = Array.isArray(session?.permissions) ? session.permissions : [];
  const isAdmin = perms.includes('*') || perms.includes('admin.manage') || roles.includes('admin');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await adminFetch(`${API_URL}/api/admin/me`);
        if (res.status === 401) {
          clearAdminTokens();
          router.push('/admin');
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (!cancelled) setSession(data);
      } catch {
        if (!cancelled) setSession(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (loading) return;
    if (!session) return;
    if (isAdmin) return;
    router.replace('/admin/dashboard');
  }, [isAdmin, loading, router, session]);

  if (loading) {
    return (
      <div className="admin-card">
        <LoadingState label="Loading dashboard…" />
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="admin-card">
        <EmptyState title="Admin only" body="This dashboard is only available to admin users.">
          <button className="admin-button secondary" type="button" onClick={() => router.push('/admin/dashboard')}>
            Go to staff dashboard
          </button>
        </EmptyState>
      </div>
    );
  }

  return <AdminKPIDashboard />;
}
