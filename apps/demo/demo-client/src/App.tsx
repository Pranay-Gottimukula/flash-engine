import { useEffect, useRef, useState } from "react";
import {
  joinQueue,
  getUserId,
  loadQueueState,
  saveQueueState,
  clearQueueState,
} from "./lib/api";
import type { AppState, Config } from "./lib/types";

import ConfigForm from "./components/ConfigForm";
import ProductPage from "./components/ProductPage";
import QueuePage from "./components/QueuePage";
import CheckoutPage from "./components/CheckoutPage";
import OrderConfirmed from "./components/OrderConfirmed";
import SoldOut from "./components/SoldOut";
import Released from "./components/Released";
import DebugConsole from "./components/DebugConsole";

function getInitialConfig(): Config {
  const params = new URLSearchParams(window.location.search);
  return {
    engineUrl:
      params.get("engine") ??
      (import.meta.env.VITE_ENGINE_API_URL as string | undefined) ??
      "http://localhost:3000",
    serverUrl:
      params.get("server") ??
      (import.meta.env.VITE_DEMO_SERVER_URL as string | undefined) ??
      "http://localhost:4000",
    publicKey:
      params.get("pk") ??
      (import.meta.env.VITE_EVENT_PUBLIC_KEY as string | undefined) ??
      "",
  };
}

