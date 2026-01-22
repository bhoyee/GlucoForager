'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';
const PAGE_SIZE = 12;

export default function AdminUsersPage() {
  const router = useRouter();
  const token = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('adminToken');
  }, []);

  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [page, setPage] = useState(1);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');

  const buildQuery = () => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('page_size', String(PAGE_SIZE));
    params.set('sort', sortKey);
    params.set('order', sortOrder);
    if (search.trim()) params.set('q', search.trim());
    if (tierFilter !== 'all') params.set('tier', tierFilter);
    if (statusFilter !== 'all') params.set('status_filter', statusFilter);
    return params.toString();
  };

  const loadUsers = useCallback(async () => {
    if (!token) {
      router.push('/admin');
      return;
    }
    setIsLoading(true);
    setMessage('');
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
      setMessage('Failed to load users.');
    } finally {
      setIsLoading(false);
    }
  }, [token, page, sortKey, sortOrder, search, tierFilter, statusFilter, router]);

  useEffect(() => {
    if (!token) {
      router.push('/admin');
      return;
    }
    loadUsers();
  }, [token, loadUsers]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const timer = setInterval(() => {
      loadUsers();
    }, 20000);
    return () => clearInterval(timer);
  }, [autoRefresh, loadUsers]);

  return (
    <div className="admin-card">
      <h2 className="admin-title">Users</h2>
      <p className="admin-subtitle">Monitor subscription status and user activity.</p>

      {message && <p className="admin-subtitle">{message}</p>}

      <div className="admin-toolbar">
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <label className="admin-inline-toggle">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(event) => setAutoRefresh(event.target.checked)}
          />
          Auto-refresh
        </label>
        <select
          value={tierFilter}
          onChange={(event) => {
            setTierFilter(event.target.value);
            setPage(1);
          }}
        >
          <option value="all">All plans</option>
          <option value="free">Free</option>
          <option value="premium">Premium</option>
        </select>
        <select
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value);
            setPage(1);
          }}
        >
          <option value="all">All status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select
          value={`${sortKey}:${sortOrder}`}
          onChange={(event) => {
            const [nextKey, nextOrder] = event.target.value.split(':');
            setSortKey(nextKey);
            setSortOrder(nextOrder);
            setPage(1);
          }}
        >
          <option value="created_at:desc">Newest first</option>
          <option value="created_at:asc">Oldest first</option>
          <option value="email:asc">Email (A-Z)</option>
          <option value="tier:asc">Plan (A-Z)</option>
        </select>
      </div>

      {isLoading ? (
        <p>Loading users...</p>
      ) : (
        <>
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Subscription</th>
                <th>Status</th>
                <th>Expires</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.full_name || '—'}</td>
                  <td>{user.email}</td>
                  <td>
                    <span className={`admin-badge ${user.subscription_tier === 'premium' ? '' : 'secondary'}`}>
                      {user.subscription_tier}
                    </span>
                  </td>
                  <td>
                    <span className={`admin-badge ${user.status === 'active' ? 'success' : 'warning'}`}>
                      {user.status}
                    </span>
                  </td>
                  <td>
                    {user.expires_at
                      ? new Date(user.expires_at).toLocaleDateString()
                      : '—'}
                  </td>
                  <td>{user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="admin-pagination">
            <button type="button" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}>
              Prev
            </button>
            <span>
              Page {page} of {totalPages} ({totalItems} users)
            </span>
            <button
              type="button"
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
