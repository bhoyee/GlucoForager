'use client';
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';
const PAGE_SIZE = 30;

export default function CommentsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const postIdParam = searchParams?.get('post_id');
  const postId = postIdParam ? Number(postIdParam) : null;

  const token = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('adminToken');
  }, []);

  const [items, setItems] = useState([]);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [canModerate, setCanModerate] = useState(false);

  const load = async (nextPage = page, nextStatus = statusFilter) => {
    if (!token) return;
    setIsLoading(true);
    setMessage('');
    try {
      const params = new URLSearchParams();
      params.set('page', String(Math.max(1, nextPage)));
      params.set('page_size', String(PAGE_SIZE));
      if (postId) params.set('post_id', String(postId));
      if (nextStatus !== 'all') params.set('status_filter', nextStatus);
      const response = await fetch(`${API_URL}/api/admin/blog/comments?${params.toString()}`, {
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
      setMessage('Failed to load comments.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!token) {
      router.push('/admin');
      return;
    }
    const loadSession = async () => {
      try {
        const res = await fetch(`${API_URL}/api/admin/me`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.status === 401) return;
        const data = await res.json().catch(() => ({}));
        const perms = Array.isArray(data?.permissions) ? data.permissions : [];
        const can = perms.includes('*') || perms.includes('blog.write') || perms.includes('blog.publish');
        setCanModerate(!!can);
      } catch {
        setCanModerate(false);
      }
    };
    loadSession();
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, postIdParam]);

  const approve = async (commentId) => {
    if (!token) return;
    try {
      const response = await fetch(`${API_URL}/api/admin/blog/comments/${commentId}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) throw new Error();
      await load(1);
    } catch {
      setMessage('Failed to approve comment.');
    }
  };

  const reject = async (commentId) => {
    if (!token) return;
    if (!confirm('Reject this comment?')) return;
    try {
      const response = await fetch(`${API_URL}/api/admin/blog/comments/${commentId}/reject`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) throw new Error();
      await load(1);
    } catch {
      setMessage('Failed to reject comment.');
    }
  };

  const remove = async (commentId) => {
    if (!token) return;
    if (!confirm('Delete this comment? (It will be removed from the moderation queue)')) return;
    try {
      const response = await fetch(`${API_URL}/api/admin/blog/comments/${commentId}`, {
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
      setMessage('Failed to delete comment.');
    }
  };

  const goToPage = (nextPage) => {
    const safe = Math.max(1, nextPage);
    setPage(safe);
    load(safe);
  };

  return (
    <div className="admin-card">
      <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="admin-title">Blog comments</h2>
            <p className="admin-subtitle">Moderation queue for comments submitted on the public blog.</p>
          </div>
        <Link className="admin-link" href="/admin/blog">
          Back to posts
        </Link>
      </div>

      {message ? <div className="admin-message">{message}</div> : null}

      <div className="admin-recipes-toolbar">
        <div className="admin-toolbar-grid">
          <div className="admin-toolbar-filters">
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setPage(1);
              }}
              className="admin-filter-select"
            >
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="deleted">Deleted</option>
              <option value="all">All</option>
            </select>
            <button
              type="button"
              className="admin-button admin-add-button"
              onClick={() => load(1, statusFilter)}
              disabled={isLoading}
            >
              Refresh
            </button>
          </div>
          {postId ? (
            <div className="admin-toolbar-actions">
              <span className="admin-subtitle" style={{ margin: 0 }}>
                Filtering post #{postId}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <div className="admin-loading-state">
          <p>Loading comments...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="admin-empty-state">
          <div className="admin-empty-icon">💬</div>
          <p>No comments found</p>
          <p className="admin-empty-subtext">Comments submitted by visitors show up here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((comment) => (
            <div key={comment.id} className="rounded-xl border border-gray-200 p-4 bg-white">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-semibold text-gray-900">
                    {comment.name}{' '}
                    {comment.email ? <span className="text-gray-500">({comment.email})</span> : null}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Post #{comment.post_id} •{' '}
                    {comment.created_at ? new Date(comment.created_at).toLocaleString() : '—'} • {comment.status}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {canModerate && comment.status === 'pending' ? (
                    <button type="button" className="admin-button" onClick={() => approve(comment.id)}>
                      Approve
                    </button>
                  ) : null}
                  {canModerate && comment.status === 'pending' ? (
                    <button type="button" className="admin-button secondary" onClick={() => reject(comment.id)}>
                      Reject
                    </button>
                  ) : null}
                  {canModerate ? (
                    <button type="button" className="admin-button secondary" onClick={() => remove(comment.id)}>
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>
              <p className="mt-3 text-gray-800 whitespace-pre-wrap">{comment.content}</p>
            </div>
          ))}
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