export default function App() {
  const [config, setConfig] = useState<Config>(getInitialConfig);
  const [state, setState] = useState<AppState>(
    getInitialConfig().publicKey ? "product" : "config"
  );
  const [userId] = useState(getUserId);
  const [token, setToken] = useState("");
  const [orderId, setOrderId] = useState("");
  const [releaseData, setReleaseData] = useState<unknown>(null);
  const [queuePos, setQueuePos] = useState(0);
  const [queueWaitMs, setQueueWaitMs] = useState(0);
  const [expiredMessage, setExpiredMessage] = useState<string | null>(null);
  const [multiTabWarning, setMultiTabWarning] = useState(false);
  const channelRef = useRef<BroadcastChannel | null>(null);

  // Update URL when pk is known
  useEffect(() => {
    if (config.publicKey) {
      const url = new URL(window.location.href);
      url.searchParams.set("pk", config.publicKey);
      window.history.replaceState({}, "", url.toString());
    }
  }, [config.publicKey]);

  // ── Multi-tab detection via BroadcastChannel ──────────────────────────────
  useEffect(() => {
    if (!("BroadcastChannel" in window)) return;
    const ch = new BroadcastChannel("flash_demo_tab");
    channelRef.current = ch;
    let dismissed = false;

    ch.onmessage = (e: MessageEvent) => {
      if (e.data === "tab_opened" && !dismissed) {
        setMultiTabWarning(true);
      }
      if (e.data === "tab_dismissed") {
        dismissed = true;
        setMultiTabWarning(false);
      }
    };

    ch.postMessage("tab_opened");
    return () => ch.close();
  }, []);

  // ── Resume from localStorage (refresh mid-queue / mid-checkout) ───────────
  useEffect(() => {
    if (!config.publicKey) return;
    const saved = loadQueueState();
    if (!saved || saved.pk !== config.publicKey) return;

    if (saved.status === "queued") {
      // Resume polling — position unknown until first poll
      setQueuePos(saved.position ?? 1);
      setQueueWaitMs(5000);
      setState("queue");
    } else if (saved.status === "won_checkout" && saved.token) {
      setToken(saved.token);
      setState("checkout");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only once on mount

  const handleSaveConfig = (c: Config) => {
    setConfig(c);
    setState("product");
  };

  const handleJoin = async () => {
    setExpiredMessage(null);
    const { result, status } = await joinQueue(config.engineUrl, config.publicKey, userId);

    if (status === 200 && result.token) {
      saveQueueState({ pk: config.publicKey, status: "won_checkout", token: result.token });
      setToken(result.token);
      setState("checkout");
      return;
    }
    if (result.status === "SOLD_OUT") {
      setState("soldout");
      return;
    }
    if (result.status === "QUEUED") {
      const pos = result.position ?? 1;
      const waitMs = result.estimatedWaitMs ?? 5000;
      setQueuePos(pos);
      setQueueWaitMs(waitMs);
      saveQueueState({ pk: config.publicKey, status: "queued", position: pos });
      setState("queue");
    }
  };

  const handleWon = (t: string) => {
    saveQueueState({ pk: config.publicKey, status: "won_checkout", token: t });
    setToken(t);
    setState("checkout");
  };

  const handleConfirmed = (id: string, t: string) => {
    clearQueueState();
    setOrderId(id);
    setToken(t);
    setState("confirmed");
  };

  const handleReleased = (data: unknown) => {
    clearQueueState();
    setReleaseData(data);
    setState("released");
  };

  const handleExpired = () => {
    clearQueueState();
    setToken("");
    setExpiredMessage("Your reservation expired. Please rejoin the queue.");
    setState("product");
  };

  const handleReset = () => {
    clearQueueState();
    setExpiredMessage(null);
    setState("product");
    setToken("");
    setOrderId("");
    setReleaseData(null);
  };

  const handleResetDemo = () => {
    localStorage.removeItem("flash_user_id");
    clearQueueState();
    window.location.reload();
  };

  const dismissMultiTabWarning = () => {
    setMultiTabWarning(false);
    channelRef.current?.postMessage("tab_dismissed");
  };

  return (
    <>
      {/* ── Multi-tab warning ─────────────────────────────────────────────── */}
      {multiTabWarning && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 2000,
          background: "#1a1000", borderBottom: "1px solid #ffd60033",
          padding: "10px 20px", display: "flex", alignItems: "center", gap: 12,
        }}>
          <span style={{ fontSize: 16 }}>⚠️</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "#ffd600", flex: 1 }}>
            Another tab has the demo open with the same user ID. Running in multiple tabs may cause duplicate queue entries.
          </span>
          <button
            onClick={dismissMultiTabWarning}
            style={{ background: "none", border: "1px solid #ffd60044", borderRadius: 4, padding: "4px 10px", color: "#ffd600", cursor: "pointer", fontSize: 11, fontFamily: "var(--mono)" }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Reset Demo button (always visible) ───────────────────────────── */}
      {state !== "config" && (
        <button
          onClick={handleResetDemo}
          title="Clear localStorage and reload"
          style={{
            position: "fixed", top: multiTabWarning ? 52 : 12, right: 16, zIndex: 1500,
            background: "#1c1c1c", border: "1px solid #2a2a2a",
            borderRadius: 6, padding: "6px 12px",
            fontFamily: "var(--mono)", fontSize: 11, color: "#555",
            cursor: "pointer", transition: "all 0.2s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#ff1744"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#ff174444"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#555"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#2a2a2a"; }}
        >
          ↺ Reset Demo
        </button>
      )}

      {/* ── Page states ───────────────────────────────────────────────────── */}
      {state === "config" && (
        <ConfigForm initial={config} onSave={handleSaveConfig} />
      )}
      {state === "product" && (
        <ProductPage
          config={config}
          onJoin={handleJoin}
          expiredMessage={expiredMessage}
        />
      )}
      {state === "queue" && (
        <QueuePage
          config={config}
          userId={userId}
          initialPosition={queuePos}
          initialWaitMs={queueWaitMs}
          onWon={handleWon}
          onSoldOut={() => setState("soldout")}
        />
      )}
      {state === "checkout" && token && (
        <CheckoutPage
          config={config}
          token={token}
          userId={userId}
          onConfirmed={handleConfirmed}
          onReleased={handleReleased}
          onExpired={handleExpired}
        />
      )}
      {state === "confirmed" && (
        <OrderConfirmed
          config={config}
          orderId={orderId}
          token={token}
          userId={userId}
          onReset={handleReset}
        />
      )}
      {state === "soldout" && <SoldOut onReset={handleReset} />}
      {state === "released" && (
        <Released releaseData={releaseData} onReset={handleReset} />
      )}

      <DebugConsole />
    </>
  );
}
