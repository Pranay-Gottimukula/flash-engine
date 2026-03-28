"use client";

import { useState, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { api } from "@/lib/api";
import { motion } from "framer-motion";
import { Upload, X, ImageIcon, ArrowLeft, Zap } from "lucide-react";
import Link from "next/link";

export default function NewProductPage() {
  const { user } = useAuth();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: "",
    description: "",
    original_mrp: "",
    discount_price: "",
    stock_qty: "",
    estimated_demand: "",
    status: "DRAFT",
    sale_starts_at: "",
  });
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  const handleFile = (file: File) => {
    setImage(file);
    setPreview(URL.createObjectURL(file));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v) fd.append(k, v); });
      if (image) fd.append("image", image);

      await api.upload("/api/products", fd);
      router.push("/seller/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create product");
    } finally {
      setLoading(false);
    }
  };

  const discount = form.original_mrp && form.discount_price
    ? Math.round((1 - Number(form.discount_price) / Number(form.original_mrp)) * 100)
    : 0;

  return (
    <div style={{ minHeight: "100vh" }}>
      <Navbar />
      <div className="page-container" style={{ paddingTop: "2rem", paddingBottom: "4rem", maxWidth: "860px" }}>
        <div style={{ marginBottom: "1.5rem" }}>
          <Link href="/seller/dashboard" style={{ textDecoration: "none" }}>
            <button className="btn-ghost" style={{ padding: "0.4rem 0.75rem", fontSize: "0.8125rem", marginBottom: "1rem" }}>
              <ArrowLeft size={14} /> Back to Dashboard
            </button>
          </Link>
          <h1 className="gradient-text" style={{ fontSize: "2rem", fontWeight: 800 }}>
            Create Flash Sale
          </h1>
          <p style={{ color: "var(--foreground-muted)", marginTop: "0.25rem" }}>
            Configure your product for the next drop
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "1.5rem" }}>
            {/* Left column */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {error && (
                <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "var(--radius-md)", padding: "0.75rem 1rem", color: "#ef4444", fontSize: "0.875rem" }}>
                  {error}
                </div>
              )}

              <div className="card" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <h3 style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--foreground-muted)", marginBottom: "0.25rem" }}>
                  PRODUCT DETAILS
                </h3>

                <div>
                  <label className="label">Product Name *</label>
                  <input className="input" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Nike Air Max 2025" required />
                </div>

                <div>
                  <label className="label">Description *</label>
                  <textarea
                    className="input"
                    value={form.description}
                    onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Describe your product..."
                    rows={4}
                    required
                    style={{ resize: "vertical" }}
                  />
                </div>
              </div>

              <div className="card" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <h3 style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--foreground-muted)", marginBottom: "0.25rem" }}>
                  PRICING & STOCK
                </h3>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div>
                    <label className="label">Original MRP (₹) *</label>
                    <input className="input" type="number" min="0" step="0.01" value={form.original_mrp} onChange={(e) => setForm((p) => ({ ...p, original_mrp: e.target.value }))} placeholder="0.00" required />
                  </div>
                  <div>
                    <label className="label">Sale Price (₹) *</label>
                    <div style={{ position: "relative" }}>
                      <input className="input" type="number" min="0" step="0.01" value={form.discount_price} onChange={(e) => setForm((p) => ({ ...p, discount_price: e.target.value }))} placeholder="0.00" required style={{ paddingRight: discount > 0 ? "4.5rem" : undefined }} />
                      {discount > 0 && (
                        <span style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", fontSize: "0.75rem", fontWeight: 700, color: "#10b981", background: "rgba(16,185,129,0.1)", padding: "2px 6px", borderRadius: "var(--radius-full)" }}>
                          -{discount}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="label">Total Stock (units) *</label>
                    <input className="input" type="number" min="1" value={form.stock_qty} onChange={(e) => setForm((p) => ({ ...p, stock_qty: e.target.value }))} placeholder="100" required />
                  </div>
                  <div>
                    <label className="label">Estimated Demand</label>
                    <input className="input" type="number" min="0" value={form.estimated_demand} onChange={(e) => setForm((p) => ({ ...p, estimated_demand: e.target.value }))} placeholder="500" />
                  </div>
                </div>
              </div>

              <div className="card" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <h3 style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--foreground-muted)", marginBottom: "0.25rem" }}>
                  SALE SCHEDULE
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div>
                    <label className="label">Sale Starts At</label>
                    <input className="input" type="datetime-local" value={form.sale_starts_at} onChange={(e) => setForm((p) => ({ ...p, sale_starts_at: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Initial Status</label>
                    <select
                      className="input"
                      value={form.status}
                      onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                      style={{ cursor: "pointer" }}
                    >
                      <option value="DRAFT">Draft</option>
                      <option value="UPCOMING">Upcoming</option>
                      <option value="ACTIVE">Active</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Right column — image + submit */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {/* Image Upload */}
              <div className="card" style={{ padding: "1.5rem" }}>
                <h3 style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--foreground-muted)", marginBottom: "1rem" }}>
                  PRODUCT IMAGE
                </h3>
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onClick={() => fileRef.current?.click()}
                  style={{
                    border: `2px dashed ${dragging ? "var(--accent)" : preview ? "var(--border)" : "var(--border)"}`,
                    borderRadius: "var(--radius-lg)",
                    background: dragging ? "var(--accent-subtle)" : "var(--background-elevated)",
                    height: preview ? "auto" : "200px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  {preview ? (
                    <>
                      <img src={preview} alt="Preview" style={{ width: "100%", height: "240px", objectFit: "cover" }} />
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setImage(null); setPreview(null); }}
                        style={{ position: "absolute", top: "0.5rem", right: "0.5rem", background: "rgba(0,0,0,0.7)", border: "none", borderRadius: "50%", padding: "0.25rem", cursor: "pointer", color: "white", display: "flex" }}
                      >
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <Upload size={28} style={{ color: "var(--foreground-subtle)", marginBottom: "0.75rem" }} />
                      <p style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--foreground-muted)" }}>Drop image here</p>
                      <p style={{ fontSize: "0.75rem", color: "var(--foreground-subtle)", marginTop: "0.25rem" }}>or click to browse</p>
                      <p style={{ fontSize: "0.7rem", color: "var(--foreground-subtle)", marginTop: "0.5rem" }}>JPEG, PNG, WebP · Max 5MB</p>
                    </>
                  )}
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                </div>
              </div>

              {/* Submit */}
              <div className="card" style={{ padding: "1.5rem" }}>
                <button
                  className="btn-primary"
                  type="submit"
                  disabled={loading}
                  style={{ width: "100%", justifyContent: "center", padding: "0.875rem" }}
                >
                  {loading ? (
                    <><div className="spinner" style={{ width: 16, height: 16 }} /> Publishing...</>
                  ) : (
                    <><Zap size={16} /> Create Flash Sale</>
                  )}
                </button>
                <p style={{ fontSize: "0.75rem", color: "var(--foreground-subtle)", textAlign: "center", marginTop: "0.75rem" }}>
                  {form.status === "DRAFT" ? "Saved as draft — won't be visible to customers." : "Will be immediately visible to customers."}
                </p>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
