import { useEffect, useRef, useState } from "react";
import { checkout, releasePurchase, decodeToken } from "../lib/api";
import type { Config } from "../lib/types";

interface Props {
  config: Config;
  token: string;
  userId: string;
  onConfirmed: (orderId: string, token: string) => void;
  onReleased: (releaseData: unknown) => void;
  onExpired: () => void;
}

function Confetti() {
  const colors = ["#00e676", "#40c4ff", "#ffd600", "#ff6d00", "#ea80fc"];
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 999 }}>
      {Array.from({ length: 40 }).map((_, i) => (
        <div key={i} style={{
          position: "absolute",
          left: `${Math.random() * 100}%`,
          top: "-20px",
          width: `${4 + Math.random() * 8}px`,
          height: `${8 + Math.random() * 12}px`,
          background: colors[Math.floor(Math.random() * colors.length)],
          borderRadius: 2,
          animation: `confetti-fall ${2 + Math.random() * 2}s ${Math.random() * 1.5}s ease-in forwards`,
          transform: `rotate(${Math.random() * 360}deg)`,
        }} />
      ))}
    </div>
  );
}

function timerColor(sec: number): string {
  if (sec === 0) return "#ff1744";
  if (sec < 60) return "#ff1744";
  if (sec < 300) return "#ffd600";
  return "#00e676";
}

function timerBg(sec: number): string {
  if (sec === 0) return "rgba(255,23,68,0.15)";
  if (sec < 60) return "rgba(255,23,68,0.10)";
  if (sec < 300) return "rgba(255,214,0,0.08)";
  return "rgba(0,230,118,0.08)";
}

function timerBorder(sec: number): string {
  if (sec < 60) return "#ff174433";
  if (sec < 300) return "#ffd60033";
  return "#1a3d26";
}

