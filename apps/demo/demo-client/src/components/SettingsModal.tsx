import { useEffect, useRef, useState } from "react";

interface Props {
  serverUrl: string;
  onClose: () => void;
}

type Status = "idle" | "loading" | "success" | "error";

export default function SettingsModal({ serverUrl, onClose }: Props) {
  const [publicKey, setPublicKey]       = useState("");
  const [signingSecret, setSigningSecret] = useState("");
  const [status, setStatus]             = useState<Status>("idle");
  const [message, setMessage]           = useState("");
  const [activeKey, setActiveKey]       = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Fetch currently active key from /api/health on mount
  useEffect(() => {
    fetch(`${serverUrl}/api/health`)
      .then((r) => r.json())
      .then((d) => setActiveKey(d.activePublicKey ?? null))
      .catch(() => setActiveKey(null));
  }, [serverUrl]);

  // Close on overlay click
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publicKey.trim() || !signingSecret.trim()) return;

    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch(`${serverUrl}/api/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicKey: publicKey.trim(), signingSecret: signingSecret.trim() }),
      });

      const data = await res.json();

      if (res.ok) {
        setActiveKey(data.activePublicKey ?? publicKey.trim());
        setStatus("success");
        setMessage("SDK keys updated successfully! The server will use these keys for all future requests.");
        setPublicKey("");
        setSigningSecret("");
      } else {
        setStatus("error");
        setMessage(data.message ?? "Something went wrong.");
      }
    } catch {
      setStatus("error");
      setMessage("Could not reach the demo server. Is it running on " + serverUrl + "?");
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "#0e0e0e",
    border: "1px solid #2a2a2a",
    borderRadius: 8,
    padding: "11px 14px",
    color: "#f0f0f0",
    fontFamily: "var(--mono, monospace)",
    fontSize: 13,
    outline: "none",
    transition: "border-color 0.2s",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    color: "#666",
    fontSize: 11,
    fontFamily: "var(--mono, monospace)",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 1,
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      style={{
        position: "fixed", inset: 0, zIndex: 3000,
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
        animation: "fadeIn 0.15s ease",
      }}
    >
      <div
        style={{
          width: "100%", maxWidth: 480,
          background: "#131313",
          border: "1px solid #252525",
          borderRadius: 14,
          boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
          animation: "slide-up 0.25s ease both",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 24px",
          borderBottom: "1px solid #1e1e1e",
        }}>
          <div>
            <div style={{ fontFamily: "var(--mono, monospace)", fontSize: 10, color: "#00e676", letterSpacing: 3, marginBottom: 4 }}>
              FLASHENGINE
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.5 }}>
              Server SDK Keys
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close settings"
            style={{
              background: "none", border: "1px solid #2a2a2a",
              borderRadius: 6, padding: "6px 10px",
              color: "#555", cursor: "pointer", fontSize: 16,
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#fff"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#444"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#555"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#2a2a2a"; }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "24px" }}>
          {/* Active key badge */}
          <div style={{
            background: "#0d1a0d",
            border: "1px solid #1a3a1a",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 24,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: activeKey ? "#00e676" : "#ff5252",
              flexShrink: 0,
              boxShadow: activeKey ? "0 0 6px #00e676" : "0 0 6px #ff5252",
            }} />
            <div>
              <div style={{ fontSize: 11, color: "#555", fontFamily: "var(--mono, monospace)", marginBottom: 2 }}>
                ACTIVE PUBLIC KEY
              </div>
              <div style={{
                fontFamily: "var(--mono, monospace)",
                fontSize: 12,
                color: activeKey ? "#00e676" : "#ff5252",
                wordBreak: "break-all",
              }}>
                {activeKey
                  ? activeKey.length > 40 ? activeKey.slice(0, 40) + "…" : activeKey
                  : "Not set — enter keys below"}
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 18 }}>
              <label htmlFor="settings-public-key" style={labelStyle}>Public Key</label>
              <input
                id="settings-public-key"
                type="text"
                value={publicKey}
                onChange={(e) => setPublicKey(e.target.value)}
                placeholder="pk_live_..."
                autoComplete="off"
                style={inputStyle}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#00e67644")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "#2a2a2a")}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label htmlFor="settings-signing-secret" style={labelStyle}>Signing Secret</label>
              <input
                id="settings-signing-secret"
                type="password"
                value={signingSecret}
                onChange={(e) => setSigningSecret(e.target.value)}
                placeholder="••••••••••••••••"
                autoComplete="new-password"
                style={inputStyle}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#00e67644")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "#2a2a2a")}
              />
            </div>

            {/* Feedback */}
            {status === "success" && (
              <div style={{
                background: "#0d1f13", border: "1px solid #1a4027",
                borderRadius: 8, padding: "12px 14px",
                marginBottom: 18, display: "flex", gap: 10, alignItems: "flex-start",
              }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>✅</span>
                <span style={{ fontFamily: "var(--mono, monospace)", fontSize: 12, color: "#4caf50", lineHeight: 1.5 }}>
                  {message}
                </span>
              </div>
            )}
            {status === "error" && (
              <div style={{
                background: "#1f0d0d", border: "1px solid #401a1a",
                borderRadius: 8, padding: "12px 14px",
                marginBottom: 18, display: "flex", gap: 10, alignItems: "flex-start",
              }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>❌</span>
                <span style={{ fontFamily: "var(--mono, monospace)", fontSize: 12, color: "#ff5252", lineHeight: 1.5 }}>
                  {message}
                </span>
              </div>
            )}

            <button
              type="submit"
              disabled={!publicKey.trim() || !signingSecret.trim() || status === "loading"}
              style={{
                width: "100%",
                background: (publicKey.trim() && signingSecret.trim() && status !== "loading")
                  ? "#00e676" : "#1c1c1c",
                color: (publicKey.trim() && signingSecret.trim() && status !== "loading")
                  ? "#000" : "#444",
                border: "none",
                fontWeight: 700,
                fontSize: 14,
                padding: "13px",
                borderRadius: 8,
                cursor: (publicKey.trim() && signingSecret.trim() && status !== "loading")
                  ? "pointer" : "not-allowed",
                transition: "all 0.2s",
                letterSpacing: 1,
                textTransform: "uppercase" as const,
                fontFamily: "var(--mono, monospace)",
              }}
            >
              {status === "loading" ? "Updating…" : "Update Keys →"}
            </button>
          </form>

          <p style={{
            marginTop: 16, marginBottom: 0,
            fontFamily: "var(--mono, monospace)", fontSize: 11, color: "#444",
            textAlign: "center", lineHeight: 1.6,
          }}>
            Keys are stored in memory only — no restart required.<br />
            Changes take effect immediately on the next request.
          </p>
        </div>
      </div>
    </div>
  );
}
