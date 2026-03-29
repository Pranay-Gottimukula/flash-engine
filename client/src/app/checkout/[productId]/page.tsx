"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter, useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Product, Address, Order } from "@/types";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Clock, CheckCircle, XCircle, MapPin, ShoppingBag, ArrowLeft, AlertTriangle } from "lucide-react";
import Link from "next/link";

// ─── Flow stages ────────────────────────────────────────────
type Stage = "queue" | "select_address" | "confirm" | "success" | "sold_out";

const PAYMENT_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

// ─── Animated Queue Screen ───────────────────────────────────
function QueueScreen({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const duration = 3000;
    const raf = setInterval(() => {
      const elapsed = Date.now() - start;
      setProgress(Math.min((elapsed / duration) * 100, 100));
      if (elapsed >= duration) {
        clearInterval(raf);
        onDone();
      }
    }, 30);
    return () => clearInterval(raf);
  }, [onDone]);

  return (
    <motion.div
      key="queue"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -30 }}
      transition={{ duration: 0.4 }}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "radial-gradient(ellipse at 50% 30%, rgba(99,102,241,0.18) 0%, transparent 65%), var(--background)",
        textAlign: "center",
        padding: "2rem",
      }}
    >
      {/* Animated Logo */}
      <motion.div
        animate={{ scale: [1, 1.08, 1], boxShadow: ["0 0 20px rgba(99,102,241,0.3)", "0 0 50px rgba(99,102,241,0.7)", "0 0 20px rgba(99,102,241,0.3)"] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        style={{
          width: 80,
          height: 80,
          background: "var(--accent)",
          borderRadius: "24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "2rem",
        }}
      >
        <Zap size={40} color="white" fill="white" />
      </motion.div>

      <h1 style={{ fontSize: "2.25rem", fontWeight: 900, marginBottom: "0.5rem", letterSpacing: "-0.03em" }}>
        Waiting in Queue
      </h1>
      <p style={{ color: "var(--foreground-muted)", marginBottom: "2.5rem", fontSize: "1rem" }}>
        Securing your spot for this exclusive drop...
      </p>

      {/* Dots */}
      <div style={{ display: "flex", gap: "0.625rem", marginBottom: "2.5rem" }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`dot-${i + 1}`}
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: "var(--accent)",
            }}
          />
        ))}
      </div>

      {/* Progress bar */}
      <div
        style={{
          width: "240px",
          height: 4,
          background: "var(--border)",
          borderRadius: "var(--radius-full)",
          overflow: "hidden",
        }}
      >
        <motion.div
          style={{
            height: "100%",
            background: "linear-gradient(90deg, var(--accent), #818cf8)",
            borderRadius: "var(--radius-full)",
            width: `${progress}%`,
          }}
        />
      </div>

      <p style={{ marginTop: "1rem", fontSize: "0.8rem", color: "var(--foreground-subtle)" }}>
        Checking stock availability...
      </p>
    </motion.div>
  );
}

// ─── Sold Out Screen ─────────────────────────────────────────
function SoldOutScreen({ productName }: { productName: string }) {
  return (
    <motion.div
      key="soldout"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        textAlign: "center",
        padding: "2rem",
      }}
    >
      <div style={{ width: 80, height: 80, background: "rgba(239,68,68,0.1)", border: "2px solid rgba(239,68,68,0.3)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1.5rem" }}>
        <XCircle size={40} style={{ color: "#ef4444" }} />
      </div>
      <h1 style={{ fontSize: "2rem", fontWeight: 900, marginBottom: "0.5rem" }}>Sold Out</h1>
      <p style={{ color: "var(--foreground-muted)", marginBottom: "2rem" }}>
        Sorry, <strong>{productName}</strong> is no longer available.
      </p>
      <Link href="/browse">
        <button className="btn-primary"><ShoppingBag size={15} /> Browse Other Drops</button>
      </Link>
    </motion.div>
  );
}

