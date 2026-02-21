import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

export const metadata = {
  title: 'Blog',
  description: 'Diabetes-friendly cooking tips, low-glycemic recipes, and product updates from GlucoForager.',
};

export default async function BlogIndexPage({ searchParams }) {
  const page = Math.max(1, Number(searchParams?.page || 1));
  const pageSize = 10;

  let data = { items: [], total: 0 };
  try {
    const response = await fetch(`${API_URL}/api/blog/posts?page=${page}&page_size=${pageSize}`, {
      next: { revalidate: 60 },
    });
    data = await response.json();
  } catch {
    // Ignore fetch errors; render empty state.
  }

  const items = Array.isArray(data?.items) ? data.items : [];
  const total = Number(data?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <main className="container mx-auto max-w-5xl px-4 py-10 space-y-8">
      <div className="flex items-end justify-between gap-6 flex-wrap">
        <div>
          <h1 className="text-4xl font-bold text-gray-900">Blog</h1>
          <p className="text-gray-600 mt-2">
            Diabetes-friendly cooking tips, low-glycemic recipes, and product updates.
          </p>
        </div>
        <Link href="/" className="text-teal-700 font-semibold hover:text-teal-900">
          Back to home
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="text-gray-700">No posts yet. Check back soon.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {items.map((post) => (
            <article key={post.id} className="rounded-2xl border border-gray-200 p-6 bg-white">
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
            </article>
          ))}
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-4 pt-2">
          <Link
            href={`/blog?page=${Math.max(1, page - 1)}`}
            className={`font-semibold ${page === 1 ? 'text-gray-400 pointer-events-none' : 'text-teal-700 hover:text-teal-900'}`}
          >
            Prev
          </Link>
          <p className="text-sm text-gray-600">
            Page {page} of {totalPages}
          </p>
          <Link
            href={`/blog?page=${Math.min(totalPages, page + 1)}`}
            className={`font-semibold ${page === totalPages ? 'text-gray-400 pointer-events-none' : 'text-teal-700 hover:text-teal-900'}`}
          >
            Next
          </Link>
        </div>
      ) : null}
    </main>
  );
}

