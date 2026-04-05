"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter, useParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import { api } from "@/lib/api";
import { Product } from "@/types";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  ArrowLeft,
  Upload,
  Zap,
  X,
  ImageIcon,
  Save,
} from "lucide-react";

export default function EditProductPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const productId = params.id;

  const fileRef = useRef<HTMLInputElement>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [fetching, setFetching] = useState(true);

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
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Auth guard — sellers only
  useEffect(() => {
    if (!loading && user?.role !== "SELLER") router.push("/login");
  }, [user, loading, router]);

  // Fetch product
  useEffect(() => {
    if (!productId) return;
    api
      .get<Product>(`/api/products/${productId}`)
      .then((p) => {
        // Ownership check
        if (p.seller_id !== user?.id && user) {
          router.push("/seller/dashboard");
          return;
        }
        setProduct(p);
        // Convert ISO datetime to datetime-local format (strip seconds/ms)
        const saleStart = p.sale_starts_at
          ? new Date(p.sale_starts_at).toISOString().slice(0, 16)
          : "";
        setForm({
          name: p.name,
          description: p.description,
          original_mrp: p.original_mrp,
          discount_price: p.discount_price,
          stock_qty: String(p.stock_qty),
          estimated_demand: String(p.estimated_demand),
          status: p.status,
          sale_starts_at: saleStart,
        });
        if (p.image_url) setPreview(p.image_url);
      })
      .catch(() => router.push("/seller/dashboard"))
      .finally(() => setFetching(false));
  }, [productId, user, router]);

  const handleFile = (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be under 5 MB");
      return;
    }
    setImage(file);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file?.type.startsWith("image/")) handleFile(file);
  };

  const discount =
    form.original_mrp && form.discount_price
      ? Math.round(
          ((Number(form.original_mrp) - Number(form.discount_price)) /
            Number(form.original_mrp)) *
            100
        )
      : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);

    try {
      const fd = new FormData();
      fd.append("name", form.name);
      fd.append("description", form.description);
      fd.append("original_mrp", form.original_mrp);
      fd.append("discount_price", form.discount_price);
      fd.append("stock_qty", form.stock_qty);
      fd.append("estimated_demand", form.estimated_demand);
      fd.append("status", form.status);
      if (form.sale_starts_at) {
        fd.append(
          "sale_starts_at",
          new Date(form.sale_starts_at).toISOString()
        );
      }
      if (image) fd.append("image", image);

      await api.uploadPatch<Product>(`/api/products/${productId}`, fd);
      setSuccess("Product updated successfully!");
      setTimeout(() => router.push("/seller/dashboard"), 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading || fetching) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div className="spinner" style={{ width: 32, height: 32 }} />
      </div>
    );
  }

  if (!product) return null;

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)" }}>
      <Navbar />

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "2rem 1.5rem" }}>
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            marginBottom: "2rem",
          }}
        >
          <Link href="/seller/dashboard">
            <button
              className="btn-ghost"
              style={{ padding: "0.5rem 0.875rem" }}
            >
              <ArrowLeft size={16} /> Back
            </button>
          </Link>
          <div>
            <h1
              style={{
                fontSize: "1.5rem",
                fontWeight: 800,
                letterSpacing: "-0.03em",
              }}
            >
              Edit Product
            </h1>
            <p
              style={{
                color: "var(--foreground-muted)",
                fontSize: "0.875rem",
                marginTop: "0.125rem",
              }}
            >
              {product.name}
            </p>
          </div>
        </motion.div>

        {/* Alerts */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: "var(--radius-md)",
              padding: "0.75rem 1rem",
              color: "#ef4444",
              fontSize: "0.875rem",
              marginBottom: "1.5rem",
            }}
          >
            {error}
          </motion.div>
        )}

        {success && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              background: "rgba(16,185,129,0.1)",
              border: "1px solid rgba(16,185,129,0.3)",
              borderRadius: "var(--radius-md)",
              padding: "0.75rem 1rem",
              color: "#10b981",
              fontSize: "0.875rem",
              marginBottom: "1.5rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <Zap size={14} /> {success}
          </motion.div>
        )}

        <form onSubmit={handleSubmit}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 340px",
              gap: "1.5rem",
              alignItems: "start",
            }}
          >
            {/* Left — Details */}
            <div
              style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}
            >
              {/* Product Info */}
              <div
                className="card"
                style={{
                  padding: "1.5rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "1.25rem",
                }}
              >
                <h3
                  style={{
                    fontWeight: 700,
                    fontSize: "0.9rem",
                    color: "var(--foreground-muted)",
                  }}
                >
                  PRODUCT INFO
                </h3>

                <div>
                  <label className="label">Product Name *</label>
                  <input
                    className="input"
                    type="text"
                    value={form.name}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, name: e.target.value }))
                    }
                    placeholder="e.g. Nike Air Max 2025"
                    required
                  />
                </div>

                <div>
                  <label className="label">Description *</label>
                  <textarea
                    className="input"
                    value={form.description}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, description: e.target.value }))
                    }
                    placeholder="Describe your product..."
                    rows={4}
                    required
                    style={{ resize: "vertical" }}
                  />
                </div>
              </div>

              {/* Pricing & Stock */}
              <div
                className="card"
                style={{
                  padding: "1.5rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "1.25rem",
                }}
              >
                <h3
                  style={{
                    fontWeight: 700,
                    fontSize: "0.9rem",
                    color: "var(--foreground-muted)",
                  }}
                >
                  PRICING &amp; STOCK
                </h3>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "1rem",
                  }}
                >
                  <div>
                    <label className="label">Original MRP (₹) *</label>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.original_mrp}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, original_mrp: e.target.value }))
                      }
                      placeholder="0.00"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Sale Price (₹) *</label>
                    <div style={{ position: "relative" }}>
                      <input
                        className="input"
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.discount_price}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            discount_price: e.target.value,
                          }))
                        }
                        placeholder="0.00"
                        required
                        style={{
                          paddingRight: discount > 0 ? "4.5rem" : undefined,
                        }}
                      />
                      {discount > 0 && (
                        <span
                          style={{
                            position: "absolute",
                            right: "0.75rem",
                            top: "50%",
                            transform: "translateY(-50%)",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            color: "#10b981",
                            background: "rgba(16,185,129,0.1)",
                            padding: "2px 6px",
                            borderRadius: "var(--radius-full)",
                          }}
                        >
                          -{discount}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="label">Stock (units) *</label>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      value={form.stock_qty}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, stock_qty: e.target.value }))
                      }
                      placeholder="100"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Estimated Demand</label>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      value={form.estimated_demand}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          estimated_demand: e.target.value,
                        }))
                      }
                      placeholder="500"
                    />
                  </div>
                </div>
              </div>

              {/* Sale Schedule */}
              <div
                className="card"
                style={{
                  padding: "1.5rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "1.25rem",
                }}
              >
                <h3
                  style={{
                    fontWeight: 700,
                    fontSize: "0.9rem",
                    color: "var(--foreground-muted)",
                  }}
                >
                  SALE SCHEDULE &amp; STATUS
                </h3>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "1rem",
                  }}
                >
                  <div>
                    <label className="label">Sale Starts At</label>
                    <input
                      className="input"
                      type="datetime-local"
                      value={form.sale_starts_at}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          sale_starts_at: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="label">Status</label>
                    <select
                      className="input"
                      value={form.status}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, status: e.target.value }))
                      }
                      style={{ cursor: "pointer" }}
                    >
                      <option value="DRAFT">Draft</option>
                      <option value="UPCOMING">Upcoming</option>
                      <option value="ACTIVE">Active</option>
                      <option value="SOLD_OUT">Sold Out</option>
                    </select>
                  </div>
                </div>

                {/* Status guidance */}
                <p
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--foreground-subtle)",
                  }}
                >
                  {form.status === "DRAFT" &&
                    "Draft — not visible to customers."}
                  {form.status === "UPCOMING" &&
                    "Upcoming — customers can favourite and get notified."}
                  {form.status === "ACTIVE" &&
                    "Active — customers can buy now."}
                  {form.status === "SOLD_OUT" &&
                    "Sold Out — no more purchases possible."}
                </p>
              </div>
            </div>

            {/* Right — Image + Save */}
            <div
              style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}
            >
              {/* Image Upload */}
              <div className="card" style={{ padding: "1.5rem" }}>
                <h3
                  style={{
                    fontWeight: 700,
                    fontSize: "0.9rem",
                    color: "var(--foreground-muted)",
                    marginBottom: "1rem",
                  }}
                >
                  PRODUCT IMAGE
                </h3>

                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onClick={() => fileRef.current?.click()}
                  style={{
                    border: `2px dashed ${dragging ? "var(--accent)" : "var(--border)"}`,
                    borderRadius: "var(--radius-lg)",
                    background: dragging
                      ? "var(--accent-subtle)"
                      : "var(--background-elevated)",
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
                      <img
                        src={preview}
                        alt="Preview"
                        style={{
                          width: "100%",
                          height: "220px",
                          objectFit: "cover",
                        }}
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setImage(null);
                          // If original had image, keep the existing cloudinary URL shown
                          setPreview(product?.image_url ?? null);
                        }}
                        style={{
                          position: "absolute",
                          top: "0.5rem",
                          right: "0.5rem",
                          background: "rgba(0,0,0,0.7)",
                          border: "none",
                          borderRadius: "50%",
                          padding: "0.25rem",
                          cursor: "pointer",
                          color: "white",
                          display: "flex",
                        }}
                      >
                        <X size={14} />
                      </button>
                      {image && (
                        <div
                          style={{
                            position: "absolute",
                            bottom: "0.5rem",
                            left: "0.5rem",
                            background: "rgba(99,102,241,0.9)",
                            borderRadius: "var(--radius-sm)",
                            padding: "0.25rem 0.5rem",
                            fontSize: "0.7rem",
                            fontWeight: 600,
                            color: "white",
                          }}
                        >
                          New image selected
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <ImageIcon
                        size={28}
                        style={{
                          color: "var(--foreground-subtle)",
                          marginBottom: "0.75rem",
                        }}
                      />
                      <p
                        style={{
                          fontSize: "0.8125rem",
                          fontWeight: 600,
                          color: "var(--foreground-muted)",
                        }}
                      >
                        Drop new image here
                      </p>
                      <p
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--foreground-subtle)",
                          marginTop: "0.25rem",
                        }}
                      >
                        or click to browse
                      </p>
                      <p
                        style={{
                          fontSize: "0.7rem",
                          color: "var(--foreground-subtle)",
                          marginTop: "0.5rem",
                        }}
                      >
                        JPEG, PNG, WebP · Max 5MB
                      </p>
                    </>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFile(f);
                    }}
                  />
                </div>

                {product.image_url && !image && (
                  <p
                    style={{
                      fontSize: "0.7rem",
                      color: "var(--foreground-subtle)",
                      marginTop: "0.5rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.25rem",
                    }}
                  >
                    <Upload size={11} /> Leave empty to keep existing image
                  </p>
                )}
              </div>

              {/* Save Button */}
              <div className="card" style={{ padding: "1.5rem" }}>
                <button
                  className="btn-primary"
                  type="submit"
                  disabled={saving}
                  style={{
                    width: "100%",
                    justifyContent: "center",
                    padding: "0.875rem",
                  }}
                >
                  {saving ? (
                    <>
                      <div className="spinner" style={{ width: 16, height: 16 }} />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save size={16} /> Save Changes
                    </>
                  )}
                </button>

                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => router.push("/seller/dashboard")}
                  style={{
                    width: "100%",
                    justifyContent: "center",
                    marginTop: "0.625rem",
                  }}
                >
                  <ArrowLeft size={14} /> Cancel
                </button>
              </div>

              {/* Quick stats */}
              <div className="card" style={{ padding: "1.25rem" }}>
                <h3
                  style={{
                    fontWeight: 700,
                    fontSize: "0.8rem",
                    color: "var(--foreground-muted)",
                    marginBottom: "0.875rem",
                  }}
                >
                  QUICK STATS
                </h3>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "0.8125rem",
                    }}
                  >
                    <span style={{ color: "var(--foreground-muted)" }}>
                      Orders placed
                    </span>
                    <span style={{ fontWeight: 700 }}>
                      {product._count?.order_items ?? 0}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "0.8125rem",
                    }}
                  >
                    <span style={{ color: "var(--foreground-muted)" }}>
                      Stock remaining
                    </span>
                    <span style={{ fontWeight: 700 }}>{product.stock_qty}</span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "0.8125rem",
                    }}
                  >
                    <span style={{ color: "var(--foreground-muted)" }}>
                      Demand / Stock
                    </span>
                    <span
                      style={{
                        fontWeight: 700,
                        color:
                          product.estimated_demand > product.stock_qty
                            ? "#f59e0b"
                            : "var(--foreground)",
                      }}
                    >
                      {product.estimated_demand}x
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
