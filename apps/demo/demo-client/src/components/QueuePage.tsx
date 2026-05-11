import { useEffect, useRef, useState } from "react";
import { pollStatus, saveQueueState } from "../lib/api";
import type { Config } from "../lib/types";

interface Props {
  config: Config;
  userId: string;
  initialPosition: number;
  initialWaitMs: number;
  onWon: (token: string) => void;
  onSoldOut: () => void;
}

export default function QueuePage({ config, userId, initialPosition, initialWaitMs, onWon, onSoldOut }: Props) {
  const [position, setPosition] = useState(initialPosition);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTs = useRef(Date.now());

  // Elapsed ticker
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTs.current) / 1000));
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  // Poll for status
  useEffect(() => {
    const poll = async () => {
      const { result } = await pollStatus(config.engineUrl, config.publicKey, userId);
      if (result.status === "WON" && result.token) {
        if (pollRef.current) clearInterval(pollRef.current);
        onWon(result.token);
      } else if (result.status === "SOLD_OUT") {
        if (pollRef.current) clearInterval(pollRef.current);
        onSoldOut();
      } else if (result.status === "QUEUED" && result.position !== undefined) {
        setPosition(result.position);
        saveQueueState({ pk: config.publicKey, status: "queued", position: result.position });
      }
    };
    pollRef.current = setInterval(poll, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [config, userId, onWon, onSoldOut]);

  const estSec = Math.max(0, Math.round(initialWaitMs / 1000) - elapsed);

  return (
    <div style={{ minHeight: "calc(100vh - 220px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 32, paddingBottom: 220 }}>
      <div style={{ width: "100%", maxWidth: 520, textAlign: "center", animation: "slide-up 0.4s ease both" }}>
        {/* Badge */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#0d1f15", border: "1px solid #1a3d26", borderRadius: 100, padding: "6px 16px", marginBottom: 32 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#00e676", display: "inline-block", animation: "pulse-glow 1.5s infinite" }} />
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "#00e676", letterSpacing: 2 }}>IN QUEUE</span>
        </div>

        {/* Position */}
        <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: "#555", letterSpacing: 4, marginBottom: 8, textTransform: "uppercase" }}>
          Your position
        </div>
        <div style={{ fontSize: 96, fontWeight: 900, lineHeight: 1, color: "#00e676", fontFamily: "var(--mono)", marginBottom: 4 }}>
          #{position}
        </div>
        <div style={{ color: "#555", fontSize: 14, marginBottom: 40 }}>
          in line · est. <span style={{ color: "#ffd600", fontFamily: "var(--mono)" }}>{estSec}s</span> remaining
        </div>

        {/* Animated dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 40 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{
              width: 10, height: 10, borderRadius: "50%",
              background: "#00e676",
              animation: `dot-bounce 1.4s ease-in-out ${i * 0.16}s infinite`,
            }} />
          ))}
        </div>

        {/* Progress bar */}
        <div style={{ background: "#141414", borderRadius: 100, height: 4, marginBottom: 40, overflow: "hidden" }}>
          <div style={{
            height: "100%",
            background: "linear-gradient(90deg, #00e676, #40c4ff)",
            borderRadius: 100,
            width: `${Math.max(4, Math.min(95, (elapsed / (initialWaitMs / 1000)) * 100))}%`,
            transition: "width 2s ease",
          }} />
        </div>

        {/* Info cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, textAlign: "left" }}>
          <div style={{ background: "#141414", border: "1px solid #1c1c1c", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "#555", marginBottom: 4 }}>USER ID</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{userId}</div>
          </div>
          <div style={{ background: "#141414", border: "1px solid #1c1c1c", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "#555", marginBottom: 4 }}>ELAPSED</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 18, color: "#ffd600", fontWeight: 700 }}>{elapsed}s</div>
          </div>
        </div>

        <div style={{ marginTop: 24, fontFamily: "var(--mono)", fontSize: 11, color: "#333" }}>
          Polling every 2s · Do not close this tab
        </div>
      </div>
    </div>
  );
}
