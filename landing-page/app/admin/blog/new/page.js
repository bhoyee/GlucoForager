'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
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

const toApiPayload = (form) => {
  const publishedAt = form.published_at ? new Date(form.published_at).toISOString() : null;
  return {
    title: form.title,
    slug: form.slug || null,
    excerpt: form.excerpt || null,
    image_url: form.image_url || null,
    content: form.content,
    status: form.status,
    author_name: form.author_name || null,
    published_at: publishedAt,
    notify_newsletter: !!form.notify_newsletter,
  };
};

export default function AdminNewBlogPostPage() {
  const router = useRouter();
  const token = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('adminToken');
  }, []);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (form) => {
    if (!token) {
      router.push('/admin');
      return;
    }
    setIsSubmitting(true);
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/admin/blog/posts`, {
        method: 'POST',
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
        setMessage(errorMessage || 'Failed to create post.');
        return;
      }
      await response.json().catch(() => null);
      router.push('/admin/blog');
    } catch {
      setMessage('Failed to create post.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="admin-card">
      <h2 className="admin-title">Create blog post</h2>
      <p className="admin-subtitle">Draft first, then publish when ready.</p>
      <BlogPostForm
        adminToken={token}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        message={message}
        submitLabel="Create"
      />
    </div>
  );
}
