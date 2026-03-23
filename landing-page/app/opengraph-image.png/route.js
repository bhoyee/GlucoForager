import { ImageResponse } from "next/og";

export const runtime = "edge";

const size = { width: 1200, height: 630 };

function arrayBufferToBase64(arrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(arrayBuffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export async function GET(request) {
  let logoDataUrl = "";
  try {
    const logoResponse = await fetch(new URL("/images/logo.png", request.url), {
      cache: "force-cache",
    });
    if (logoResponse.ok) {
      const logoBuffer = await logoResponse.arrayBuffer();
      logoDataUrl = `data:image/png;base64,${arrayBufferToBase64(logoBuffer)}`;
    }
  } catch {
    // Ignore and fall back to text mark.
  }

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
            display: "flex",
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
              backgroundColor: "rgba(255,255,255,0.96)",
              border: "1px solid rgba(6, 32, 24, 0.14)",
              boxShadow: "0 10px 24px rgba(6, 32, 24, 0.18)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {logoDataUrl ? (
              <img
                alt="GlucoForager"
                src={logoDataUrl}
                width={56}
                height={56}
                style={{ display: "flex", objectFit: "contain" }}
              />
            ) : (
              <div style={{ display: "flex", fontWeight: 900, fontSize: 30, color: "#0f766e" }}>GF</div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontSize: 56,
                fontWeight: 900,
                color: "#062018",
                lineHeight: 1.05,
              }}
            >
              GlucoForager
            </div>
            <div style={{ display: "flex", fontSize: 26, fontWeight: 800, color: "rgba(6, 32, 24, 0.86)" }}>
              Your daily diabetes food assistant
            </div>
          </div>
        </div>

        <div style={{ position: "relative", marginTop: 18, maxWidth: 980, display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 30,
              lineHeight: 1.35,
              color: "rgba(6, 32, 24, 0.92)",
              fontWeight: 700,
            }}
          >
            Stop guessing what to eat. Scan ingredients or type what you have to get meal ideas, smarter swaps, and a daily
            plan for steadier blood sugar.
          </div>
        </div>

        <div style={{ position: "relative", display: "flex", gap: 14, flexWrap: "wrap", marginTop: 28 }}>
          {["Ingredient scan", "Meal ideas", "Food swaps", "Daily plan", "Habits & tips"].map((label) => (
            <div
              key={label}
              style={{
                display: "flex",
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
          <div style={{ display: "flex" }}>glucoforager.com</div>
          <div style={{ display: "flex" }}>iOS + Android</div>
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

