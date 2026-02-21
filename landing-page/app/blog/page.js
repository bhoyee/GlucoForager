import Link from 'next/link';
import Image from 'next/image';
import Footer from '../../components/Footer';
import ScrollControls from '../../components/ScrollControls';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

export const metadata = {
  title: 'GlucoForager Blog',
  description: 'Diabetes-friendly cooking tips, low-glycemic recipes, and product updates from GlucoForager.',
};

function PostImagePlaceholder({ title }) {
  const label = String(title || 'GF').trim();
  const first = label ? label[0].toUpperCase() : 'G';
  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-gradient-to-br from-teal-600 via-emerald-500 to-cyan-500">
      <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_30%_20%,white,transparent_55%)]" />
      <div className="aspect-[16/9] flex items-center justify-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 backdrop-blur border border-white/20">
          <span className="text-2xl font-extrabold text-white">{first}</span>
        </div>
      </div>
    </div>
  );
}

export default async function BlogIndexPage({ searchParams }) {
  const page = Math.max(1, Number(searchParams?.page || 1));
  const pageSize = 12;

  let data = { items: [], total: 0 };
  let unavailable = false;
  try {
    const response = await fetch(`${API_URL}/api/blog/posts?page=${page}&page_size=${pageSize}`, {
      next: { revalidate: 10 },
    });
    if (!response.ok) throw new Error('Request failed');
    data = await response.json();
  } catch {
    unavailable = true;
  }

  const items = Array.isArray(data?.items) ? data.items : [];
  const total = Number(data?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <main className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
        <div className="container mx-auto max-w-6xl px-4 py-12 space-y-10">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3 min-w-0">
            <div className="relative h-10 w-10">
              <Image
                src="/images/logo.png"
                alt="GlucoForager Logo"
                width={40}
                height={40}
                className="object-contain"
                priority
              />
            </div>
            <span className="text-lg font-extrabold text-gray-900 whitespace-nowrap">GlucoForager</span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full bg-teal-600 px-5 py-2.5 text-white font-semibold shadow-sm hover:bg-teal-700 transition-colors shrink-0"
          >
            Back to home
          </Link>
        </header>

        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div>
            <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900">Blog</h1>
            <p className="text-gray-600 mt-3 max-w-2xl">
              Diabetes-friendly cooking tips, low-glycemic recipes, and product updates.
            </p>
          </div>
        </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8">
          <h2 className="text-xl font-bold text-gray-900">No posts yet</h2>
          <p className="text-gray-700 mt-2">
            {unavailable ? 'Blog is temporarily unavailable. Please try again soon.' : 'Check back soon.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((post) => (
            <article
              key={post.id}
              className="rounded-2xl border border-gray-200 bg-white overflow-hidden hover:shadow-lg transition-shadow"
            >
              <PostImagePlaceholder title={post.title} />
              <div className="p-6">
                <p className="text-sm text-gray-500">
                  {post.published_at ? new Date(post.published_at).toLocaleDateString() : 'Unpublished'}
                </p>
                <h2 className="text-2xl font-bold text-gray-900 mt-2">
                  <Link href={`/blog/${post.slug}`} className="hover:text-teal-700">
                    {post.title}
                  </Link>
                </h2>
                {post.excerpt ? <p className="text-gray-700 mt-3">{post.excerpt}</p> : null}
                <div className="mt-4">
                  <Link href={`/blog/${post.slug}`} className="text-teal-700 font-semibold hover:text-teal-900">
                    Read more →
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

        {totalPages > 1 ? (
          <div className="flex items-center justify-between gap-4 pt-4">
            <Link
              href={`/blog?page=${Math.max(1, page - 1)}`}
              className={`inline-flex items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold ${
                page === 1 ? 'text-gray-400 border-gray-200 pointer-events-none' : 'text-teal-700 border-teal-200 hover:bg-teal-50'
              }`}
            >
              Prev
            </Link>
            <p className="text-sm text-gray-600">
              Page {page} of {totalPages}
            </p>
            <Link
              href={`/blog?page=${Math.min(totalPages, page + 1)}`}
              className={`inline-flex items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold ${
                page === totalPages
                  ? 'text-gray-400 border-gray-200 pointer-events-none'
                  : 'text-teal-700 border-teal-200 hover:bg-teal-50'
              }`}
            >
              Next
            </Link>
          </div>
        ) : null}
        </div>
      </main>
      <ScrollControls />
      <Footer />
    </>
  );
}
