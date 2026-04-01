import HomePageClient from "../components/HomePageClient";

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "http://localhost:8010";

async function fetchLatestBlogPosts() {
  try {
    const res = await fetch(`${API_URL}/api/blog/posts?page=1&page_size=4`, {
      // Cache for a bit, but keep it fresh enough for discovery/indexing.
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    return Array.isArray(data?.items) ? data.items : [];
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const latestPosts = await fetchLatestBlogPosts();
  return <HomePageClient latestPosts={latestPosts} />;
}

