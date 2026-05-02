'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';
const PAGE_SIZE = 25;

function formatDateTime(value) {
  if (!value) return '-';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return '-';
  }
}

function initials(item) {
  const source = item?.user_name || item?.user_email || 'U';
  return String(source).slice(0, 1).toUpperCase();
}

export default function AdminUserActivityPage() {
  const router = useRouter();
  const token = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('adminToken');
  }, []);

  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [eventType, setEventType] = useState('');
  const [source, setSource] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('page_size', String(PAGE_SIZE));
    if (q.trim()) params.set('q', q.trim());
    if (eventType.trim()) params.set('event_type', eventType.trim());
    if (source.trim()) params.set('source', source.trim());
    return params.toString();
  }, [eventType, page, q, source]);

  const loadActivity = useCallback(async () => {
    if (!token) {
      router.push('/admin');
      return;
    }
    setIsLoading(true);
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/admin/user-activity?${buildQuery()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) throw new Error('Request failed');
      const data = await response.json();
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total || 0));
    } catch {
      setMessage('Failed to load user activity.');
    } finally {
      setIsLoading(false);
    }
  }, [buildQuery, router, token]);

  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  const applyFilters = (event) => {
    event.preventDefault();
    setPage(1);
    setTimeout(loadActivity, 0);
  };

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <p className="admin-eyebrow">Mobile users</p>
          <h1>User activity</h1>
          <p className="admin-page-subtitle">Paginated app activity history. Dashboard cards only show the latest deduped snapshot.</p>
        </div>
      </div>

      <form className="admin-activity-filters" onSubmit={applyFilters}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search user, label, or event" />
        <select value={eventType} onChange={(e) => setEventType(e.target.value)}>
          <option value="">All events</option>
          <option value="auth.login">Login</option>
          <option value="auth.logout">Logout</option>
          <option value="recipe_generation.started">Recipe generation</option>
          <option value="ai.request">AI request</option>
          <option value="daily_plan.created">Daily plan created</option>
          <option value="daily_plan.updated">Daily plan updated</option>
          <option value="favorite.saved">Favorite saved</option>
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">All sources</option>
          <option value="mobile">Mobile</option>
          <option value="app">App</option>
        </select>
        <button type="submit">Apply</button>
      </form>

      {message ? <div className="admin-message error">{message}</div> : null}

      <section className="admin-card admin-activity-card">
        <div className="admin-card-header">
          <div>
            <h2 className="admin-title--sm">Activity history</h2>
            <p className="admin-subtitle--sm">{total} total events. Events older than 2 months are cleaned automatically.</p>
          </div>
        </div>

        {isLoading ? (
          <div className="admin-empty-state">Loading activity...</div>
        ) : items.length ? (
          <div className="admin-activity-table">
            {items.map((item) => (
              <div key={item.id} className="admin-activity-table-row">
                <div className="admin-activity-avatar">{initials(item)}</div>
                <div>
                  <strong>{item.label || item.event_type || 'Activity'}</strong>
                  <span>{item.user_name || item.user_email || `User #${item.user_id}`}</span>
                </div>
                <div className="admin-activity-meta">{item.event_type}</div>
                <div className="admin-activity-meta">{item.source || '-'}</div>
                <time>{formatDateTime(item.created_at)}</time>
              </div>
            ))}
          </div>
        ) : (
          <div className="admin-empty-state">No activity found.</div>
        )}

        <div className="admin-pagination">
          <button type="button" disabled={page <= 1 || isLoading} onClick={() => setPage((value) => Math.max(1, value - 1))}>
            Previous
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button type="button" disabled={page >= totalPages || isLoading} onClick={() => setPage((value) => value + 1)}>
            Next
          </button>
        </div>
      </section>
    </div>
  );
}
