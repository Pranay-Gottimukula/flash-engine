import { useState } from "react";
import { checkout } from "../lib/api";
import type { Config } from "../lib/types";

interface Props {
  config: Config;
  orderId: string;
  token: string;
  userId: string;
  onReset: () => void;
}

export default function OrderConfirmed({ config, orderId, token, userId, onReset }: Props) {
  const [doubleSpend, setDoubleSpend] = useState<{ tried: boolean; blocked: boolean } | null>(null);
  const [loading, setLoading] = useState(false);

  const tryAgain = async () => {
    setLoading(true);
    const { status } = await checkout(config.serverUrl, token, userId);
    setLoading(false);
    setDoubleSpend({ tried: true, blocked: status === 409 });
  };

  return (
    <div style={{ minHeight: "calc(100vh - 220px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 32, paddingBottom: 220 }}>
      <div style={{ width: "100%", maxWidth: 560, animation: "slide-up 0.4s ease both" }}>
        {/* Success card */}
        <div style={{
          background: "linear-gradient(135deg, #0d1f15, #001a0d)",
          border: "1px solid #1a3d26", borderRadius: 16, padding: "40px 36px",
          textAlign: "center", marginBottom: 20,
        }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "#00e676", letterSpacing: 4, marginBottom: 8 }}>ORDER CONFIRMED</div>
          <div style={{ fontSize: 32, fontWeight: 900, marginBottom: 4 }}>{orderId}</div>
          <div style={{ color: "#888", fontSize: 14, marginBottom: 24 }}>
            Token verified and redeemed on the server. Your order is confirmed.
          </div>

          <div style={{ background: "#0d0d0d", borderRadius: 10, padding: "14px 20px", textAlign: "left", marginBottom: 24 }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "#555", marginBottom: 8 }}>VERIFY RESPONSE</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "#00e676" }}>
              {"{"} "status": 200, "valid": true, "redeemed": true {"}"}
            </div>
          </div>

          <div style={{ fontSize: 13, color: "#555" }}>
            The JWT was RS256-verified and the JTI was committed to the database (double-spend shield active)
          </div>
        </div>

        {/* Double-spend demo */}
        {!doubleSpend?.tried ? (
          <div style={{ background: "#141414", border: "1px solid #2a2a2a", borderRadius: 12, padding: "20px 24px", marginBottom: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>🔒 Test Double-Spend Protection</div>
            <div style={{ color: "#555", fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
              Try to buy again with the same token. The engine should block it with a 409.
            </div>
            <button
              onClick={tryAgain}
              disabled={loading}
              style={{
                width: "100%", padding: "12px",
                background: "#1c1c1c", color: "#888",
                fontWeight: 600, fontSize: 13, borderRadius: 8,
                border: "1px solid #2a2a2a", cursor: loading ? "not-allowed" : "pointer",
                textTransform: "uppercase", letterSpacing: 1,
              }}
            >
              {loading ? "Sending…" : "Try to buy again with same token →"}
            </button>
          </div>
        ) : (
          <div style={{
            background: doubleSpend.blocked ? "#0d1f15" : "#1f0d0d",
            border: `1px solid ${doubleSpend.blocked ? "#1a3d26" : "#3d1a1a"}`,
            borderRadius: 12, padding: "20px 24px", marginBottom: 16, textAlign: "center",
          }}>
            {doubleSpend.blocked ? (
              <>
                <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 13, color: "#00e676", fontWeight: 700, marginBottom: 4 }}>
                  TOKEN_ALREADY_USED — Double-spend prevented!
                </div>
                <div style={{ color: "#888", fontSize: 13 }}>
                  409 returned. The JTI primary-key constraint in the database blocked the duplicate redemption.
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 13, color: "#ffd600", fontWeight: 700, marginBottom: 4 }}>
                  Unexpected: token was accepted again
                </div>
                <div style={{ color: "#888", fontSize: 13 }}>The double-spend shield did not fire.</div>
              </>
            )}
          </div>
        )}

        <button
          onClick={onReset}
          style={{
            width: "100%", padding: "14px",
            background: "transparent", color: "#555",
            fontWeight: 600, fontSize: 13, borderRadius: 8,
            border: "1px solid #2a2a2a", cursor: "pointer",
          }}
        >
          ← Return to Product Page
        </button>
      </div>
    </div>
  );
}
