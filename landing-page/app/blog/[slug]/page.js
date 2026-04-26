import Link from 'next/link';
import BlogComments from '../../../components/BlogComments';
import BlogShare from '../../../components/BlogShare';
import BlogTopBar from '../../../components/BlogTopBar';
import BlogCoverImage from '../../../components/BlogCoverImage';
import WhatsAppCtaCard from '../../../components/WhatsAppCtaCard';
import AppDownloadCard from '../../../components/AppDownloadCard';
import BlogImageFallback from '../../../components/BlogImageFallback';
import { formatDMY } from '../../../lib/formatDate';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';
const API_BASE = API_URL.replace(/\/+$/, '');
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.glucoforager.com').replace(/\/+$/, '');

const isLocalhostApi = (value) => /\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(String(value || '').trim());

const apiBaseForRendering = (() => {
  // Only "upgrade" http -> https in real production deployments. For local dev, upgrading breaks
  // images because uvicorn isn't serving TLS (it logs "Invalid HTTP request received").
  if (
    process.env.NODE_ENV === 'production' &&
    SITE_URL.startsWith('https://') &&
    API_BASE.startsWith('http://') &&
    !isLocalhostApi(API_BASE)
  ) {
    return `https://${API_BASE.slice('http://'.length)}`;
  }
  return API_BASE;
})();

const stripHtml = (value) =>
  String(value || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const resolveImageUrl = (value) => {
  const url = typeof value === 'string' ? value.trim() : '';
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/')) return `${apiBaseForRendering}${url}`;
  return `${apiBaseForRendering}/${url.replace(/^\/+/, '')}`;
};

const escapeHtml = (value) =>
  String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

function rewriteContentHtml(html) {
  const source = String(html || '');
  if (!source) return '';

  const escapeAttr = (value) => String(value || '').replaceAll('"', '&quot;');

  const toUploadsPaths = (src) => {
    const url = String(src || '').trim();
    if (!url) return null;

    const relApiUploads = url.match(/^(\/api\/uploads\/.+)$/i);
    if (relApiUploads) return { path: relApiUploads[1], kind: 'api' };

    const relUploads = url.match(/^(\/uploads\/.+)$/i);
    if (relUploads) return { path: relUploads[1], kind: 'root' };

    const absApiUploads = url.match(/^https?:\/\/[^/]+(\/api\/uploads\/.+)$/i);
    if (absApiUploads) return { path: absApiUploads[1], kind: 'api' };

    const absUploads = url.match(/^https?:\/\/[^/]+(\/uploads\/.+)$/i);
    if (absUploads) return { path: absUploads[1], kind: 'root' };

    const localhostMatch = url.match(/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(\/uploads\/.+)$/i);
    if (localhostMatch) return { path: localhostMatch[1], kind: 'root' };

    return null;
  };

  const rewriteUploadsHost = (value) => {
    const url = String(value || '').trim();
    if (!url) return url;

    // Only rewrite our own uploads paths; leave external images untouched.
    // - /uploads/... (relative)
    // - http(s)://<anything>/uploads/... (absolute)
    const info = toUploadsPaths(url);
    if (info) return `${apiBaseForRendering}${info.path}`;

    return url;
  };

  return source.replace(/(<img[^>]+src=['"])([^'"]+)(['"][^>]*>)/gi, (_m, p1, src, p3) => {
    const primary = rewriteUploadsHost(src);

    const info = toUploadsPaths(src);
    if (!info) return `${p1}${primary}${p3}`;

    // Provide a fallback URL so the client can swap if the primary path isn't exposed
    // (some proxies only expose `/api/*`, others expose `/uploads/*`).
    const fallbackPath = info.path.startsWith('/api/uploads/')
      ? info.path.replace('/api/uploads/', '/uploads/')
      : info.path.replace('/uploads/', '/api/uploads/');
    const fallback = `${apiBaseForRendering}${fallbackPath}`;
    const withFallback = p3.replace(/>$/, ` data-gf-fallback-src="${escapeAttr(fallback)}">`);

    return `${p1}${primary}${withFallback}`;
  });
}

function renderContent(content) {
  const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(String(content || ''));
  if (looksLikeHtml) {
    const safeHtml = rewriteContentHtml(content);
    return (
      <div
        className="text-gray-800 leading-7 [&_p]:mt-4 [&_h1]:text-3xl [&_h1]:font-extrabold [&_h1]:text-gray-900 [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-gray-900 [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-bold [&_h3]:text-gray-900 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mt-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mt-4 [&_li]:mt-1 [&_a]:text-teal-700 [&_a]:font-semibold hover:[&_a]:text-teal-900"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: safeHtml }}
      />
    );
  }

  const blocks = String(content || '')
    .split(/\n{2,}/g)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks.map((block, idx) => {
    const lines = block.split('\n').map((l) => l.trim());
    const isH2 = lines.length === 1 && lines[0].startsWith('## ');
    const isH1 = lines.length === 1 && lines[0].startsWith('# ');
    const isList = lines.every((l) => l.startsWith('- '));

    if (isH1) {
      return (
        <h2 key={idx} className="text-2xl font-bold text-gray-900 mt-8">
          {lines[0].slice(2)}
        </h2>
      );
    }
    if (isH2) {
      return (
        <h3 key={idx} className="text-xl font-bold text-gray-900 mt-6">
          {lines[0].slice(3)}
        </h3>
      );
    }
    if (isList) {
      return (
        <ul key={idx} className="list-disc pl-6 space-y-1 text-gray-800">
          {lines.map((l) => (
            <li key={l}>{l.slice(2)}</li>
          ))}
        </ul>
      );
    }

    const safe = escapeHtml(block).replaceAll('\n', '<br />');
    return (
      <p
        key={idx}
        className="text-gray-800 leading-7"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: safe }}
      />
    );
  });
}