// ─── Countdown Timer ─────────────────────────────────────────
function PaymentCountdown({ expiresAt, onExpire }: { expiresAt: number; onExpire: () => void }) {
  const [ms, setMs] = useState(expiresAt - Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      const remaining = expiresAt - Date.now();
      setMs(remaining);
      if (remaining <= 0) {
        clearInterval(id);
        onExpire();
      }
    }, 500);
    return () => clearInterval(id);
  }, [expiresAt, onExpire]);

  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const isUrgent = totalSec <= 30;
  const progress = ms / PAYMENT_TIMEOUT_MS;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
      <div
        style={{
          fontSize: "3rem",
          fontWeight: 900,
          fontVariantNumeric: "tabular-nums",
          color: isUrgent ? "#ef4444" : "var(--foreground)",
          transition: "color 0.3s ease",
          letterSpacing: "-0.04em",
        }}
      >
        {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
      </div>
      {/* Arc progress bar */}
      <div style={{ width: "180px", height: 6, background: "var(--border)", borderRadius: "var(--radius-full)", overflow: "hidden" }}>
        <motion.div
          style={{
            height: "100%",
            background: isUrgent ? "#ef4444" : "linear-gradient(90deg, var(--accent), #818cf8)",
            borderRadius: "var(--radius-full)",
            width: `${progress * 100}%`,
          }}
          transition={{ duration: 0.5 }}
        />
      </div>
      <p style={{ fontSize: "0.8rem", color: isUrgent ? "#ef4444" : "var(--foreground-muted)" }}>
        {isUrgent ? "⚡ Hurry! Almost out of time!" : "Complete payment before time runs out"}
      </p>
    </div>
  );
}

// ─── Success Screen ──────────────────────────────────────────
function SuccessScreen({ order, product }: { order: Order; product: Product }) {
  return (
    <motion.div
      key="success"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 20 }}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "radial-gradient(ellipse at 50% 30%, rgba(16,185,129,0.12) 0%, transparent 60%), var(--background)",
        textAlign: "center",
        padding: "2rem",
      }}
    >
      <motion.div
        initial={{ scale: 0, rotate: -15 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.1 }}
        style={{
          width: 88,
          height: 88,
          background: "rgba(16,185,129,0.1)",
          border: "2px solid #10b981",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "1.5rem",
        }}
      >
        <CheckCircle size={44} style={{ color: "#10b981" }} />
      </motion.div>

      <h1 style={{ fontSize: "2.25rem", fontWeight: 900, marginBottom: "0.5rem", letterSpacing: "-0.03em" }}>
        Order Confirmed! 🎉
      </h1>
      <p style={{ color: "var(--foreground-muted)", marginBottom: "2rem", fontSize: "1rem" }}>
        You got it! <strong>{product.name}</strong> is yours.
      </p>

      <div
        className="card"
        style={{ padding: "1.5rem", width: "100%", maxWidth: "360px", marginBottom: "2rem", textAlign: "left" }}
      >
        <div style={{ fontSize: "0.75rem", color: "var(--foreground-muted)", marginBottom: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
          Order Summary
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
          <span style={{ fontSize: "0.875rem", color: "var(--foreground-muted)" }}>Order ID</span>
          <span style={{ fontSize: "0.875rem", fontWeight: 700 }}>#{order.id.slice(0, 8).toUpperCase()}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
          <span style={{ fontSize: "0.875rem", color: "var(--foreground-muted)" }}>Amount Paid</span>
          <span className="gradient-text-sale" style={{ fontWeight: 800 }}>₹{Number(order.total_amount).toLocaleString("en-IN")}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: "0.875rem", color: "var(--foreground-muted)" }}>Status</span>
          <span className="badge badge-completed">COMPLETED</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.75rem" }}>
        <Link href="/orders">
          <button className="btn-primary"><ShoppingBag size={15} /> View My Orders</button>
        </Link>
        <Link href="/browse">
          <button className="btn-ghost">Browse More</button>
        </Link>
      </div>
    </motion.div>
  );
}

