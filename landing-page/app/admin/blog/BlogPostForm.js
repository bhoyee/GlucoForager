'use client';

import { useMemo, useState } from 'react';

export default function BlogPostForm({
  initialValues,
  onSubmit,
  isSubmitting = false,
  message = '',
  submitLabel = 'Save',
}) {
  const [form, setForm] = useState(() => ({
    title: initialValues?.title || '',
    slug: initialValues?.slug || '',
    excerpt: initialValues?.excerpt || '',
    image_url: initialValues?.image_url || '',
    author_name: initialValues?.author_name || '',
    status: initialValues?.status || 'draft',
    published_at: initialValues?.published_at || '',
    content: initialValues?.content || '',
    notify_newsletter: false,
  }));

  const previewUrl = useMemo(() => {
    const value = String(form.image_url || '').trim();
    if (!value) return '';
    if (value.startsWith('/') || value.startsWith('http://') || value.startsWith('https://')) return value;
    return '';
  }, [form.image_url]);

  const canSubmit = useMemo(() => {
    return (
      !isSubmitting &&
      form.title.trim().length >= 4 &&
      form.content.trim().length >= 10 &&
      (form.status === 'draft' || form.status === 'published')
    );
  }, [form, isSubmitting]);

  const update = (key) => (event) => {
    setForm((prev) => ({ ...prev, [key]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    await onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="admin-field">
        <label>Title</label>
        <input value={form.title} onChange={update('title')} placeholder="Post title" required />
      </div>

      <div className="admin-field">
        <label>Slug (optional)</label>
        <input
          value={form.slug}
          onChange={update('slug')}
          placeholder="e.g. diabetes-friendly-breakfast-ideas"
        />
        <p className="admin-help">
          Leave blank to auto-generate from the title. Slug must be unique.
        </p>
      </div>

      <div className="admin-field">
        <label>Excerpt (optional)</label>
        <textarea
          rows={3}
          value={form.excerpt}
          onChange={update('excerpt')}
          placeholder="Short summary shown on the blog list."
        />
      </div>

      <div className="admin-field">
        <label>Cover image URL (optional)</label>
        <input
          value={form.image_url}
          onChange={update('image_url')}
          placeholder="https://... or /uploads/..."
        />
        <p className="admin-help">
          This image shows on the blog list and at the top of the post. Recommended: 1200×630.
        </p>
        {previewUrl ? (
          <div className="mt-3 overflow-hidden rounded-xl border border-gray-200 bg-white">
            <img
              src={previewUrl}
              alt="Cover preview"
              className="block w-full max-h-56 object-cover"
              loading="lazy"
              onError={(event) => {
                event.currentTarget.style.display = 'none';
              }}
            />
          </div>
        ) : null}
      </div>

      <div className="admin-field">
        <label>Author name (optional)</label>
        <input value={form.author_name} onChange={update('author_name')} placeholder="GlucoForager Team" />
      </div>

      <div className="admin-field">
        <label>Status</label>
        <select value={form.status} onChange={update('status')}>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
      </div>

      <div className="admin-field">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!form.notify_newsletter}
            onChange={(event) => setForm((prev) => ({ ...prev, notify_newsletter: event.target.checked }))}
          />
          <span>Send to newsletter subscribers</span>
        </label>
        <p className="admin-help">Only works when Status is set to Published. Sends at most once per post.</p>
      </div>

      <div className="admin-field">
        <label>Published at (optional)</label>
        <input
          type="datetime-local"
          value={form.published_at}
          onChange={update('published_at')}
        />
        <p className="admin-help">
          If you publish without setting this, the backend will set it automatically.
        </p>
      </div>

      <div className="admin-field">
        <label>Content</label>
        <textarea
          rows={14}
          value={form.content}
          onChange={update('content')}
          placeholder={
            'Write your post content.\n\nFormatting tips:\n- Use # Heading or ## Subheading\n- Use - bullets for lists\n- Separate paragraphs with a blank line'
          }
          required
        />
      </div>

      {message ? <p className="admin-subtitle">{message}</p> : null}

      <div className="admin-actions">
        <button className="admin-button" type="submit" disabled={!canSubmit}>
          {isSubmitting ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  );
}
