import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "SignalBridge — turn alert noise into one clear incident";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#35275F",
          padding: "72px 80px",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 720,
            height: 560,
            borderRadius: 400,
            background: "#8B5CF63A",
            filter: "blur(90px)",
            top: -160,
            right: -120,
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 520,
            height: 420,
            borderRadius: 400,
            background: "#D77BE836",
            filter: "blur(90px)",
            bottom: -180,
            left: -80,
            display: "flex",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "linear-gradient(135deg,#7C5CF0,#D77BE8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: 22,
              fontWeight: 700,
            }}
          >
            SB
          </div>
          <div style={{ fontSize: 26, fontWeight: 600, color: "#F6F1FF", letterSpacing: -0.6 }}>
            SignalBridge
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 18,
              color: "#CDC3EE",
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          >
            <div style={{ width: 22, height: 2, background: "linear-gradient(135deg,#7C5CF0,#D77BE8)", display: "flex" }} />
            Webhook ingestion · correlation · incident response
          </div>
          <div
            style={{
              fontSize: 76,
              lineHeight: 1.04,
              letterSpacing: -3,
              fontWeight: 600,
              color: "#F6F1FF",
              maxWidth: 940,
              display: "flex",
              flexWrap: "wrap",
            }}
          >
            Turn alert noise into one clear incident.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 26, fontSize: 19, color: "#CDC3EE" }}>
            <span>Signed webhooks</span>
            <span style={{ color: "#6E5CB0" }}>|</span>
            <span>Incident correlation</span>
            <span style={{ color: "#6E5CB0" }}>|</span>
            <span>Operator workflows</span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 18px",
              borderRadius: 999,
              background: "#44357F",
              border: "1px solid #5D4D9C",
              fontSize: 17,
              color: "#F6F1FF",
            }}
          >
            <div style={{ width: 8, height: 8, borderRadius: 8, background: "#7DDFB0", display: "flex" }} />
            Never lose a signal
          </div>
        </div>
      </div>
    ),
    size,
  );
}
