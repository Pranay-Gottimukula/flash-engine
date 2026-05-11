interface Props { onReset: () => void; }

export default function SoldOut({ onReset }: Props) {
  return (
    <div style={{ minHeight: "calc(100vh - 220px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 32, paddingBottom: 220 }}>
      <div style={{ textAlign: "center", animation: "fade-in 0.5s ease both" }}>
        <div style={{ fontSize: 80, marginBottom: 24, filter: "grayscale(1)", opacity: 0.4 }}>👟</div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "#555", letterSpacing: 6, marginBottom: 12 }}>
          DROP ENDED
        </div>
        <h1 style={{ fontSize: 64, fontWeight: 900, color: "#2a2a2a", letterSpacing: -2, marginBottom: 12 }}>
          SOLD OUT
        </h1>
        <p style={{ color: "#444", fontSize: 16, maxWidth: 360, margin: "0 auto 32px", lineHeight: 1.7 }}>
          All pairs have been claimed. FlashEngine protected the store from overselling — every winner got a fair shot.
        </p>
        <button
          onClick={onReset}
          style={{
            padding: "12px 28px", background: "#141414", color: "#555",
            borderRadius: 8, border: "1px solid #2a2a2a", fontSize: 13,
            fontWeight: 600, cursor: "pointer",
          }}
        >
          ← Back to Product
        </button>
      </div>
    </div>
  );
}
