import { useEffect, useRef, useState } from "react";
import { fetchQueueInfo } from "../lib/api";
import type { Config, QueueInfo } from "../lib/types";

interface Props {
  config: Config;
  onJoin: () => void;
  expiredMessage?: string | null;
}

export default function ProductPage({ config, onJoin, expiredMessage }: Props) {
  const [info, setInfo] = useState<QueueInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const retryRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const doFetch = () =>
    fetchQueueInfo(config.engineUrl, config.publicKey)
      .then(setInfo)
      .catch(() => null)
      .finally(() => setLoading(false));

  useEffect(() => {
    doFetch();
    return () => { if (retryRef.current) clearInterval(retryRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  // Auto-retry every 10 s when PAUSED
  useEffect(() => {
    if (info?.status === "PAUSED") {
      retryRef.current = setInterval(doFetch, 10_000);
    } else {
      if (retryRef.current) { clearInterval(retryRef.current); retryRef.current = null; }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info?.status]);

  const wait = info ? Math.round((info.estimatedWaitMs ?? 0) / 1000) : null;

  // ── Non-active event states ───────────────────────────────────────────────
  if (!loading && info?.status && info.status !== "ACTIVE") {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", padding: 32, paddingBottom: 220,
        animation: "fade-in 0.4s ease both",
      }}>
        <nav style={{ position: "fixed", top: 0, left: 0, right: 0, padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #1c1c1c", background: "#0a0a0a" }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "#00e676", letterSpacing: 4 }}>FLASH<span style={{ color: "#555" }}>ENGINE</span></span>
          <span style={{ fontSize: 12, color: "#555" }}>DEMO STORE</span>
        </nav>

        {info.status === "PENDING" && (
          <EventGate
            icon="🔒"
            title="Sale Not Started"
            body="This sale hasn't started yet. Check back soon."
            color="#ffd600"
          />
        )}
        {info.status === "ENDED" && (
          <EventGate
            icon="🏁"
            title="Sale Ended"
            body="This sale has ended. All items have been claimed."
            color="#555"
            muted
          />
        )}
        {info.status === "PAUSED" && (
          <EventGate
            icon="⏸"
            title="Temporarily Paused"
            body="This sale is temporarily paused. Please wait — we'll check for updates automatically."
            color="#ffd600"
            extra={
              <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "#444", marginTop: 16 }}>
                Auto-retrying every 10s
                <span style={{ animation: "blink 1s infinite" }}>_</span>
              </div>
            }
          />
        )}
      </div>
    );
  }

  // ── Normal product page ───────────────────────────────────────────────────
  return (
    <div style={{ paddingBottom: 220 }}>
      {/* Nav */}
      <nav style={{ padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #1c1c1c" }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "#00e676", letterSpacing: 4 }}>FLASH<span style={{ color: "#555" }}>ENGINE</span></span>
        <span style={{ fontSize: 12, color: "#555" }}>DEMO STORE</span>
      </nav>

      {/* Expired / error banner */}
      {expiredMessage && (
        <div style={{
          background: "#1a0808", border: "1px solid #ff174433", borderRadius: 8,
          padding: "12px 20px", margin: "16px 32px 0",
          fontFamily: "var(--mono)", fontSize: 13, color: "#ff6b6b",
          display: "flex", alignItems: "center", gap: 10,
          animation: "slide-up 0.3s ease both",
        }}>
          <span>⚠</span>
          <span>{expiredMessage}</span>
        </div>
      )}

      {/* Hero */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 32px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}>
        {/* Shoe image placeholder */}
        <div style={{ position: "relative", aspectRatio: "1", borderRadius: 16, overflow: "hidden", background: "linear-gradient(135deg, #0d1f15 0%, #001a2e 50%, #1a0d1f 100%)" }}>
          <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(0,230,118,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,230,118,0.06) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 100, filter: "drop-shadow(0 0 40px rgba(0,230,118,0.3))", lineHeight: 1 }}>👟</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "#00e676", letterSpacing: 6, opacity: 0.6 }}>FLASH-X1</div>
          </div>
          <div style={{ position: "absolute", top: 16, right: 16, background: "#00e676", color: "#000", fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 4, letterSpacing: 2 }}>LIMITED</div>
          <div style={{ position: "absolute", left: 0, right: 0, height: 2, background: "linear-gradient(90deg, transparent, rgba(0,230,118,0.4), transparent)", animation: "scan-line 3s linear infinite", pointerEvents: "none" }} />
        </div>

        {/* Product info */}
        <div style={{ animation: "slide-up 0.5s ease both" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "#00e676", letterSpacing: 4, marginBottom: 12 }}>LIMITED DROP / 2025</div>
          <h1 style={{ fontSize: 52, fontWeight: 900, letterSpacing: -2, lineHeight: 1, marginBottom: 8 }}>FLASH-X1</h1>
          <h2 style={{ fontSize: 20, fontWeight: 300, color: "#888", marginBottom: 28, letterSpacing: 1 }}>Limited Edition</h2>

          <div style={{ fontSize: 42, fontWeight: 900, color: "#00e676", marginBottom: 8, fontFamily: "var(--mono)" }}>$249</div>

          {loading ? (
            <div style={{ color: "#555", fontFamily: "var(--mono)", fontSize: 13, marginBottom: 28 }}>
              Loading availability<span style={{ animation: "blink 1s infinite" }}>_</span>
            </div>
          ) : info ? (
            <div style={{ marginBottom: 28 }}>
              <div style={{ color: info.stock > 0 ? "#00e676" : "#ff1744", fontFamily: "var(--mono)", fontSize: 13, marginBottom: 4 }}>
                {info.stock > 0 ? `● ${info.stock} pairs remaining` : "● SOLD OUT"}
              </div>
              {info.queueLength > 0 && (
                <div style={{ color: "#555", fontFamily: "var(--mono)", fontSize: 12 }}>
                  {info.queueLength} in queue · est. {wait}s wait
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: "#ff5722", fontFamily: "var(--mono)", fontSize: 12, marginBottom: 28 }}>⚠ Could not reach engine</div>
          )}

          {/* Size selector (decorative) */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 12, color: "#555", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Size (US)</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["7", "8", "9", "10", "11", "12"].map((s) => (
                <div key={s} style={{ width: 44, height: 44, border: s === "10" ? "2px solid #00e676" : "1px solid #2a2a2a", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: s === "10" ? 700 : 400, cursor: "pointer", color: s === "10" ? "#00e676" : "#555" }}>{s}</div>
              ))}
            </div>
          </div>

          <button
            onClick={onJoin}
            disabled={info?.stock === 0 || loading}
            style={{
              width: "100%", padding: "18px 32px",
              background: (info?.stock === 0 || loading) ? "#1c1c1c" : "#00e676",
              color: (info?.stock === 0 || loading) ? "#444" : "#000",
              fontWeight: 900, fontSize: 16, borderRadius: 10,
              letterSpacing: 2, textTransform: "uppercase",
              cursor: (info?.stock === 0 || loading) ? "not-allowed" : "pointer",
              animation: (info?.stock === 0 || loading) ? "none" : "pulse-glow 2s infinite",
              transition: "all 0.2s",
            }}
          >
            {info?.stock === 0 ? "Sold Out" : "⚡ Join the Queue"}
          </button>

          <div style={{ marginTop: 12, textAlign: "center", fontFamily: "var(--mono)", fontSize: 11, color: "#555" }}>
            Protected by FlashEngine · No overselling · Fair queue
          </div>
        </div>
      </div>

      {/* How it works */}
      <div style={{ maxWidth: 1100, margin: "0 auto 64px", padding: "0 32px" }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "#555", letterSpacing: 4, textTransform: "uppercase", marginBottom: 28, textAlign: "center" }}>How it works</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          {[
            { n: "01", title: "Join the Queue", body: "Click the button and enter the virtual waiting line. Your spot is secured instantly." },
            { n: "02", title: "Wait Your Turn", body: "Fair, first-come-first-served order. Watch your position drop in real time." },
            { n: "03", title: "Checkout", body: "When it's your turn you get a cryptographically signed purchase token. 15 minutes to complete." },
          ].map(({ n, title, body }) => (
            <div key={n} style={{ background: "#141414", border: "1px solid #1c1c1c", borderRadius: 12, padding: 24 }}>
              <div style={{ fontFamily: "var(--mono)", fontSize: 32, fontWeight: 700, color: "#1c1c1c", marginBottom: 12 }}>{n}</div>
              <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 15 }}>{title}</div>
              <div style={{ color: "#555", fontSize: 13, lineHeight: 1.6 }}>{body}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EventGate({
  icon, title, body, color, muted = false, extra,
}: {
  icon: string;
  title: string;
  body: string;
  color: string;
  muted?: boolean;
  extra?: React.ReactNode;
}) {
  return (
    <div style={{ textAlign: "center", maxWidth: 440 }}>
      <div style={{ fontSize: 64, marginBottom: 20, filter: muted ? "grayscale(1)" : "none", opacity: muted ? 0.3 : 1 }}>{icon}</div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 11, color, letterSpacing: 4, marginBottom: 10, textTransform: "uppercase" }}>FLASH-X1 DROP</div>
      <h1 style={{ fontSize: 32, fontWeight: 900, marginBottom: 12, color: muted ? "#333" : undefined }}>{title}</h1>
      <p style={{ color: "#555", fontSize: 15, lineHeight: 1.7 }}>{body}</p>
      {extra}
    </div>
  );
}
