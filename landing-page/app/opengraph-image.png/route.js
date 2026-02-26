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
          justifyContent: "space-between",
          padding: 72,
          background:
            "linear-gradient(135deg, rgba(13,148,136,1) 0%, rgba(16,185,129,1) 40%, rgba(6,182,212,1) 100%)",
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
              "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.62), rgba(255,255,255,0) 55%)",
            opacity: 0.7,
          }}
        />

        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              backgroundColor: "rgba(255,255,255,0.25)",
              border: "1px solid rgba(255,255,255,0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 30, color: "white" }}>GF</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 56, fontWeight: 900, color: "#062018", lineHeight: 1.05 }}>
              GlucoForager
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "rgba(6, 32, 24, 0.86)" }}>
              Diabetes-friendly recipes in 60 seconds
            </div>
          </div>
        </div>

        <div style={{ position: "relative", marginTop: 18, maxWidth: 940 }}>
          <div
            style={{
              fontSize: 30,
              lineHeight: 1.35,
              color: "rgba(6, 32, 24, 0.92)",
              fontWeight: 700,
            }}
          >
            Scan ingredients, get low-glycemic meal ideas, and learn smarter habits — built for Type 2 Diabetes.
          </div>
        </div>

        <div style={{ position: "relative", display: "flex", gap: 14, flexWrap: "wrap", marginTop: 28 }}>
          {["Ingredient scan", "Low glycemic", "Meal planning", "Nutrition-aware", "Blog tips"].map((label) => (
            <div
              key={label}
              style={{
                padding: "10px 14px",
                borderRadius: 999,
                backgroundColor: "rgba(255,255,255,0.26)",
                border: "1px solid rgba(255,255,255,0.34)",
                fontSize: 18,
                fontWeight: 800,
                color: "rgba(6, 32, 24, 0.92)",
              }}
            >
              {label}
            </div>
          ))}
        </div>

        <div
          style={{
            position: "relative",
            marginTop: 44,
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

