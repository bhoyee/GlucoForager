import { ImageResponse } from "next/og";

export const runtime = "edge";

const size = { width: 1200, height: 600 };
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.glucoforager.com";
const logoUrl = `${siteUrl.replace(/\\/+$/, "")}/images/logo.png`;

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 68,
          background:
            "linear-gradient(135deg, rgba(13,148,136,1) 0%, rgba(16,185,129,1) 50%, rgba(6,182,212,1) 100%)",
          color: "#062018",
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
              "radial-gradient(circle at 25% 25%, rgba(255,255,255,0.62), rgba(255,255,255,0) 58%)",
            opacity: 0.7,
          }}
        />

        <div style={{ position: "relative", display: "flex", gap: 18, alignItems: "center" }}>
          <div
            style={{
              width: 66,
              height: 66,
              borderRadius: 16,
              backgroundColor: "rgba(255,255,255,0.25)",
              border: "1px solid rgba(255,255,255,0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            <img alt="GlucoForager" src={logoUrl} width={52} height={52} style={{ display: "block" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 52, fontWeight: 900, color: "#062018", lineHeight: 1.05 }}>
              GlucoForager
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "rgba(6, 32, 24, 0.86)" }}>
              Diabetes-friendly recipes in 60 seconds
            </div>
          </div>
        </div>

        <div style={{ position: "relative", marginTop: 22, maxWidth: 960 }}>
          <div style={{ fontSize: 26, lineHeight: 1.35, color: "rgba(6, 32, 24, 0.92)", fontWeight: 700 }}>
            Scan ingredients, get safe meal ideas, and learn from our blog.
          </div>
        </div>

        <div
          style={{
            position: "relative",
            marginTop: 42,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            color: "rgba(6, 32, 24, 0.78)",
            fontSize: 20,
            fontWeight: 800,
          }}
        >
          <div>glucoforager.com</div>
          <div>iOS • Android</div>
        </div>
      </div>
    ),
    {
      ...size,
      headers: {
        "Cache-Control": "public, immutable, no-transform, max-age=31536000",
      },
    }
  );
}