export default function CheckoutPage({ config, token, userId, onConfirmed, onReleased, onExpired }: Props) {
  const { jti, exp } = decodeToken(token);
  const [secondsLeft, setSecondsLeft] = useState(Math.max(0, exp - Math.floor(Date.now() / 1000)));
  const [debugOpen, setDebugOpen] = useState(false);
  const [loading, setLoading] = useState<"buy" | "fail" | null>(null);
  const [showConfetti, setShowConfetti] = useState(true);
  const [serverError, setServerError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setShowConfetti(false), 3500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const isExpired = secondsLeft === 0;
  const mm = isExpired ? "00" : String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = isExpired ? "00" : String(secondsLeft % 60).padStart(2, "0");
  const color = timerColor(secondsLeft);
  const veryUrgent = secondsLeft < 60 && !isExpired;

  const handleBuy = async () => {
    if (isExpired) { onExpired(); return; }
    setServerError(null);
    setLoading("buy");
    const { result, status } = await checkout(config.serverUrl, token, userId);
    setLoading(null);

    if (result.error === "SERVER_OFFLINE") {
      setServerError("Demo server not running. Start it with:\ncd apps/demo/demo-server && npm run dev");
      return;
    }
    if (status === 400 && result.error === "INVALID_TOKEN") {
      onExpired();
      return;
    }
    if (result.orderId) {
      onConfirmed(result.orderId, token);
      return;
    }
    if (status !== 200) {
      setServerError(result.message ?? result.error ?? `Checkout failed (HTTP ${status})`);
    }
  };

  const handleFail = async () => {
    setServerError(null);
    setLoading("fail");
    const { result, status } = await releasePurchase(config.serverUrl, jti, "PAYMENT_FAILED");
    setLoading(null);

    if ((result as { error?: string }).error === "SERVER_OFFLINE") {
      setServerError("Demo server not running. Start it with:\ncd apps/demo/demo-server && npm run dev");
      return;
    }
    if (status !== 200) {
      const r = result as { message?: string; error?: string };
      setServerError(r.message ?? r.error ?? `Release failed (HTTP ${status}) — check engine logs`);
      return;
    }
    onReleased(result);
  };

  return (
    <div style={{ paddingBottom: 220 }}>
      {showConfetti && <Confetti />}

      {/* ── Countdown bar ───────────────────────────────────────────────── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 10,
        background: timerBg(secondsLeft),
        borderBottom: `1px solid ${timerBorder(secondsLeft)}`,
        padding: "10px 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        transition: "background 1s ease, border-color 1s ease",
      }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 12, color, transition: "color 1s ease" }}>
          ⏱ Time remaining
        </span>
        {isExpired ? (
          <span style={{ fontFamily: "var(--mono)", fontSize: 28, fontWeight: 700, color: "#ff1744", animation: "celebrate-pulse 0.8s infinite" }}>
            EXPIRED
          </span>
        ) : (
          <span style={{
            fontFamily: "var(--mono)", fontSize: 28, fontWeight: 700,
            color,
            animation: veryUrgent ? "celebrate-pulse 0.6s infinite" : "none",
            transition: "color 1s ease",
          }}>
            {mm}:{ss}
          </span>
        )}
        <span style={{ fontSize: 12, color: "#555" }}>
          {isExpired ? "Reservation expired" : "Item reserved for you"}
        </span>
      </div>

      {/* ── Expired overlay ─────────────────────────────────────────────── */}
      {isExpired && (
        <div style={{
          margin: "24px auto", maxWidth: 700, padding: "0 24px",
          animation: "slide-up 0.3s ease both",
        }}>
          <div style={{
            background: "#1a0808", border: "1px solid #ff174433", borderRadius: 12,
            padding: "28px 32px", textAlign: "center",
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⏰</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#ff1744", marginBottom: 8 }}>
              Reservation Expired
            </div>
            <div style={{ color: "#888", fontSize: 14, marginBottom: 20 }}>
              Your 20-minute window has passed. Click below to rejoin the queue.
            </div>
            <button
              onClick={onExpired}
              style={{ padding: "12px 28px", background: "#00e676", color: "#000", fontWeight: 700, borderRadius: 8, cursor: "pointer", fontSize: 14, textTransform: "uppercase", letterSpacing: 1 }}
            >
              Rejoin the Queue
            </button>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 700, margin: "40px auto", padding: "0 24px" }}>
        {/* Won banner */}
        {!isExpired && (
          <div style={{
            background: "linear-gradient(135deg, #0d1f15, #001a0d)",
            border: "1px solid #1a3d26", borderRadius: 16, padding: "28px 32px", marginBottom: 24,
            textAlign: "center", animation: "celebrate-pulse 0.6s ease both",
          }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🎉</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: "#00e676", marginBottom: 4 }}>You're in!</div>
            <div style={{ color: "#888", fontSize: 14 }}>Complete your purchase before the timer runs out</div>
          </div>
        )}

        {/* Server offline error */}
        {serverError && (
          <div style={{
            background: "#0d0808", border: "1px solid #ff174433", borderRadius: 10,
            padding: "14px 18px", marginBottom: 20,
            animation: "slide-up 0.3s ease both",
          }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "#ff6b6b", marginBottom: 6, fontWeight: 700 }}>
              ⚡ Demo Server Offline
            </div>
            <pre style={{ fontFamily: "var(--mono)", fontSize: 12, color: "#888", margin: 0, whiteSpace: "pre-wrap" }}>
              {serverError}
            </pre>
          </div>
        )}

        {/* Debug token panel */}
        <div style={{ background: "#141414", border: "1px solid #2a2a2a", borderRadius: 12, marginBottom: 24, overflow: "hidden" }}>
          <button
            onClick={() => setDebugOpen((o) => !o)}
            style={{ width: "100%", padding: "12px 20px", background: "transparent", border: "none", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontFamily: "var(--mono)", fontSize: 12, color: "#555" }}
          >
            <span>🔑 Purchase Token Debug</span>
            <span>{debugOpen ? "▲" : "▼"}</span>
          </button>
          {debugOpen && (
            <div style={{ padding: "4px 20px 16px", borderTop: "1px solid #2a2a2a" }}>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: "#555", marginBottom: 4, fontFamily: "var(--mono)" }}>JWT (preview)</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "#40c4ff", wordBreak: "break-all" }}>{token.slice(0, 40)}...</div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: "#555", marginBottom: 4, fontFamily: "var(--mono)" }}>JTI</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "#ffd600" }}>{jti}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#555", marginBottom: 4, fontFamily: "var(--mono)" }}>EXPIRES</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: isExpired ? "#ff1744" : "#888" }}>
                  {new Date(exp * 1000).toLocaleTimeString()} · {isExpired ? "EXPIRED" : `${mm}:${ss} remaining`}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Fake checkout form */}
        <div style={{ background: "#141414", border: "1px solid #2a2a2a", borderRadius: 12, padding: 28, marginBottom: 24, opacity: isExpired ? 0.4 : 1, transition: "opacity 0.5s" }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Order Details</div>
          <div style={{ display: "flex", gap: 16, marginBottom: 20, padding: "16px", background: "#0d0d0d", borderRadius: 10, alignItems: "center" }}>
            <div style={{ fontSize: 32 }}>👟</div>
            <div>
              <div style={{ fontWeight: 700 }}>FLASH-X1 Limited Edition</div>
              <div style={{ color: "#555", fontSize: 13 }}>US Size 10 · Black/Green</div>
            </div>
            <div style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 20, fontWeight: 700, color: "#00e676" }}>$249</div>
          </div>
          {[
            { label: "Name", value: "Alex Johnson" },
            { label: "Email", value: "alex@example.com" },
            { label: "Card", value: "**** **** **** 4242" },
            { label: "Expiry", value: "12/28" },
          ].map(({ label, value }) => (
            <div key={label} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: "#555", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1, fontFamily: "var(--mono)" }}>{label}</div>
              <input readOnly value={value} style={{ width: "100%", background: "#0d0d0d", border: "1px solid #2a2a2a", borderRadius: 6, padding: "10px 14px", color: "#555", fontSize: 14, cursor: "not-allowed" }} />
            </div>
          ))}
        </div>

        {/* Buttons */}
        {!isExpired && (
          <>
            <button
              onClick={handleBuy}
              disabled={loading !== null}
              style={{
                width: "100%", padding: "18px", marginBottom: 12,
                background: loading === "buy" ? "#0d1f15" : "#00e676",
                color: loading === "buy" ? "#00e676" : "#000",
                fontWeight: 900, fontSize: 16, borderRadius: 10,
                letterSpacing: 2, textTransform: "uppercase",
                cursor: loading ? "not-allowed" : "pointer",
                border: loading === "buy" ? "1px solid #00e676" : "none",
                transition: "all 0.2s",
              }}
            >
              {loading === "buy" ? "Processing payment…" : "✓ Complete Purchase"}
            </button>
            <button
              onClick={handleFail}
              disabled={loading !== null}
              style={{
                width: "100%", padding: "12px",
                background: "transparent",
                color: loading === "fail" ? "#ff1744" : "#ff174488",
                fontWeight: 600, fontSize: 13, borderRadius: 10,
                letterSpacing: 1, textTransform: "uppercase",
                cursor: loading ? "not-allowed" : "pointer",
                border: `1px solid ${loading === "fail" ? "#ff1744" : "#ff174433"}`,
                transition: "all 0.2s",
              }}
            >
              {loading === "fail" ? "Releasing spot…" : "Simulate Payment Failure"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
