"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { api } from "@/lib/api";
import { Product } from "@/types";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  Package,
  TrendingUp,
  ShoppingBag,
  Plus,
  XCircle,
  AlertTriangle,
  BarChart3,
  Eye,
} from "lucide-react";

function StatusBadge({ displayStatus }: { displayStatus: string }) {
  const map: Record<string, string> = {
    ACTIVE: "badge-active",
    UPCOMING: "badge-upcoming",
    SOLD_OUT: "badge-sold-out",
    DRAFT: "badge-draft",
    TERMINATED: "badge-terminated",
  };
  return <span className={`badge ${map[displayStatus] || "badge-draft"}`}>{displayStatus.replace("_", " ")}</span>;
}

export default function SellerDashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [fetching, setFetching] = useState(true);
  const [terminating, setTerminating] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user?.role !== "SELLER") router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (user?.role === "SELLER") {
      api.get<Product[]>("/api/products/my").then((p) => {
        setProducts(p);
        setFetching(false);
      });
    }
  }, [user]);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const hasPending = products.some(p => p.status === "UPCOMING" && p.sale_starts_at && new Date(p.sale_starts_at).getTime() > Date.now());
    if (!hasPending) return;
    
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [products]);

  const getDisplayStatus = (p: Product) => {
    if (p.status === "UPCOMING" && p.sale_starts_at && new Date(p.sale_starts_at).getTime() <= now) {
      return "ACTIVE";
    }
    return p.status;
  };

  const handleTerminate = async (id: string) => {
    if (!confirm("Are you sure? This will immediately terminate the sale.")) return;
    setTerminating(id);
    try {
      await api.patch(`/api/products/${id}/terminate`);
      setProducts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status: "TERMINATED" } : p))
      );
    } finally {
      setTerminating(null);
    }
  };

  // Analytics
  const totalOrders = products.reduce((a, p) => a + (p._count?.order_items ?? 0), 0);
  const activeCount = products.filter((p) => getDisplayStatus(p) === "ACTIVE").length;
  const upcomingCount = products.filter((p) => getDisplayStatus(p) === "UPCOMING").length;
  const revenue = products.reduce((a, p) => a + Number(p.discount_price) * (p._count?.order_items ?? 0), 0);

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
      <div className="page-container" style={{ paddingTop: "2rem", paddingBottom: "4rem" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "2rem" }}>
          <div>
            <h1 className="gradient-text" style={{ fontSize: "2rem", fontWeight: 800, marginBottom: "0.25rem" }}>
              Seller Dashboard
            </h1>
            <p style={{ color: "var(--foreground-muted)" }}>
              Welcome back, {user?.full_name}
            </p>
          </div>
          <Link href="/seller/products/new">
            <button className="btn-primary">
              <Plus size={16} />
              Create Sale
            </button>
          </Link>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
          {[
            { label: "Total Products", value: products.length, icon: <Package size={20} />, color: "var(--accent)" },
            { label: "Total Orders", value: totalOrders, icon: <ShoppingBag size={20} />, color: "#10b981" },
            { label: "Active Sales", value: activeCount, icon: <TrendingUp size={20} />, color: "#f59e0b" },
            { label: "Est. Revenue", value: `₹${revenue.toLocaleString("en-IN")}`, icon: <BarChart3 size={20} />, color: "#818cf8" },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              className="card"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              style={{ padding: "1.25rem" }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--foreground-muted)", fontWeight: 500 }}>{stat.label}</span>
                <div style={{ color: stat.color }}>{stat.icon}</div>
              </div>
              <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--foreground)" }}>
                {stat.value}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Products Table */}
        <div className="card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Package size={18} style={{ color: "var(--accent)" }} />
            <h2 style={{ fontWeight: 700, fontSize: "1rem" }}>My Products</h2>
            <span style={{ marginLeft: "auto", fontSize: "0.8rem", color: "var(--foreground-muted)" }}>
              {products.length} items
            </span>
          </div>

          {products.length === 0 ? (
            <div style={{ padding: "4rem", textAlign: "center", color: "var(--foreground-muted)" }}>
              <Package size={48} style={{ margin: "0 auto 1rem", opacity: 0.3 }} />
              <p style={{ fontWeight: 600, marginBottom: "0.5rem" }}>No products yet</p>
              <p style={{ fontSize: "0.875rem", marginBottom: "1.5rem" }}>Create your first flash sale to get started.</p>
              <Link href="/seller/products/new">
                <button className="btn-primary"><Plus size={16} /> Create Sale</button>
              </Link>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    {["Product", "Price", "Stock", "Orders", "Status", "Actions"].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "0.875rem 1.5rem",
                          textAlign: "left",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          color: "var(--foreground-muted)",
                          letterSpacing: "0.05em",
                          textTransform: "uppercase",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {products.map((product, i) => (
                    <motion.tr
                      key={product.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.05 }}
                      style={{
                        borderBottom: "1px solid var(--border-subtle)",
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--background-elevated)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                    >
                      {/* Product */}
                      <td style={{ padding: "1rem 1.5rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                          <div
                            style={{
                              width: 44,
                              height: 44,
                              borderRadius: "var(--radius-md)",
                              background: "var(--background-elevated)",
                              overflow: "hidden",
                              flexShrink: 0,
                              border: "1px solid var(--border)",
                            }}
                          >
                            {product.image_url ? (
                              <img src={product.image_url} alt={product.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            ) : (
                              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <Package size={18} style={{ color: "var(--foreground-subtle)" }} />
                              </div>
                            )}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: "0.875rem", marginBottom: "0.125rem" }}>{product.name}</div>
                            <div style={{ fontSize: "0.75rem", color: "var(--foreground-muted)" }}>
                              Demand: {product.estimated_demand}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Price */}
                      <td style={{ padding: "1rem 1.5rem" }}>
                        <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--sale)" }}>
                          ₹{Number(product.discount_price).toLocaleString("en-IN")}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--foreground-subtle)", textDecoration: "line-through" }}>
                          ₹{Number(product.original_mrp).toLocaleString("en-IN")}
                        </div>
                      </td>

                      {/* Stock */}
                      <td style={{ padding: "1rem 1.5rem" }}>
                        <span style={{ fontSize: "0.875rem", fontWeight: 600, color: product.stock_qty <= 5 ? "var(--danger)" : "var(--foreground)" }}>
                          {product.stock_qty}
                        </span>
                      </td>

                      {/* Orders */}
                      <td style={{ padding: "1rem 1.5rem" }}>
                        <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>
                          {product._count?.order_items ?? 0}
                        </span>
                      </td>

                      {/* Status */}
                      <td style={{ padding: "1rem 1.5rem" }}>
                        <StatusBadge displayStatus={getDisplayStatus(product)} />
                      </td>

                      {/* Actions */}
                      <td style={{ padding: "1rem 1.5rem" }}>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <Link href={`/seller/products/${product.id}/edit`}>
                            <button
                              className="btn-ghost"
                              style={{ padding: "0.35rem 0.75rem", fontSize: "0.75rem" }}
                            >
                              <Eye size={13} /> Edit
                            </button>
                          </Link>
                          {product.status !== "TERMINATED" && product.status !== "SOLD_OUT" && (
                            <button
                              className="btn-danger"
                              onClick={() => handleTerminate(product.id)}
                              disabled={terminating === product.id}
                              style={{ padding: "0.35rem 0.75rem", fontSize: "0.75rem" }}
                            >
                              {terminating === product.id ? (
                                <div className="spinner" style={{ width: 12, height: 12 }} />
                              ) : (
                                <XCircle size={13} />
                              )}
                              Terminate
                            </button>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
