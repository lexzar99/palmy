import { ImageResponse } from "next/og";

// Next.js genererar automatiskt /opengraph-image.png från denna fil.
// Resultatet cachas och serveras till sociala plattformar (FB, X, iMessage).
export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          backgroundColor: "#09090b",
          padding: "80px",
          position: "relative",
          fontFamily: "sans-serif",
        }}
      >
        {/* Gold gradient i högra hörnet */}
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: "60%",
            height: "100%",
            background:
              "radial-gradient(circle at 80% 30%, rgba(212,167,74,0.45) 0%, rgba(212,167,74,0.10) 40%, transparent 70%)",
            display: "flex",
          }}
        />

        {/* Innehåll */}
        <div style={{ display: "flex", flexDirection: "column", zIndex: 1 }}>
          {/* Badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              backgroundColor: "rgba(212,167,74,0.15)",
              border: "2px solid rgba(212,167,74,0.4)",
              borderRadius: "999px",
              padding: "10px 24px",
              marginBottom: "30px",
            }}
          >
            <div
              style={{
                fontSize: "20px",
                fontWeight: 900,
                color: "#d4a74a",
                textTransform: "uppercase",
                letterSpacing: "4px",
              }}
            >
              Beställningsplattform
            </div>
          </div>

          {/* Logotyp + tagline */}
          <div
            style={{
              fontSize: "180px",
              fontWeight: 900,
              color: "#ffffff",
              lineHeight: 0.9,
              letterSpacing: "-8px",
              fontStyle: "italic",
              display: "flex",
            }}
          >
            Levera<span style={{ color: "#d4a74a" }}>.</span>
          </div>

          <div
            style={{
              fontSize: "44px",
              fontWeight: 800,
              color: "rgba(255,255,255,0.9)",
              marginTop: "40px",
              maxWidth: "900px",
              lineHeight: 1.1,
              display: "flex",
            }}
          >
            Mat från dem bästa av dem bästa.
          </div>

          <div
            style={{
              fontSize: "24px",
              fontWeight: 700,
              color: "rgba(255,255,255,0.5)",
              marginTop: "30px",
              textTransform: "uppercase",
              letterSpacing: "4px",
              display: "flex",
            }}
          >
            Snabb leverans · Säker betalning · Lokala favoriter
          </div>
        </div>

        {/* Pizza-emoji i hörnet */}
        <div
          style={{
            position: "absolute",
            bottom: "60px",
            right: "100px",
            fontSize: "220px",
            opacity: 0.9,
            display: "flex",
          }}
        >
          🍕
        </div>
      </div>
    ),
    { ...size },
  );
}
