'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

export default function LatestBlogPosts() {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        setIsLoading(true);
        setLoadFailed(false);
        const response = await fetch(`${API_URL}/api/blog/posts?page=1&page_size=3`);
        if (!response.ok) throw new Error('Request failed');
        const data = await response.json();
        if (!alive) return;
        setItems(Array.isArray(data?.items) ? data.items : []);
      } catch {
        if (!alive) return;
        setLoadFailed(true);
      }
      if (!alive) return;
      setIsLoading(false);
    };
    load();
    return () => {
      alive = false;
    };
  }, []);

  const placeholders = Array.from({ length: 4 }).map((_, idx) => ({ id: `placeholder-${idx}` }));

  return (
    <section className="py-16 bg-white" id="blog">
      <div className="container mx-auto px-4">
        <div className="flex items-end justify-between gap-6 flex-wrap mb-10">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Latest blog posts</h2>
            <p className="text-gray-600 mt-2">Tips, recipes, and updates for diabetes-friendly eating.</p>
          </div>
          <Link href="/blog" className="text-teal-700 font-semibold hover:text-teal-900">
            View all →
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {(isLoading ? placeholders : items).map((post) => (
            <article key={post.id} className="rounded-2xl border border-gray-200 p-6 bg-white">
              {isLoading ? (
                <>
                  <div className="h-4 w-24 bg-gray-100 rounded" />
                  <div className="mt-4 h-6 w-4/5 bg-gray-100 rounded" />
                  <div className="mt-3 h-4 w-full bg-gray-100 rounded" />
                  <div className="mt-2 h-4 w-3/4 bg-gray-100 rounded" />
                  <div className="mt-6 h-4 w-20 bg-gray-100 rounded" />
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-500">
                    {post.published_at ? new Date(post.published_at).toLocaleDateString() : 'Unpublished'}
                  </p>
                  <h3 className="text-xl font-bold text-gray-900 mt-2">
                    <Link href={`/blog/${post.slug}`} className="hover:text-teal-700">
                      {post.title}
                    </Link>
                  </h3>
                  {post.excerpt ? <p className="text-gray-700 mt-3 line-clamp-3">{post.excerpt}</p> : null}
                  <div className="mt-4">
                    <Link href={`/blog/${post.slug}`} className="text-teal-700 font-semibold hover:text-teal-900">
                      Read →
                    </Link>
                  </div>
                </>
              )}
            </article>
          ))}
        </div>

        {!isLoading && items.length === 0 ? (
          <div className="mt-8 text-center">
            <p className="text-gray-600">
              {loadFailed ? 'Blog is temporarily unavailable.' : 'No posts yet. Check back soon.'}
            </p>
            <div className="mt-4">
              <Link
                href="/blog"
                className="inline-flex items-center justify-center rounded-lg bg-teal-600 px-5 py-3 text-white font-semibold hover:bg-teal-700 transition-colors"
              >
                Go to Blog
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
