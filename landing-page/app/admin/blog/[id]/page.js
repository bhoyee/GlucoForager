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
          <button type="button" className="admin-button secondary" onClick={handleDelete} disabled={isSubmitting}>
            Delete
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="admin-loading-state">
          <p>Loading post...</p>
        </div>
      ) : initialValues ? (
        <BlogPostForm
          adminToken={token}
          initialValues={initialValues}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          message={message}
          submitLabel="Save"
        />
      ) : (
        <p className="admin-subtitle">{message || 'Post not found.'}</p>
      )}
    </div>
  );
}
