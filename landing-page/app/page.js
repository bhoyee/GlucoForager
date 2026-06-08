import HomePageClient from "../components/HomePageClient";

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "http://localhost:8010";

async function fetchLatestBlogPosts() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  try {
    const res = await fetch(`${API_URL}/api/blog/posts?page=1&page_size=4`, {
      next: { revalidate: 300 },
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    return Array.isArray(data?.items) ? data.items : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export default async function HomePage() {
  const latestPosts = await fetchLatestBlogPosts();
  return <HomePageClient latestPosts={latestPosts} />;
}
