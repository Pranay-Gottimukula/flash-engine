import { useState } from "react";
import type { Config } from "../lib/types";

interface Props {
  initial: Config;
  onSave: (c: Config) => void;
}

export default function ConfigForm({ initial, onSave }: Props) {
  const [cfg, setCfg] = useState(initial);

  const field = (label: string, key: keyof Config, placeholder: string) => (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", color: "#888", fontSize: 11, fontFamily: "var(--mono)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
        {label}
      </label>
      <input
        value={cfg[key]}
        onChange={(e) => setCfg({ ...cfg, [key]: e.target.value })}
        placeholder={placeholder}
        style={{
          width: "100%",
          background: "#161616",
          border: "1px solid #2a2a2a",
          borderRadius: 6,
          padding: "10px 14px",
          color: "#f0f0f0",
          fontFamily: "var(--mono)",
          fontSize: 13,
        }}
      />
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 500, animation: "slide-up 0.4s ease both" }}>
        {/* Logo */}
        <div style={{ marginBottom: 32, textAlign: "center" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "#00e676", letterSpacing: 4, marginBottom: 8 }}>
            FLASHENGINE
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: -1 }}>
            Demo Configuration
          </div>
          <div style={{ color: "#555", marginTop: 8, fontSize: 14 }}>
            Configure your event connection to start the demo
          </div>
        </div>

        <div style={{ background: "#141414", border: "1px solid #2a2a2a", borderRadius: 12, padding: 28 }}>
          {field("Engine Gateway URL", "engineUrl", "http://localhost:3000")}
          {field("Demo Server URL", "serverUrl", "http://localhost:4000")}
          {field("Event Public Key", "publicKey", "pk_live_...")}

          <div style={{ background: "#0d1f15", border: "1px solid #1a3d26", borderRadius: 6, padding: "10px 14px", marginBottom: 20, fontSize: 12, color: "#4caf50" }}>
            💡 Paste your <strong>?pk=</strong> link from the dashboard to auto-fill the public key
          </div>

          <button
            onClick={() => onSave(cfg)}
            disabled={!cfg.publicKey}
            style={{
              width: "100%",
              background: cfg.publicKey ? "#00e676" : "#1c1c1c",
              color: cfg.publicKey ? "#000" : "#444",
              fontWeight: 700,
              fontSize: 15,
              padding: "14px",
              borderRadius: 8,
              cursor: cfg.publicKey ? "pointer" : "not-allowed",
              transition: "all 0.2s",
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            Launch Demo Store →
          </button>
        </div>
      </div>
    </div>
  );
}
