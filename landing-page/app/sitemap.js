export default function sitemap() {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.glucoforager.com').replace(/\/+$/, '');
  const now = new Date();

  const routes = [
    '/',
    '/features',
    '/pricing',
    '/download',
    '/blog',
    '/privacy-policy',
    '/terms',
    '/cookie-policy',
    '/sitemap',
  ];

  return routes.map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: now,
    changeFrequency: path === '/' ? 'weekly' : 'monthly',
    priority: path === '/' ? 1 : 0.6,
  }));
}

