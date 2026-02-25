import { ImageResponse } from "next/og";

export const runtime = "edge";

export const size = {
  width: 1200,
  height: 600,
};

export const contentType = "image/png";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";

const stripHtml = (value) =>
  String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export default async function BlogPostTwitterImage({ params }) {
  let title = "GlucoForager Blog";
  let description = "Diabetes-friendly cooking tips and low-glycemic recipes.";

  try {
    const response = await fetch(`${API_URL}/api/blog/posts/${encodeURIComponent(params.slug)}`, {
      next: { revalidate: 60 },
    });
    if (response.ok) {
      const post = await response.json();
      title = stripHtml(post?.title) || title;
      description = stripHtml(post?.excerpt) || stripHtml(post?.title) || description;
    }
  } catch {
    // ignore
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 68,
          background:
            "linear-gradient(135deg, rgba(13,148,136,1) 0%, rgba(16,185,129,1) 55%, rgba(6,182,212,1) 100%)",
          position: "relative",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 25% 25%, rgba(255,255,255,0.55), rgba(255,255,255,0) 62%)",
            opacity: 0.7,
          }}
        />

        <div style={{ position: "relative", display: "flex", gap: 18, alignItems: "center" }}>
          <div
            style={{
              width: 58,
              height: 58,
              borderRadius: 14,
              backgroundColor: "rgba(255,255,255,0.16)",
              border: "1px solid rgba(255,255,255,0.22)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontWeight: 900,
              fontSize: 24,
            }}
          >
            GF
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: "rgba(6, 32, 24, 0.92)" }}>
              GlucoForager Blog
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "rgba(6, 32, 24, 0.75)" }}>
              glucoforager.com
            </div>
          </div>
        </div>

        <div style={{ position: "relative", marginTop: 24, maxWidth: 1040 }}>
          <div style={{ fontSize: 50, fontWeight: 900, lineHeight: 1.08, color: "#062018" }}>
            {title}
          </div>
        </div>

        <div style={{ position: "relative", marginTop: 18, maxWidth: 1040 }}>
          <div style={{ fontSize: 26, lineHeight: 1.35, color: "rgba(6, 32, 24, 0.88)" }}>
            {description}
          </div>
        </div>
      </div>
    ),
    size
  );
}

