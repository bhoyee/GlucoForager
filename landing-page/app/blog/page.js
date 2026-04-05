import Link from 'next/link';
import Footer from '../../components/Footer';
import ScrollControls from '../../components/ScrollControls';
import BlogTopBar from '../../components/BlogTopBar';
import BlogCoverImage from '../../components/BlogCoverImage';
import WhatsAppCtaCard from '../../components/WhatsAppCtaCard';
import AppDownloadCard from '../../components/AppDownloadCard';
import { formatDMY } from '../../lib/formatDate';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';
const API_BASE = API_URL.replace(/\/+$/, '');

export const metadata = {
  title: 'GlucoForager Blog',
  description: 'Diabetes-friendly cooking tips, low-glycemic recipes, and product updates from GlucoForager.',
  alternates: { canonical: '/blog' },
  openGraph: {
    title: 'GlucoForager Blog',
    description: 'Diabetes-friendly cooking tips, low-glycemic recipes, and product updates from GlucoForager.',
    url: '/blog',
    type: 'website',
    images: [{ url: '/blog/opengraph-image', width: 1200, height: 630, alt: 'GlucoForager Blog' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GlucoForager Blog',
    description: 'Diabetes-friendly cooking tips, low-glycemic recipes, and product updates from GlucoForager.',
    images: ['/blog/twitter-image'],
  },
};

const stripHtml = (value) => String(value || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

const resolveImageUrl = (value) => {
  const url = typeof value === 'string' ? value.trim() : '';
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/')) return `${API_BASE}${url}`;
  return `${API_BASE}/${url.replace(/^\/+/, '')}`;
};

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
        <BlogTopBar rightHref="/" rightLabel="Back to home" />
        <div className="container mx-auto max-w-6xl px-4 py-10">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8 items-start">
            <div className="space-y-8 min-w-0">
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
                  {items.map((post) => (
                    <article
                      key={post.id}
                      className="rounded-2xl border border-gray-200 bg-white overflow-hidden hover:shadow-lg transition-shadow"
                    >
                      <BlogCoverImage
                        title={post.title}
                        imageUrl={resolveImageUrl(post.image_url)}
                        aspect="16/9"
                        roundedClass="rounded-none"
                        containerClassName="bg-gray-100"
                      />
                      <div className="p-6">
                        <p className="text-sm text-gray-500">
                          {post.published_at ? formatDMY(post.published_at) : 'Unpublished'}
                        </p>
                        <h2 className="text-2xl font-bold text-gray-900 mt-2">
                          <Link href={`/blog/${post.slug}`} className="hover:text-teal-700">
                            {post.title}
                          </Link>
                        </h2>
                        {post.excerpt ? <p className="text-gray-700 mt-3">{stripHtml(post.excerpt)}</p> : null}
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

            <div className="space-y-6 lg:sticky lg:top-24">
              <WhatsAppCtaCard />
              <AppDownloadCard />
            </div>
          </div>
        </div>
      </main>
      <ScrollControls />
      <Footer />
    </>
  );
}
