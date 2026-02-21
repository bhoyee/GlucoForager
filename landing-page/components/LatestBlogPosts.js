'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

export default function LatestBlogPosts() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch(`${API_URL}/api/blog/posts?page=1&page_size=3`);
        const data = await response.json();
        if (!alive) return;
        setItems(Array.isArray(data?.items) ? data.items : []);
      } catch {
        // Ignore.
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, []);

  if (!items.length) return null;

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
          {items.map((post) => (
            <article key={post.id} className="rounded-2xl border border-gray-200 p-6 bg-white">
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
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

