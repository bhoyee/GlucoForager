import { ImageResponse } from "next/og";

export const runtime = "edge";

const size = { width: 1200, height: 630 };

export async function GET() {
  const image = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 72,
          background:
            "linear-gradient(135deg, rgba(13,148,136,1) 0%, rgba(16,185,129,1) 45%, rgba(6,182,212,1) 100%)",
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
              "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.55), rgba(255,255,255,0) 55%)",
            opacity: 0.65,
          }}
        />

        <div style={{ position: "relative", display: "flex", gap: 18, alignItems: "center" }}>
          <div
            style={{
              width: 68,
              height: 68,
              borderRadius: 18,
              backgroundColor: "rgba(255,255,255,0.16)",
              border: "1px solid rgba(255,255,255,0.22)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontWeight: 900,
              fontSize: 30,
            }}
          >
            GF
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 54, fontWeight: 900, color: "#062018", lineHeight: 1.05 }}>
              GlucoForager
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, color: "rgba(6, 32, 24, 0.85)" }}>
              Diabetes-friendly recipes in 60 seconds
            </div>
          </div>
        </div>

        <div style={{ position: "relative", marginTop: 28, maxWidth: 920 }}>
          <div style={{ fontSize: 28, lineHeight: 1.35, color: "rgba(6, 32, 24, 0.9)" }}>
            Snap ingredients, get low-glycemic meal ideas, and plan smarter - built for Type 2 Diabetes.
          </div>
        </div>

        <div style={{ position: "relative", marginTop: 44, display: "flex", gap: 14, flexWrap: "wrap" }}>
          {["Low glycemic", "Ingredient scan", "Meal planning", "Nutrition-aware", "Blog tips"].map((label) => (
            <div
              key={label}
              style={{
                padding: "10px 14px",
                borderRadius: 999,
                backgroundColor: "rgba(255,255,255,0.22)",
                border: "1px solid rgba(255,255,255,0.26)",
                fontSize: 18,
                fontWeight: 700,
                color: "rgba(6, 32, 24, 0.92)",
              }}
            >
              {label}
            </div>
          ))}
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 40,
            left: 72,
            right: 72,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            color: "rgba(6, 32, 24, 0.75)",
            fontSize: 20,
            fontWeight: 700,
          }}
        >
          <div>glucoforager.com</div>
          <div>iOS • Android</div>
        </div>
      </div>
    ),
    size
  );

  const buffer = await image.arrayBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(buffer.byteLength),
      "Cache-Control": "public, immutable, no-transform, max-age=31536000",
    },
  });
}
