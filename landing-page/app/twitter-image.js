import { ImageResponse } from "next/og";

export const runtime = "edge";

export const size = {
  width: 1200,
  height: 600,
};

export const contentType = "image/png";

export default function TwitterImage() {
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
              "radial-gradient(circle at 25% 25%, rgba(255,255,255,0.55), rgba(255,255,255,0) 58%)",
            opacity: 0.65,
          }}
        />

        <div style={{ position: "relative", display: "flex", gap: 18, alignItems: "center" }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              backgroundColor: "rgba(255,255,255,0.16)",
              border: "1px solid rgba(255,255,255,0.22)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontWeight: 900,
              fontSize: 28,
            }}
          >
            GF
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 52, fontWeight: 900, color: "#062018", lineHeight: 1.05 }}>
              GlucoForager
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "rgba(6, 32, 24, 0.85)" }}>
              Diabetes-friendly recipes in 60 seconds
            </div>
          </div>
        </div>

        <div style={{ position: "relative", marginTop: 26, maxWidth: 960 }}>
          <div style={{ fontSize: 26, lineHeight: 1.35, color: "rgba(6, 32, 24, 0.9)" }}>
            Scan ingredients, get safe meal ideas, and learn from our blog.
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 38,
            left: 68,
            right: 68,
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
}