export async function generateMetadata({ params }) {
  try {
    const response = await fetch(`${API_URL}/api/blog/posts/${encodeURIComponent(params.slug)}`, {
      next: { revalidate: 10 },
    });
    if (!response.ok) return {};
    const post = await response.json();
    const url = `${SITE_URL}/blog/${post.slug}`;
    const coverUrl = resolveImageUrl(post.image_url);
    const imageUrl = coverUrl ? coverUrl : `${SITE_URL}/blog/${post.slug}/opengraph-image`;
    const metaTitle = (post.seo_title || post.title || '').trim();
    const metaDescription = stripHtml(post.seo_description || post.excerpt || post.title || '').trim();
    return {
      title: metaTitle || post.title,
      description: metaDescription || post.title,
      alternates: { canonical: url },
      openGraph: {
        title: metaTitle || post.title,
        description: metaDescription || post.title,
        url,
        type: 'article',
        images: [{ url: imageUrl, width: 1200, height: 630, alt: metaTitle || post.title }],
      },
      twitter: {
        card: 'summary_large_image',
        title: metaTitle || post.title,
        description: metaDescription || post.title,
        images: [imageUrl],
      },
    };
  } catch {
    return {};
  }
}

export default async function BlogPostPage({ params }) {
  const slug = params.slug;

  const [postRes, commentsRes] = await Promise.all([
    fetch(`${API_URL}/api/blog/posts/${encodeURIComponent(slug)}`, { next: { revalidate: 10 } }),
    fetch(`${API_URL}/api/blog/posts/${encodeURIComponent(slug)}/comments`, { next: { revalidate: 10 } }),
  ]);

  if (!postRes.ok) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
        <BlogTopBar rightHref="/blog" rightLabel="Back to blog" />
        <div className="container mx-auto max-w-4xl px-4 py-10 space-y-6">
          <h1 className="text-3xl font-bold text-gray-900">Post not found</h1>
          <Link href="/blog" className="text-teal-700 font-semibold hover:text-teal-900">
            Back to blog
          </Link>
        </div>
      </main>
    );
  }

  const post = await postRes.json();
  const initialComments = commentsRes.ok ? await commentsRes.json() : [];
  const url = `${SITE_URL}/blog/${post.slug}`;

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <BlogTopBar rightHref="/" rightLabel="Back to home" />
      <div className="container mx-auto max-w-6xl px-4 py-10 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8 items-start">
          <div className="min-w-0 space-y-6 max-w-3xl">
            <div className="flex items-center justify-between gap-6 flex-wrap">
              <Link href="/blog" className="text-teal-700 font-semibold hover:text-teal-900">
                ← Blog
              </Link>
              <BlogShare title={post.title} url={url} />
            </div>

            <BlogCoverImage title={post.title} imageUrl={resolveImageUrl(post.image_url)} aspect="16/7" roundedClass="rounded-2xl" />

            <header className="space-y-3">
              <h1 className="text-4xl font-bold text-gray-900">{post.title}</h1>
              <div className="flex items-center gap-3 text-sm text-gray-600">
                {post.author_name ? <span>By {post.author_name}</span> : null}
                {post.published_at ? <span>{formatDMY(post.published_at)}</span> : null}
              </div>
              {post.excerpt ? <p className="text-lg text-gray-700">{stripHtml(post.excerpt)}</p> : null}
            </header>

            <article className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6">
              <BlogImageFallback />
              {renderContent(post.content)}
            </article>

            <BlogComments slug={post.slug} initialComments={initialComments} />
          </div>

          <div className="space-y-6 lg:sticky lg:top-24">
            <WhatsAppCtaCard />
            <AppDownloadCard />
          </div>
        </div>
      </div>
    </main>
  );
}
