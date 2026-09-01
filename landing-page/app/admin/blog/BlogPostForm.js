'use client';

import { useMemo, useState } from 'react';
import AdminTinyEditor from '../../../components/AdminTinyEditor';
import AdminRichEditor from '../../../components/AdminRichEditor';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';
const API_BASE = API_URL.replace(/\/+$/, '');

// DOMParser handles HTML-entity decoding, nested/attributed tags, and finding actual
// block-level elements correctly - much more reliable than regexing raw HTML strings
// (the old regex approach only found the literal first "<p>" substring anywhere in the
// document, with no check that it was non-empty or actually the first real paragraph,
// which is why "keyword in first paragraph" could report false even when the keyword
// was clearly there - e.g. an empty leading <p></p>, or content opening with a list).
const parseHtmlDoc = (html) => {
  if (typeof window === 'undefined' || !window.DOMParser) return null;
  try {
    return new DOMParser().parseFromString(String(html || ''), 'text/html');
  } catch {
    return null;
  }
};

const stripHtml = (value) => {
  const doc = parseHtmlDoc(value);
  if (doc) return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|\u00A0/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const keywordToSlug = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&nbsp;|\u00A0/gi, ' ')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const extractFirstParagraphText = (html) => {
  const doc = parseHtmlDoc(html);
  if (!doc) return '';
  // First non-empty paragraph/list-item/quote, in document order - skips empty <p></p>
  // (common right after clearing formatting) and doesn't count headings as "paragraph".
  const blocks = doc.body.querySelectorAll('p, li, blockquote');
  for (const el of blocks) {
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (text) return text;
  }
  return '';
};

const extractHeadingsText = (html) => {
  const doc = parseHtmlDoc(html);
  if (!doc) return '';
  const headings = doc.body.querySelectorAll('h1, h2, h3, h4, h5, h6');
  return Array.from(headings)
    .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ');
};

const trimLeadingNbspHtml = (value) => {
  const html = String(value || '');
  return html
    .replace(/^(?:\s|&nbsp;|\u00A0)+/i, '')
    .replace(/^(<p[^>]*>)(?:\s|&nbsp;|\u00A0|<br\s*\/?>)+/i, '$1');
};

export default function BlogPostForm({
  initialValues,
  onSubmit,
  adminToken,
  isSubmitting = false,
  message = '',
  submitLabel = 'Save',
  readOnly = false,
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
    notify_all_users: false,
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
      !readOnly &&
      form.title.trim().length >= 4 &&
      String(form.content || '').trim().length >= 10 &&
      (form.status === 'draft' || form.status === 'published' || form.status === 'scheduled') &&
      (form.status !== 'scheduled' || Boolean(String(form.published_at || '').trim()))
    );
  }, [form, isSubmitting, readOnly]);

  const seo = useMemo(() => {
    const keyword = String(form.focus_keyword || '').trim().toLowerCase();
    const keywordSlug = keywordToSlug(keyword);
    const title = String(form.seo_title || form.title || '').trim();
    const desc = stripHtml(form.seo_description || form.excerpt || '');

    const slug = String(form.slug || '').trim() || String(form.title || '').trim();
    const urlSlug = slug ? slug.trim().toLowerCase().replace(/\s+/g, '-') : '';
    const url = urlSlug ? `https://www.glucoforager.com/blog/${urlSlug}` : 'https://www.glucoforager.com/blog/...';

    const rawContent = String(form.content || '');
    const firstPara = extractFirstParagraphText(rawContent);
    const headingsText = extractHeadingsText(rawContent).toLowerCase();

    const hasText = (haystack) => (keyword ? String(haystack || '').toLowerCase().includes(keyword) : false);
    const hasUrl = (haystack) =>
      keywordSlug ? String(haystack || '').toLowerCase().includes(keywordSlug) : false;

    return {
      keyword,
      url,
      previewTitle: title || 'Meta title preview',
      previewDesc: desc || 'Meta description preview',
      titleLen: title.length,
      descLen: desc.length,
      checks: {
        keywordSet: Boolean(keyword),
        inTitle: hasText(title),
        inUrl: hasUrl(urlSlug) || hasText(urlSlug),
        inFirstPara: hasText(firstPara),
        inHeading: hasText(headingsText),
      },
    };
  }, [form]);

  const update = (key) => (event) => {
    setForm((prev) => ({ ...prev, [key]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    await onSubmit({
      ...form,
      excerpt: trimLeadingNbspHtml(form.excerpt),
      seo_description: stripHtml(form.seo_description),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {readOnly ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Read-only mode: you can view drafts and published posts, but you don&apos;t have permission to edit or publish.
        </div>
      ) : null}
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
        <input value={form.title} onChange={update('title')} placeholder="Post title" required disabled={readOnly} />
      </div>

      <div className="admin-field">
        <label>Slug (optional)</label>
        <input
          value={form.slug}
          onChange={update('slug')}
          placeholder="e.g. diabetes-friendly-breakfast-ideas"
          disabled={readOnly}
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
          onChange={(next) => setForm((prev) => ({ ...prev, excerpt: trimLeadingNbspHtml(next) }))}
          placeholder="Short summary shown on the blog list."
          adminToken={adminToken}
          readOnly={readOnly}
        />
      </div>

      <div className="admin-field">
        <label>Cover image URL (optional)</label>
        <input
          value={form.image_url}
          onChange={update('image_url')}
          placeholder="https://... or /uploads/..."
          disabled={readOnly}
        />
        <p className="admin-help">
          This image shows on the blog list and at the top of the post. Recommended: 1200×630.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept="image/*"
            disabled={readOnly || uploadBusy || !adminToken}
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
        <input value={form.author_name} onChange={update('author_name')} placeholder="GlucoForager Team" disabled={readOnly} />
      </div>

      <div className="admin-field">
        <label>Status</label>
        <select value={form.status} onChange={update('status')} disabled={readOnly}>
          <option value="draft">Draft</option>
          <option value="scheduled">Scheduled</option>
          <option value="published">Published</option>
        </select>
      </div>

      <div className="admin-field">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!form.notify_newsletter}
            onChange={(event) => setForm((prev) => ({ ...prev, notify_newsletter: event.target.checked }))}
            disabled={readOnly}
          />
          <span>Send to newsletter subscribers</span>
        </label>
        <p className="admin-help">Only works when Status is set to Published. Sends at most once per post.</p>
      </div>

      <div className="admin-field">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!form.notify_all_users}
            onChange={(event) => setForm((prev) => ({ ...prev, notify_all_users: event.target.checked }))}
            disabled={readOnly}
          />
          <span>Send to all users</span>
        </label>
        <p className="admin-help">
          Emails every GlucoForager app user (not just newsletter subscribers). Only works when Status is set to
          Published. Sends at most once per post.
        </p>
      </div>

      <div className="admin-field">
        <label>Published at</label>
        <input
          type="datetime-local"
          value={form.published_at}
          onChange={update('published_at')}
          disabled={readOnly}
        />
        <p className="admin-help">
          Required for Scheduled posts. If you publish without setting this, the backend will set it automatically.
        </p>
      </div>

      <div className="admin-field">
        <label>Content</label>
        <AdminRichEditor
          height={520}
          value={form.content}
          onChange={(next) => setForm((prev) => ({ ...prev, content: next }))}
          placeholder="Write your post content..."
          adminToken={adminToken}
          readOnly={readOnly}
        />
      </div>

      {message ? <p className="admin-subtitle">{message}</p> : null}

      <div className="admin-actions">
        {!readOnly ? (
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
        ) : null}
      </div>
    </form>
  );
}
