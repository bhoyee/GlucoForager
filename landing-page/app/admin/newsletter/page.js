'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';
const PAGE_SIZE = 50;

const parseErrorResponse = async (response) => {
  try {
    const data = await response.json();
    const detail = data?.detail;
    if (typeof detail === 'string') return detail;
    return data?.message || 'Request failed.';
  } catch {
    return 'Request failed.';
  }
};

export default function AdminNewsletterPage() {
  const router = useRouter();
  const token = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('adminToken');
  }, []);

  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');

  const load = async (nextPage = page, nextQ = q, nextStatus = statusFilter) => {
    if (!token) return;
    setIsLoading(true);
    setMessage('');
    try {
      const params = new URLSearchParams();
      params.set('page', String(Math.max(1, nextPage)));
      params.set('page_size', String(PAGE_SIZE));
      if (nextQ.trim()) params.set('q', nextQ.trim());
      if (nextStatus !== 'all') params.set('status_filter', nextStatus);
      const response = await fetch(`${API_URL}/api/admin/newsletter/subscribers?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await response.json();
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setMessage('Failed to load subscribers.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!token) {
      router.push('/admin');
      return;
    }
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const updateStatus = async (subscriberId, nextStatus) => {
    if (!token) return;
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/admin/newsletter/subscribers/${subscriberId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) {
        setMessage(await parseErrorResponse(response));
        return;
      }
      await load(1);
    } catch {
      setMessage('Failed to update subscriber.');
    }
  };

  const deleteSubscriber = async (subscriberId) => {
    if (!token) return;
    if (!confirm('Delete this subscriber?')) return;
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/admin/newsletter/subscribers/${subscriberId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      await load(1);
    } catch {
      setMessage('Failed to delete subscriber.');
    }
  };

  const goToPage = (nextPage) => {
    const safe = Math.max(1, nextPage);
    setPage(safe);
    load(safe);
  };

  return (
    <div className="admin-card">
      <div className="admin-recipes-header">
        <h2 className="admin-title">Newsletter</h2>
        <p className="admin-subtitle">Manage newsletter subscribers and send updates.</p>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="text"
            placeholder="Search email or source..."
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setPage(1);
            }}
            className="admin-search-input"
            style={{ maxWidth: 320 }}
          />
          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setPage(1);
            }}
            className="admin-filter-select"
          >
            <option value="all">All</option>
            <option value="subscribed">Subscribed</option>
            <option value="unsubscribed">Unsubscribed</option>
          </select>
          <button type="button" className="admin-button secondary" onClick={() => load(1)} disabled={isLoading}>
            Refresh
          </button>
        </div>
        <Link className="admin-button" href="/admin/newsletter/send">
          Send message
        </Link>
      </div>

      {message ? <div className="admin-message">{message}</div> : null}

      {isLoading ? (
        <div className="admin-loading-state">
          <p>Loading subscribers...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="admin-empty-state">
          <div className="admin-empty-icon">✉️</div>
          <p>No subscribers found</p>
          <p className="admin-empty-subtext">New signups will appear here.</p>
        </div>
      ) : (
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Status</th>
                <th>Source</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className="admin-table-primary">{row.email}</div>
                  </td>
                  <td>
                    <span className="admin-recipe-badge">{row.status}</span>
                  </td>
                  <td className="admin-table-muted">{row.source || '—'}</td>
                  <td className="admin-table-muted">
                    {row.created_at ? new Date(row.created_at).toLocaleString() : '—'}
                  </td>
                  <td>
                    <div className="admin-table-actions">
                      {row.status === 'subscribed' ? (
                        <button
                          type="button"
                          className="admin-link"
                          onClick={() => updateStatus(row.id, 'unsubscribed')}
                        >
                          Unsubscribe
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="admin-link"
                          onClick={() => updateStatus(row.id, 'subscribed')}
                        >
                          Resubscribe
                        </button>
                      )}
                      <button type="button" className="admin-link" onClick={() => deleteSubscriber(row.id)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 pt-6">
        <button
          type="button"
          className="admin-button secondary"
          onClick={() => goToPage(page - 1)}
          disabled={page <= 1 || isLoading}
        >
          Prev
        </button>
        <p className="admin-subtitle" style={{ margin: 0 }}>
          Page {page}
        </p>
        <button
          type="button"
          className="admin-button secondary"
          onClick={() => goToPage(page + 1)}
          disabled={isLoading || items.length < PAGE_SIZE}
        >
          Next
        </button>
      </div>
    </div>
  );
}