// ─── Main Checkout Page ──────────────────────────────────────
export default function CheckoutPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const productId = params.productId as string;

  const [stage, setStage] = useState<Stage>("queue");
  const [product, setProduct] = useState<Product | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");
  const [order, setOrder] = useState<Order | null>(null);
  const [paymentDeadline, setPaymentDeadline] = useState<number>(0);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && (!user || user.role !== "CUSTOMER")) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api.get<Product>(`/api/products/${productId}`),
      api.get<Address[]>("/api/addresses"),
    ]).then(([prod, addrs]) => {
      setProduct(prod);
      setAddresses(addrs);
      const def = addrs.find((a) => a.is_default) || addrs[0];
      if (def) setSelectedAddressId(def.id);
    });
  }, [user, productId]);

  const handleQueueDone = useCallback(() => {
    if (!product) return;
    
    const isLive = product.status === "ACTIVE" || 
      (product.status === "UPCOMING" && (!product.sale_starts_at || new Date(product.sale_starts_at).getTime() <= Date.now()));

    if (product.stock_qty <= 0 || product.status === "SOLD_OUT") {
      setStage("sold_out");
    } else if (!isLive) {
      router.push("/browse");
    } else {
      setStage("select_address");
    }
  }, [product, router]);

  const handleProceedToConfirm = () => {
    if (!selectedAddressId) return;
    setPaymentDeadline(Date.now() + PAYMENT_TIMEOUT_MS);
    setStage("confirm");
  };

  const handlePay = async () => {
    if (!selectedAddressId || !product) return;
    setPaying(true);
    setError("");
    try {
      const newOrder = await api.post<Order>("/api/orders", {
        product_id: productId,
        shipping_address_id: selectedAddressId,
        quantity: 1,
      });
      // Mark as completed after "payment"
      const completed = await api.patch<Order>(`/api/orders/${newOrder.id}/complete`);
      setOrder(completed);
      setStage("success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Payment failed";
      if (msg === "SOLD_OUT") setStage("sold_out");
      else setError(msg);
    } finally {
      setPaying(false);
    }
  };

  const handleExpire = async () => {
    // On timer expiry, mark order as failed if one exists
    if (order) {
      await api.patch(`/api/orders/${order.id}/fail`).catch(() => {});
    }
    setStage("sold_out");
  };

  if (loading || !product) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="spinner" style={{ width: 32, height: 32 }} />
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {stage === "queue" && <QueueScreen key="queue" onDone={handleQueueDone} />}

      {stage === "sold_out" && <SoldOutScreen key="soldout" productName={product.name} />}

      {stage === "select_address" && (
        <motion.div
          key="address"
          initial={{ opacity: 0, x: 60 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -60 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" }}
        >
          <div style={{ width: "100%", maxWidth: "480px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "2rem" }}>
              <span className="badge badge-active" style={{ fontSize: "0.875rem", padding: "4px 12px" }}>
                You&apos;re In! ✓
              </span>
              <span style={{ color: "var(--foreground-muted)", fontSize: "0.875rem" }}>
                Stock available
              </span>
            </div>

            <h1 style={{ fontSize: "1.75rem", fontWeight: 900, marginBottom: "0.25rem" }}>
              Select Shipping Address
            </h1>
            <p style={{ color: "var(--foreground-muted)", marginBottom: "2rem" }}>
              Where should we send <strong>{product.name}</strong>?
            </p>

            {addresses.length === 0 ? (
              <div className="card" style={{ padding: "2rem", textAlign: "center", marginBottom: "1.5rem" }}>
                <MapPin size={36} style={{ margin: "0 auto 1rem", opacity: 0.3, color: "var(--foreground-muted)" }} />
                <p style={{ fontWeight: 600, marginBottom: "0.5rem" }}>No addresses saved</p>
                <p style={{ fontSize: "0.875rem", color: "var(--foreground-muted)", marginBottom: "1rem" }}>
                  Add a shipping address to continue.
                </p>
                <Link href="/profile">
                  <button className="btn-primary"><MapPin size={14} /> Add Address</button>
                </Link>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" }}>
                {addresses.map((addr) => (
                  <div
                    key={addr.id}
                    onClick={() => setSelectedAddressId(addr.id)}
                    className="card"
                    style={{
                      padding: "1rem 1.25rem",
                      cursor: "pointer",
                      border: `2px solid ${selectedAddressId === addr.id ? "var(--accent)" : "var(--border)"}`,
                      background: selectedAddressId === addr.id ? "var(--accent-subtle)" : undefined,
                      transition: "all 0.2s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <div
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          border: `2px solid ${selectedAddressId === addr.id ? "var(--accent)" : "var(--border)"}`,
                          background: selectedAddressId === addr.id ? "var(--accent)" : "transparent",
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {selectedAddressId === addr.id && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "white" }} />}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{addr.street_address}</div>
                        <div style={{ fontSize: "0.8125rem", color: "var(--foreground-muted)" }}>
                          {addr.city}, {addr.state} — {addr.zip_code}
                        </div>
                      </div>
                      {addr.is_default && (
                        <span className="badge badge-upcoming" style={{ marginLeft: "auto" }}>Default</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              className="btn-primary"
              onClick={handleProceedToConfirm}
              disabled={!selectedAddressId}
              style={{ width: "100%", justifyContent: "center", padding: "0.875rem" }}
            >
              Continue to Payment <Zap size={15} fill="white" />
            </button>
          </div>
        </motion.div>
      )}

      {stage === "confirm" && (
        <motion.div
          key="confirm"
          initial={{ opacity: 0, x: 60 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -60 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.12) 0%, transparent 60%), var(--background)",
            padding: "2rem",
          }}
        >
          <div style={{ width: "100%", maxWidth: "440px" }}>
            {/* Countdown */}
            <div
              className="card pulse-glow"
              style={{ padding: "2rem", textAlign: "center", marginBottom: "1.5rem" }}
            >
              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "1rem" }}>
                ⚡ Payment Window
              </div>
              <PaymentCountdown expiresAt={paymentDeadline} onExpire={handleExpire} />
            </div>

            {/* Order Summary */}
            <div className="card" style={{ padding: "1.5rem", marginBottom: "1.25rem" }}>
              <h2 style={{ fontWeight: 700, fontSize: "1rem", marginBottom: "1rem" }}>Order Summary</h2>
              <div style={{ display: "flex", gap: "0.875rem", marginBottom: "1rem" }}>
                <div style={{ width: 64, height: 64, borderRadius: "var(--radius-md)", background: "var(--background-elevated)", overflow: "hidden", border: "1px solid var(--border)", flexShrink: 0 }}>
                  {product.image_url ? (
                    <img src={product.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <ShoppingBag size={24} style={{ color: "var(--foreground-subtle)" }} />
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ fontWeight: 700 }}>{product.name}</div>
                  <div className="gradient-text-sale" style={{ fontWeight: 800, fontSize: "1.1rem" }}>
                    ₹{Number(product.discount_price).toLocaleString("en-IN")}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--foreground-subtle)", textDecoration: "line-through" }}>
                    MRP ₹{Number(product.original_mrp).toLocaleString("en-IN")}
                  </div>
                </div>
              </div>

              <hr className="divider" style={{ marginBottom: "0.875rem" }} />

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem", color: "var(--foreground-muted)", marginBottom: "0.375rem" }}>
                <span>Subtotal</span>
                <span>₹{Number(product.discount_price).toLocaleString("en-IN")}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem", color: "var(--foreground-muted)", marginBottom: "0.875rem" }}>
                <span>Shipping</span>
                <span style={{ color: "#10b981", fontWeight: 600 }}>FREE</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: "1.1rem" }}>
                <span>Total</span>
                <span className="gradient-text-sale">₹{Number(product.discount_price).toLocaleString("en-IN")}</span>
              </div>
            </div>

            {error && (
              <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "var(--radius-md)", padding: "0.75rem 1rem", color: "#ef4444", fontSize: "0.875rem", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <AlertTriangle size={15} /> {error}
              </div>
            )}

            <button
              className="btn-primary"
              onClick={handlePay}
              disabled={paying}
              style={{ width: "100%", justifyContent: "center", padding: "1rem", fontSize: "1rem", marginBottom: "0.75rem" }}
            >
              {paying ? (
                <><div className="spinner" style={{ width: 18, height: 18 }} /> Processing...</>
              ) : (
                <><Zap size={18} fill="white" /> Pay Now — ₹{Number(product.discount_price).toLocaleString("en-IN")}</>
              )}
            </button>

            <button
              className="btn-ghost"
              onClick={() => router.push("/browse")}
              style={{ width: "100%", justifyContent: "center" }}
            >
              <ArrowLeft size={14} /> Cancel
            </button>
          </div>
        </motion.div>
      )}

      {stage === "success" && order && <SuccessScreen key="success" order={order} product={product} />}
    </AnimatePresence>
  );
}
