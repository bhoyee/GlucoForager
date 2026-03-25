'use client';

import { useMemo, useState } from 'react';
import AdminTinyEditor from '../../../components/AdminTinyEditor';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';
const API_BASE = API_URL.replace(/\/+$/, '');

export default function BlogPostForm({
  initialValues,
  onSubmit,
  adminToken,
  isSubmitting = false,
  message = '',
  submitLabel = 'Save',
}) {
  const [form, setForm] = useState(() => ({
    title: initialValues?.title || '',
    slug: initialValues?.slug || '',
    excerpt: initialValues?.excerpt || '',
    image_url: initialValues?.image_url || '',
    seo_title: initialValues?.seo_title || '',
    seo_description: initialValues?.seo_description || '',
    focus_keyword: initialValues?.focus_keyword || '',
    author_name: initialValues?.author_name || '',
    status: initialValues?.status || 'draft',
    published_at: initialValues?.published_at || '',
    content: initialValues?.content || '',
    notify_newsletter: false,
  }));

  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');

  const previewUrl = useMemo(() => {
    const value = String(form.image_url || '').trim();
    if (!value) return '';
    if (value.startsWith('/')) return `${API_BASE}${value}`;
    if (value.startsWith('http://') || value.startsWith('https://')) return value;
    return '';
  }, [form.image_url]);

  const handleFileUpload = async (file) => {
    if (!file || !adminToken) return;
    setUploadBusy(true);
    setUploadMessage('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`${API_URL}/api/admin/blog/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = typeof data?.detail === 'string' ? data.detail : 'Upload failed.';
        setUploadMessage(detail);
        return;
      }
      if (data?.url) {
        const uploadedUrl = String(data.url || '').trim();
        const normalizedUrl = uploadedUrl.startsWith('/') ? `${API_BASE}${uploadedUrl}` : uploadedUrl;
        setForm((prev) => ({ ...prev, image_url: normalizedUrl }));
        setUploadMessage('Uploaded.');
      } else {
        setUploadMessage('Upload failed.');
      }
    } catch {
      setUploadMessage('Upload failed.');
    } finally {
      setUploadBusy(false);
    }
  };

  const canSubmit = useMemo(() => {
    return (
      !isSubmitting &&
      form.title.trim().length >= 4 &&
      String(form.content || '').trim().length >= 10 &&
      (form.status === 'draft' || form.status === 'published')
    );
  }, [form, isSubmitting]);

  const seo = useMemo(() => {
    const keyword = String(form.focus_keyword || '').trim().toLowerCase();
    const title = String(form.seo_title || form.title || '').trim();
    const desc = String(form.seo_description || form.excerpt || '').trim();

    const slug = String(form.slug || '').trim() || String(form.title || '').trim();
    const urlSlug = slug ? slug.trim().toLowerCase().replace(/\s+/g, '-') : '';
    const url = urlSlug ? `https://www.glucoforager.com/blog/${urlSlug}` : 'https://www.glucoforager.com/blog/...';

    const rawContent = String(form.content || '');
    const text = rawContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const firstPara = text.split(/\n{1,}|\.\s+/)[0] || text.slice(0, 240);
    const headingsText = rawContent
      .replace(/\n+/g, '\n')
      .split('\n')
      .filter((l) => l.startsWith('## ') || l.startsWith('# '))
      .join(' ')
      .toLowerCase();

    const has = (haystack) => (keyword ? String(haystack || '').toLowerCase().includes(keyword) : false);

    return {
      keyword,
      url,
      previewTitle: title || 'Meta title preview',
      previewDesc: desc || 'Meta description preview',
      titleLen: title.length,
      descLen: desc.length,
      checks: {
        keywordSet: Boolean(keyword),
        inTitle: has(title),
        inUrl: has(urlSlug),
        inFirstPara: has(firstPara),
        inHeading: has(headingsText),
      },
    };
  }, [form]);

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
      <div className="rounded-2xl border border-teal-200 bg-white p-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-base font-extrabold text-gray-900">SEO (Yoast-style)</h3>
            <p className="text-sm text-gray-600">
              Set a focus keyword, meta title, and meta description to improve how your post appears in Google and social previews.
            </p>
          </div>
          <div className="text-xs text-gray-500">
            Title: {seo.titleLen}/60 • Description: {seo.descLen}/160
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="admin-field">
              <label>Focus keyword</label>
              <input
                value={form.focus_keyword}
                onChange={update('focus_keyword')}
                placeholder='e.g. "blood sugar friendly breakfast"'
              />
              <p className="admin-help">Used for a simple checklist (keyword should appear in title, first paragraph, a subheading, and URL).</p>
            </div>

            <div className="admin-field">
              <label>Meta title</label>
              <input
                value={form.seo_title}
                onChange={update('seo_title')}
                placeholder="Shown in Google results and social previews"
              />
            </div>

            <div className="admin-field">
              <label>Meta description</label>
              <textarea
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2"
                rows={3}
                value={form.seo_description}
                onChange={update('seo_description')}
                placeholder="Short summary to encourage clicks"
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div className="text-xs text-green-700 font-semibold">{seo.url}</div>
              <div className="mt-1 text-lg font-extrabold text-blue-800">{seo.previewTitle}</div>
              <div className="mt-1 text-sm text-gray-700">{seo.previewDesc}</div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="text-sm font-extrabold text-gray-900">Checklist</div>
              <ul className="mt-2 space-y-1 text-sm">
                <li className={seo.checks.keywordSet ? 'text-emerald-700' : 'text-gray-500'}>
                  {seo.checks.keywordSet ? '✓' : '•'} Focus keyword set
                </li>
                <li className={seo.checks.inTitle ? 'text-emerald-700' : 'text-gray-500'}>
                  {seo.checks.inTitle ? '✓' : '•'} Keyword in meta title
                </li>
                <li className={seo.checks.inUrl ? 'text-emerald-700' : 'text-gray-500'}>
                  {seo.checks.inUrl ? '✓' : '•'} Keyword in URL (slug)
                </li>
                <li className={seo.checks.inFirstPara ? 'text-emerald-700' : 'text-gray-500'}>
                  {seo.checks.inFirstPara ? '✓' : '•'} Keyword in first paragraph
                </li>
                <li className={seo.checks.inHeading ? 'text-emerald-700' : 'text-gray-500'}>
                  {seo.checks.inHeading ? '✓' : '•'} Keyword in a subheading
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

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
        <AdminTinyEditor
          compact
          height={160}
          value={form.excerpt}
          onChange={(next) => setForm((prev) => ({ ...prev, excerpt: next }))}
          placeholder="Short summary shown on the blog list."
          adminToken={adminToken}
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
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept="image/*"
            disabled={uploadBusy || !adminToken}
            onChange={(event) => handleFileUpload(event.target.files?.[0])}
          />
          {uploadBusy ? (
            <span className="inline-flex items-center gap-2 text-sm text-gray-600">
              <span className="h-4 w-4 rounded-full border-2 border-gray-300 border-t-gray-700 animate-spin" />
              Uploading...
            </span>
          ) : uploadMessage ? (
            <span className="text-sm text-gray-600">{uploadMessage}</span>
          ) : null}
        </div>
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
        <AdminTinyEditor
          height={520}
          value={form.content}
          onChange={(next) => setForm((prev) => ({ ...prev, content: next }))}
          placeholder="Write your post content..."
          adminToken={adminToken}
        />
      </div>

      {message ? <p className="admin-subtitle">{message}</p> : null}

      <div className="admin-actions">
        <button className="admin-button" type="submit" disabled={!canSubmit}>
          {isSubmitting ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-4 w-4 rounded-full border-2 border-white/60 border-t-white animate-spin" />
              Saving...
            </span>
          ) : (
            submitLabel
          )}
        </button>
      </div>
    </form>
  );
}
