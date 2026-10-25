import { ImageResponse } from "next/og";

export const alt = "Mullwell: practice that sticks, from your own class notes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#f6f3ec", color: "#25231f", padding: 80, fontFamily: "Georgia, serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 44 }}>
          <div style={{ width: 26, height: 26, borderRadius: 999, background: "#3d7a57" }} />
          Mullwell
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 76, lineHeight: 1.1, maxWidth: 960 }}>Practice that sticks, from your own class notes.</div>
          <div style={{ fontSize: 32, color: "#5f5a51", fontFamily: "sans-serif" }}>Questions checked against your material · spaced review · test prep</div>
        </div>
      </div>
    ),
    size,
  );
}
