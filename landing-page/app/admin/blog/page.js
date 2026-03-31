'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';
const PAGE_SIZE = 20;

export default function AdminBlogPostsPage() {
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
  const [canWrite, setCanWrite] = useState(false);

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
      const response = await fetch(`${API_URL}/api/admin/blog/posts?${params.toString()}`, {
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
      setMessage('Failed to load blog posts.');
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
        setCanWrite(!!can);
      } catch {
        setCanWrite(false);
      }
    };
    loadSession();
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const goToPage = (nextPage) => {
    const safe = Math.max(1, nextPage);
    setPage(safe);
    load(safe);
  };

  return (
    <div className="admin-card">
      <div className="admin-recipes-header">
        <h2 className="admin-title">Blog</h2>
        <p className="admin-subtitle">Create and manage blog posts shown on the public website.</p>
      </div>

      {message ? <div className="admin-message">{message}</div> : null}

      <div className="admin-recipes-toolbar">
        <div className="admin-toolbar-grid">
          <div className="admin-toolbar-search">
            <input
              type="text"
              placeholder="Search by title or slug..."
              value={q}
              onChange={(event) => {
                setQ(event.target.value);
                setPage(1);
              }}
              className="admin-search-input"
            />
          </div>

          <div className="admin-toolbar-filters">
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setPage(1);
              }}
              className="admin-filter-select"
            >
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="scheduled">Scheduled</option>
              <option value="published">Published</option>
            </select>
          </div>

          <div className="admin-toolbar-actions">
            <button
              type="button"
              className="admin-button info"
              onClick={() => load(1, q, statusFilter)}
              disabled={isLoading}
            >
              Refresh
            </button>
            {canWrite ? (
              <Link className="admin-button admin-add-button" href="/admin/blog/new">
                New Post
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="admin-loading-state">
          <p>Loading posts...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="admin-empty-state">
          <div className="admin-empty-icon">📝</div>
          <p>No posts found</p>
          <p className="admin-empty-subtext">Create your first post to start publishing.</p>
        </div>
      ) : (
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Published</th>
                <th>Slug</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((post) => (
                <tr key={post.id}>
                  <td>
                    <div className="admin-table-primary">{post.title}</div>
                  </td>
                  <td>
                    <span className="admin-recipe-badge">{post.status}</span>
                  </td>
                  <td className="admin-table-muted">
                    {post.published_at ? new Date(post.published_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="admin-table-muted">{post.slug}</td>
                  <td>
                    <div className="admin-table-actions">
                      <Link className="admin-link" href={`/admin/blog/${post.id}`}>
                        {canWrite ? 'Edit' : 'View'}
                      </Link>
                      <a className="admin-link" href={`/blog/${post.slug}`} target="_blank" rel="noreferrer">
                        View
                      </a>
                      <Link className="admin-link" href={`/admin/blog/comments?post_id=${post.id}`}>
                        Comments
                      </Link>
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
