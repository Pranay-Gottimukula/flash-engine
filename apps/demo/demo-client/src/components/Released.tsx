interface Props {
  releaseData: unknown;
  onReset: () => void;
}

export default function Released({ releaseData, onReset }: Props) {
  return (
    <div style={{ minHeight: "calc(100vh - 220px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 32, paddingBottom: 220 }}>
      <div style={{ width: "100%", maxWidth: 520, animation: "slide-up 0.4s ease both" }}>
        <div style={{
          background: "#1a1000", border: "1px solid #3d2a00", borderRadius: 16,
          padding: "36px 32px", textAlign: "center", marginBottom: 20,
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>↩️</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "#ffd600", letterSpacing: 4, marginBottom: 8 }}>
            PAYMENT FAILED
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 900, marginBottom: 12 }}>Your spot has been released</h2>
          <p style={{ color: "#888", fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
            Stock returned to the pool. The next person in the queue will get your spot. The engine incremented stock atomically via Redis.
          </p>

          <div style={{ background: "#0d0d0d", borderRadius: 10, padding: "14px 20px", textAlign: "left" }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "#555", marginBottom: 8 }}>RELEASE RESPONSE</div>
            <pre style={{ fontFamily: "var(--mono)", fontSize: 12, color: "#ffd600", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              {JSON.stringify(releaseData, null, 2)}
            </pre>
          </div>
        </div>

        <button
          onClick={onReset}
          style={{
            width: "100%", padding: "14px",
            background: "#00e676", color: "#000",
            fontWeight: 700, fontSize: 14, borderRadius: 8, cursor: "pointer",
            textTransform: "uppercase", letterSpacing: 1,
          }}
        >
          ← Return to Product Page
        </button>
      </div>
    </div>
  );
}
