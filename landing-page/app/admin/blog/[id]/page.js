'use client';
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import BlogPostForm from '../BlogPostForm';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

const parseErrorResponse = async (response) => {
  try {
    const data = await response.json();
    const detail = data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      const messages = detail.map((item) => item?.msg).filter(Boolean);
      if (messages.length) return messages.join(' ');
    }
    if (detail && typeof detail === 'object') return JSON.stringify(detail);
    return data?.message || 'Request failed.';
  } catch {
    try {
      const text = await response.text();
      return text || 'Request failed.';
    } catch {
      return 'Request failed.';
    }
  }
};

const toLocalDateTimeValue = (isoValue) => {
  if (!isoValue) return '';
  const date = new Date(isoValue);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}`;
};

const toApiPayload = (form) => {
  const publishedAt = form.published_at ? new Date(form.published_at).toISOString() : null;
  return {
    title: form.title,
    slug: form.slug || null,
    excerpt: form.excerpt || null,
    image_url: form.image_url || null,
    seo_title: form.seo_title || null,
    seo_description: form.seo_description || null,
    focus_keyword: form.focus_keyword || null,
    content: form.content,
    status: form.status,
    author_name: form.author_name || null,
    published_at: publishedAt,
    notify_newsletter: !!form.notify_newsletter,
  };
};

export default function AdminEditBlogPostPage() {
  const router = useRouter();
  const params = useParams();
  const postId = Number(params?.id);

  const token = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('adminToken');
  }, []);

  const [initialValues, setInitialValues] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [readOnly, setReadOnly] = useState(false);
  const [auditItems, setAuditItems] = useState([]);

  const load = async () => {
    if (!token) return;
    setIsLoading(true);
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/admin/blog/posts/${postId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) {
        setMessage('Post not found.');
        return;
      }
      const data = await response.json();
      setInitialValues({
        ...data,
        published_at: toLocalDateTimeValue(data?.published_at),
      });
    } catch {
      setMessage('Failed to load post.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!token) {
      router.push('/admin');
      return;
    }
    if (!postId) {
      setMessage('Invalid post id.');
      setIsLoading(false);
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, postId]);

  useEffect(() => {
    const loadSession = async () => {
      if (!token) return;
      try {
        const res = await fetch(`${API_URL}/api/admin/me`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.status === 401) return;
        const data = await res.json().catch(() => ({}));
        const perms = Array.isArray(data?.permissions) ? data.permissions : [];
        const canWrite = perms.includes('*') || perms.includes('blog.write');
        const canPublish = perms.includes('*') || perms.includes('blog.publish');
        if (!canWrite && !canPublish) setReadOnly(true);
      } catch {
        // ignore
      }
    };
    loadSession();
  }, [token]);

  useEffect(() => {
    const loadAudit = async () => {
      if (!token || !postId) return;
      try {
        const res = await fetch(`${API_URL}/api/admin/blog/audit?entity=blog_posts&entity_id=${encodeURIComponent(String(postId))}&limit=30`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        setAuditItems(Array.isArray(data?.items) ? data.items : []);
      } catch {
        // ignore
      }
    };
    loadAudit();
  }, [token, postId, isSubmitting]);

  const handleSubmit = async (form) => {
    if (!token) {
      router.push('/admin');
      return;
    }
    setIsSubmitting(true);
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/admin/blog/posts/${postId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(toApiPayload(form)),
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) {
        const errorMessage = await parseErrorResponse(response);
        setMessage(errorMessage || 'Failed to update post.');
        return;
      }
      await response.json().catch(() => null);
      router.push('/admin/blog');
    } catch {
      setMessage('Failed to update post.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!token) return;
    if (readOnly) return;
    if (!confirm('Delete this post? This cannot be undone.')) return;
    setIsSubmitting(true);
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/admin/blog/posts/${postId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      router.push('/admin/blog');
    } catch {
      setMessage('Failed to delete post.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="admin-card">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="admin-title">Edit blog post</h2>
          <p className="admin-subtitle">Update content, publish, and manage comments.</p>
        </div>
        <div className="flex items-center gap-3">
          {initialValues?.slug ? (
            <a className="admin-link" href={`/blog/${initialValues.slug}`} target="_blank" rel="noreferrer">
              View post
            </a>
          ) : null}
          <Link className="admin-link" href={`/admin/blog/comments?post_id=${postId}`}>
            View comments
          </Link>
          {!readOnly ? (
            <button type="button" className="admin-button secondary" onClick={handleDelete} disabled={isSubmitting}>
              Delete
            </button>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <div className="admin-loading-state">
          <p>Loading post...</p>
        </div>
      ) : initialValues ? (
        <>
          <BlogPostForm
            adminToken={token}
            initialValues={initialValues}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            message={message}
            submitLabel="Save"
            readOnly={readOnly}
          />

          <div className="rounded-2xl border border-gray-200 bg-white p-4 mt-6">
            <h3 className="text-base font-extrabold text-gray-900">Audit trail</h3>
            {auditItems.length === 0 ? (
              <p className="admin-subtitle">No audit entries yet.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {auditItems.map((a) => (
                  <div key={a.id} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <div className="text-xs text-gray-600">
                      {a.created_at} • {a.action} • staff #{a.actor_id || '—'}
                    </div>
                    {a.details ? <pre className="mt-2 text-xs text-gray-700 whitespace-pre-wrap">{JSON.stringify(a.details, null, 2)}</pre> : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <p className="admin-subtitle">{message || 'Post not found.'}</p>
      )}
    </div>
  );
}
