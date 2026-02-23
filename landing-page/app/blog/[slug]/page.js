import Link from 'next/link';
import BlogComments from '../../../components/BlogComments';
import BlogShare from '../../../components/BlogShare';
import BlogTopBar from '../../../components/BlogTopBar';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.glucoforager.com').replace(/\/+$/, '');

function PostHeroPlaceholder({ title }) {
  const label = String(title || 'GF').trim();
  const first = label ? label[0].toUpperCase() : 'G';
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-teal-700 via-emerald-600 to-cyan-600">
      <div className="absolute inset-0 opacity-25 bg-[radial-gradient(circle_at_30%_20%,white,transparent_55%)]" />
      <div className="aspect-[16/7] flex items-center justify-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 backdrop-blur border border-white/20">
          <span className="text-3xl font-extrabold text-white">{first}</span>
        </div>
      </div>
    </div>
  );
}

function PostHeroMedia({ title, imageUrl }) {
  const url = typeof imageUrl === 'string' ? imageUrl.trim() : '';
  if (url) {
    return (
      <div className="relative overflow-hidden rounded-2xl bg-gray-100 border border-gray-200">
        <div className="aspect-[16/7]">
          <img
            src={url}
            alt={title ? `${title} cover` : 'Post cover'}
            className="h-full w-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(event) => {
              event.currentTarget.style.display = 'none';
            }}
          />
        </div>
      </div>
    );
  }
  return <PostHeroPlaceholder title={title} />;
}

const escapeHtml = (value) =>
  String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

function renderContent(content) {
  const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(String(content || ''));
  if (looksLikeHtml) {
    return (
      <div
        className="text-gray-800 leading-7 [&_p]:mt-4 [&_h1]:text-3xl [&_h1]:font-extrabold [&_h1]:text-gray-900 [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-gray-900 [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-bold [&_h3]:text-gray-900 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mt-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mt-4 [&_li]:mt-1 [&_a]:text-teal-700 [&_a]:font-semibold hover:[&_a]:text-teal-900"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: String(content || '') }}
      />
    );
  }

  const blocks = String(content || '').split(/\n{2,}/g).map((block) => block.trim()).filter(Boolean);

  return blocks.map((block, idx) => {
    const lines = block.split('\n').map((l) => l.trim());
    const isH2 = lines.length === 1 && lines[0].startsWith('## ');
    const isH1 = lines.length === 1 && lines[0].startsWith('# ');
    const isList = lines.every((l) => l.startsWith('- '));

    if (isH1) {
      return <h2 key={idx} className="text-2xl font-bold text-gray-900 mt-8">{lines[0].slice(2)}</h2>;
    }
    if (isH2) {
      return <h3 key={idx} className="text-xl font-bold text-gray-900 mt-6">{lines[0].slice(3)}</h3>;
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
    return {
      title: post.title,
      description: post.excerpt || post.title,
      alternates: { canonical: url },
      openGraph: {
        title: post.title,
        description: post.excerpt || post.title,
        url,
        type: 'article',
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
      <div className="container mx-auto max-w-4xl px-4 py-10 space-y-6">
        <div className="flex items-center justify-between gap-6 flex-wrap">
          <Link href="/blog" className="text-teal-700 font-semibold hover:text-teal-900">
            ← Blog
          </Link>
          <BlogShare title={post.title} url={url} />
        </div>

        <PostHeroMedia title={post.title} imageUrl={post.image_url} />

        <header className="space-y-3">
          <h1 className="text-4xl font-bold text-gray-900">{post.title}</h1>
          <div className="flex items-center gap-3 text-sm text-gray-600">
            {post.author_name ? <span>By {post.author_name}</span> : null}
            {post.published_at ? <span>{new Date(post.published_at).toLocaleDateString()}</span> : null}
          </div>
          {post.excerpt ? <p className="text-lg text-gray-700">{post.excerpt}</p> : null}
        </header>

        <article className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6">
          {renderContent(post.content)}
        </article>

        <BlogComments slug={post.slug} initialComments={initialComments} />
      </div>
    </main>
  );
}
