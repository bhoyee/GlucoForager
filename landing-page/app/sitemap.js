const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

export default async function sitemap() {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.glucoforager.com').replace(/\/+$/, '');
  const now = new Date();

  const routes = [
    '/',
    '/features',
    '/pricing',
    '/download',
    '/careers',
    '/blog',
    '/privacy-policy',
    '/terms',
    '/cookie-policy',
    '/sitemap',
  ];

  const staticEntries = routes.map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: now,
    changeFrequency: path === '/' ? 'weekly' : 'monthly',
    priority: path === '/' ? 1 : 0.6,
  }));

  try {
    const pageSize = 50;
    const maxPages = 4; // keep sitemap generation fast
    const blogEntries = [];

    for (let page = 1; page <= maxPages; page += 1) {
      const response = await fetch(`${API_URL}/api/blog/posts?page=${page}&page_size=${pageSize}`, {
        next: { revalidate: 300 },
      });
      if (!response.ok) break;
      const data = await response.json();
      const items = Array.isArray(data?.items) ? data.items : [];
      if (!items.length) break;

      for (const post of items) {
        if (!post?.slug) continue;
        blogEntries.push({
          url: `${siteUrl}/blog/${post.slug}`,
          lastModified: post?.published_at ? new Date(post.published_at) : now,
          changeFrequency: 'monthly',
          priority: 0.7,
        });
      }

      if (items.length < pageSize) break;
    }

    return [...staticEntries, ...blogEntries];
  } catch {
    return staticEntries;
  }
}
