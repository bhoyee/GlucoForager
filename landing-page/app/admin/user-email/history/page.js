'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';
const PAGE_SIZE = 12;

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

export default function AdminUserEmailHistoryPage() {
  const router = useRouter();
  const token = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('adminToken');
  }, []);

  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');

  const [viewId, setViewId] = useState(null);
  const [viewItem, setViewItem] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [busy, setBusy] = useState(false);

  const buildQuery = () => {
    const params = new URLSearchParams();
    params.set('kind', 'user_email');
    params.set('page', String(page));
    params.set('page_size', String(PAGE_SIZE));
    params.set('sort', sortKey);
    params.set('order', sortOrder);
    if (search.trim()) params.set('q', search.trim());
    return params.toString();
  };

  const load = useCallback(async () => {
    if (!token) {
      router.push('/admin');
      return;
    }
    setIsLoading(true);
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/admin/email-campaigns?${buildQuery()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) {
        setMessage(await parseErrorResponse(response));
        setItems([]);
        return;
      }
      const data = await response.json();
      const rows = Array.isArray(data.items) ? data.items : [];
      setItems(rows);
      setTotalItems(data.total || rows.length);
      setTotalPages(Math.max(1, Math.ceil((data.total || rows.length) / PAGE_SIZE)));
    } catch (error) {
      setMessage('Failed to load history.');
    } finally {
      setIsLoading(false);
    }
  }, [token, page, sortKey, sortOrder, search, router]);

  useEffect(() => {
    load();
  }, [load]);

  const openView = async (id) => {
    if (!token) return;
    setViewId(id);
    setViewItem(null);
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/admin/email-campaigns/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
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
      const data = await response.json();
      setViewItem(data);
    } catch {
      setMessage('Failed to load campaign.');
    }
  };

  const confirmDelete = async () => {
    if (!token || !deleteId) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/admin/email-campaigns/${deleteId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
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
      setDeleteId(null);
      await load();
    } catch {
      setMessage('Failed to delete campaign.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-card">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="admin-title">User Email History</h2>
          <p className="admin-subtitle">Previous emails sent to app users.</p>
        </div>
        <Link className="admin-link" href="/admin/user-email">
          Back to send
        </Link>
      </div>

      {message ? <div className="admin-message admin-message-error">{message}</div> : null}

      <div className="admin-toolbar">
        <input
          className="admin-search-input"
          placeholder="Search subject..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <select
          className="admin-sort-select"
          value={`${sortKey}:${sortOrder}`}
          onChange={(e) => {
            const [k, o] = e.target.value.split(':');
            setSortKey(k);
            setSortOrder(o);
            setPage(1);
          }}
        >
          <option value="created_at:desc">Newest first</option>
          <option value="created_at:asc">Oldest first</option>
          <option value="sent_count:desc">Most sent</option>
          <option value="sent_count:asc">Least sent</option>
        </select>
      </div>

      {isLoading ? (
        <p className="admin-loading">Loading history...</p>
      ) : (
        <div className="admin-table-wrap" style={{ marginTop: 14 }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Subject</th>
                <th>Mode</th>
                <th>Sent</th>
                <th>By</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="admin-empty">
                    No emails sent yet.
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr key={row.id}>
                    <td>{row.created_at ? new Date(row.created_at).toLocaleString() : '--'}</td>
                    <td>{row.subject}</td>
                    <td>{row.mode}</td>
                    <td>
                      {row.sent_count}
                      {typeof row.total_count === 'number' ? ` / ${row.total_count}` : ''}
                    </td>
                    <td>{row.created_by || '--'}</td>
                    <td>
                      <div className="admin-action-buttons">
                        <button type="button" className="admin-button secondary" onClick={() => openView(row.id)}>
                          View
                        </button>
                        <button type="button" className="admin-button danger" onClick={() => setDeleteId(row.id)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="admin-pagination" style={{ marginTop: 16 }}>
        <button
          type="button"
          className="admin-pagination-button"
          onClick={() => setPage(Math.max(1, page - 1))}
          disabled={page === 1}
        >
          Prev
        </button>
        <span className="admin-pagination-info">
          Page {page} of {totalPages} ({totalItems} emails)
        </span>
        <button
          type="button"
          className="admin-pagination-button"
          onClick={() => setPage(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
        >
          Next
        </button>
      </div>

      {viewId ? (
        <div className="admin-modal-backdrop" role="presentation" onClick={() => setViewId(null)}>
          <div className="admin-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3 className="admin-title" style={{ fontSize: 18 }}>
              {viewItem?.subject || 'Loading...'}
            </h3>
            <p className="admin-subtitle" style={{ marginTop: 6 }}>
              Mode: <strong>{viewItem?.mode || '--'}</strong> • Sent:{' '}
              <strong>
                {viewItem?.sent_count ?? '--'}
                {typeof viewItem?.total_count === 'number' ? ` / ${viewItem.total_count}` : ''}
              </strong>
            </p>
            <div
              style={{
                marginTop: 12,
                maxHeight: 420,
                overflow: 'auto',
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                padding: 14,
                background: 'white',
              }}
            >
              {viewItem ? (
                viewItem.body_html ? (
                  // eslint-disable-next-line react/no-danger
                  <div dangerouslySetInnerHTML={{ __html: viewItem.body }} />
                ) : (
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{viewItem.body}</pre>
                )
              ) : (
                <p className="admin-subtitle">Loading…</p>
              )}
            </div>
            <div className="admin-inline" style={{ justifyContent: 'flex-end', gap: 12, marginTop: 14 }}>
              <button type="button" className="admin-button secondary" onClick={() => setViewId(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteId ? (
        <div className="admin-modal-backdrop" role="presentation" onClick={() => setDeleteId(null)}>
          <div className="admin-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3 className="admin-title" style={{ fontSize: 18 }}>
              Delete email?
            </h3>
            <p className="admin-subtitle">This will remove the email from history.</p>
            <div className="admin-inline" style={{ justifyContent: 'flex-end', gap: 12 }}>
              <button type="button" className="admin-button secondary" onClick={() => setDeleteId(null)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="admin-button danger" onClick={confirmDelete} disabled={busy}>
                {busy ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

