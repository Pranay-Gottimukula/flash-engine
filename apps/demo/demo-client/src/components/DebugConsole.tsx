import { useEffect, useRef, useState } from "react";
import { subscribe } from "../lib/debug";
import type { DebugEntry } from "../lib/types";

export default function DebugConsole() {
  const [entries, setEntries] = useState<DebugEntry[]>([]);
  const [open, setOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevLenRef = useRef(0);

  useEffect(() => { const unsub = subscribe(setEntries); return () => { unsub(); }; }, []);

  // Auto-scroll to top (newest entry) on each new log line
  useEffect(() => {
    if (entries.length > prevLenRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
    prevLenRef.current = entries.length;
  }, [entries.length]);

  const catColor: Record<DebugEntry["category"], string> = {
    success: "#00e676",
    queue: "#ffd600",
    error: "#ff1744",
    info: "#40c4ff",
  };

  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 1000,
      background: "#0d0d0d", borderTop: "1px solid #2a2a2a",
      fontFamily: "var(--mono)", fontSize: 11,
    }}>
      {/* Header */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "6px 16px", background: "#111", color: "#aaa",
          cursor: "pointer", border: "none", fontFamily: "var(--mono)", fontSize: 11,
        }}
      >
        <span>
          <span style={{ color: "#00e676", marginRight: 8 }}>●</span>
          🔧 FlashEngine Debug Console
          <span style={{ color: "#555", marginLeft: 12 }}>{entries.length} calls</span>
        </span>
        <span style={{ color: "#555" }}>{open ? "▼ collapse" : "▲ expand"}</span>
      </button>

      {open && (
        <div ref={scrollRef} style={{ height: 180, overflowY: "auto", padding: "4px 0" }}>
          {entries.length === 0 ? (
            <div style={{ color: "#444", padding: "12px 16px" }}>Waiting for API calls...</div>
          ) : (
            entries.map((e) => (
              <div
                key={e.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "70px 52px 1fr 100px 60px",
                  gap: "0 12px",
                  padding: "3px 16px",
                  borderBottom: "1px solid #161616",
                  lineHeight: "1.6",
                  alignItems: "center",
                }}
              >
                <span style={{ color: "#444" }}>{e.ts}</span>
                <span style={{ color: e.method === "GET" ? "#40c4ff" : "#b388ff", fontWeight: 700 }}>
                  {e.method}
                </span>
                <span style={{ color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {e.url}
                </span>
                <span style={{ color: catColor[e.category], fontWeight: 700 }}>
                  {e.status === 0 ? "OFFLINE" : e.status}
                  {e.label ? ` ${e.label}` : ""}
                </span>
                <span style={{ color: "#555", textAlign: "right" }}>{e.ms}ms</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
