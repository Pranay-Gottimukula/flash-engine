"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { api } from "@/lib/api";
import { Order } from "@/types";
import { motion } from "framer-motion";
import { ListOrdered, Package, MapPin, CheckCircle, Clock, XCircle } from "lucide-react";

function OrderStatusIcon({ status }: { status: Order["status"] }) {
  if (status === "COMPLETED") return <CheckCircle size={18} style={{ color: "#10b981" }} />;
  if (status === "FAILED") return <XCircle size={18} style={{ color: "#ef4444" }} />;
  return <Clock size={18} style={{ color: "#f59e0b" }} />;
}

export default function OrdersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && (!user || user.role !== "CUSTOMER")) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (user?.role === "CUSTOMER") {
      api.get<Order[]>("/api/orders/my").then((o) => {
        setOrders(o);
        setFetching(false);
      });
    }
  }, [user]);

  if (loading || fetching) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="spinner" style={{ width: 32, height: 32 }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      <Navbar />
      <div className="page-container" style={{ paddingTop: "2rem", paddingBottom: "4rem", maxWidth: "800px" }}>
        <div style={{ marginBottom: "2rem" }}>
          <h1 className="gradient-text" style={{ fontSize: "2rem", fontWeight: 800, marginBottom: "0.25rem" }}>
            My Orders
          </h1>
          <p style={{ color: "var(--foreground-muted)" }}>
            {orders.length} order{orders.length !== 1 ? "s" : ""} placed
          </p>
        </div>

        {orders.length === 0 ? (
          <div style={{ textAlign: "center", padding: "4rem", color: "var(--foreground-muted)" }}>
            <ListOrdered size={48} style={{ margin: "0 auto 1rem", opacity: 0.3 }} />
            <p style={{ fontWeight: 600 }}>No orders yet</p>
            <p style={{ fontSize: "0.875rem", marginTop: "0.25rem" }}>Jump on a flash sale to place your first order!</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {orders.map((order, i) => (
              <motion.div
                key={order.id}
                className="card"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                style={{ padding: "1.25rem 1.5rem" }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <OrderStatusIcon status={order.status} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "0.9375rem" }}>
                        Order #{order.id.slice(0, 8).toUpperCase()}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--foreground-muted)" }}>
                        {new Date(order.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="gradient-text-sale" style={{ fontWeight: 800, fontSize: "1.1rem" }}>
                      ₹{Number(order.total_amount).toLocaleString("en-IN")}
                    </div>
                    <span className={`badge badge-${order.status.toLowerCase()}`}>
                      {order.status}
                    </span>
                  </div>
                </div>

                <hr className="divider" style={{ marginBottom: "1rem" }} />

                {/* Items */}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1rem" }}>
                  {order.items.map((item) => (
                    <div key={item.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <div style={{ width: 40, height: 40, borderRadius: "var(--radius-sm)", background: "var(--background-elevated)", overflow: "hidden", border: "1px solid var(--border)", flexShrink: 0 }}>
                        {item.product?.image_url ? (
                          <img src={item.product.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Package size={16} style={{ color: "var(--foreground-subtle)" }} />
                          </div>
                        )}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "0.875rem", fontWeight: 600 }}>{item.product?.name || "Product"}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--foreground-muted)" }}>
                          Qty: {item.quantity} · Locked @ ₹{Number(item.locked_price).toLocaleString("en-IN")}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Shipping */}
                {order.shipping_address && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.625rem 0.875rem", background: "var(--background-elevated)", borderRadius: "var(--radius-md)", fontSize: "0.8rem", color: "var(--foreground-muted)" }}>
                    <MapPin size={13} style={{ flexShrink: 0 }} />
                    {order.shipping_address.street_address}, {order.shipping_address.city}, {order.shipping_address.state} {order.shipping_address.zip_code}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
