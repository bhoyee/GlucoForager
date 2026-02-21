import Link from 'next/link';
import BlogComments from '../../../components/BlogComments';
import BlogShare from '../../../components/BlogShare';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.glucoforager.com').replace(/\/+$/, '');

const escapeHtml = (value) =>
  String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

function renderContent(content) {
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
      next: { revalidate: 60 },
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
    fetch(`${API_URL}/api/blog/posts/${encodeURIComponent(slug)}`, { next: { revalidate: 60 } }),
    fetch(`${API_URL}/api/blog/posts/${encodeURIComponent(slug)}/comments`, { next: { revalidate: 60 } }),
  ]);

  if (!postRes.ok) {
    return (
      <main className="container mx-auto max-w-4xl px-4 py-10 space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">Post not found</h1>
        <Link href="/blog" className="text-teal-700 font-semibold hover:text-teal-900">
          Back to blog
        </Link>
      </main>
    );
  }

  const post = await postRes.json();
  const initialComments = commentsRes.ok ? await commentsRes.json() : [];
  const url = `${SITE_URL}/blog/${post.slug}`;

  return (
    <main className="container mx-auto max-w-4xl px-4 py-10 space-y-6">
      <div className="flex items-center justify-between gap-6 flex-wrap">
        <Link href="/blog" className="text-teal-700 font-semibold hover:text-teal-900">
          ← Blog
        </Link>
        <BlogShare title={post.title} url={url} />
      </div>

      <header className="space-y-3">
        <h1 className="text-4xl font-bold text-gray-900">{post.title}</h1>
        <div className="flex items-center gap-3 text-sm text-gray-600">
          {post.author_name ? <span>By {post.author_name}</span> : null}
          {post.published_at ? <span>{new Date(post.published_at).toLocaleDateString()}</span> : null}
        </div>
        {post.excerpt ? <p className="text-lg text-gray-700">{post.excerpt}</p> : null}
      </header>

      <article className="space-y-4">{renderContent(post.content)}</article>

      <BlogComments slug={post.slug} initialComments={initialComments} />
    </main>
  );
}

