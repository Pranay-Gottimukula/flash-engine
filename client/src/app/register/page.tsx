"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Mail, Lock, User, ArrowRight, Store, ShoppingBag, Eye, EyeOff } from "lucide-react";

type Role = "CUSTOMER" | "SELLER";

export default function RegisterPage() {
  const { register } = useAuth();
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    role: "CUSTOMER" as Role,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(form);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "radial-gradient(ellipse at 40% 0%, rgba(99,102,241,0.12) 0%, transparent 55%), var(--background)",
        padding: "1.5rem",
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        style={{ width: "100%", maxWidth: "440px" }}
      >
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.5rem" }}>
            <div
              style={{
                width: 40,
                height: 40,
                background: "var(--accent)",
                borderRadius: "10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 20px var(--accent-glow)",
              }}
            >
              <Zap size={22} color="white" fill="white" />
            </div>
            <span style={{ fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-0.03em" }}>FlashDrop</span>
          </div>
          <h1 className="gradient-text" style={{ fontSize: "1.75rem", fontWeight: 800, marginBottom: "0.5rem" }}>
            Create your account
          </h1>
          <p style={{ color: "var(--foreground-muted)", fontSize: "0.9rem" }}>
            Join the flash sale revolution today
          </p>
        </div>

        <div className="glass" style={{ borderRadius: "var(--radius-xl)", padding: "2rem" }}>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {/* Role Selector */}
            <div>
              <label className="label">I want to</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                {(["CUSTOMER", "SELLER"] as Role[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, role: r }))}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "0.5rem",
                      padding: "1rem",
                      borderRadius: "var(--radius-md)",
                      border: `2px solid ${form.role === r ? "var(--accent)" : "var(--border)"}`,
                      background: form.role === r ? "var(--accent-subtle)" : "var(--background-elevated)",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      color: form.role === r ? "var(--accent)" : "var(--foreground-muted)",
                    }}
                  >
                    {r === "CUSTOMER" ? <ShoppingBag size={22} /> : <Store size={22} />}
                    <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                      {r === "CUSTOMER" ? "Shop & Buy" : "Sell Products"}
                    </span>
                  </button>
                ))}
              </div>
            </div>

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
                  textAlign: "center",
                }}
              >
                {error}
              </motion.div>
            )}

            <div>
              <label className="label">
                <User size={13} style={{ display: "inline", marginRight: 5 }} />
                Full name
              </label>
              <input
                className="input"
                type="text"
                placeholder="Alex Johnson"
                value={form.full_name}
                onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
                required
              />
            </div>

            <div>
              <label className="label">
                <Mail size={13} style={{ display: "inline", marginRight: 5 }} />
                Email address
              </label>
              <input
                className="input"
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                required
              />
            </div>

            <div>
              <label className="label">
                <Lock size={13} style={{ display: "inline", marginRight: 5 }} />
                Password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  className="input"
                  type={showPass ? "text" : "password"}
                  placeholder="Min. 8 characters"
                  value={form.password}
                  onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                  style={{ paddingRight: "2.75rem" }}
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((p) => !p)}
                  style={{
                    position: "absolute",
                    right: "0.75rem",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    color: "var(--foreground-subtle)",
                    cursor: "pointer",
                    padding: 0,
                    display: "flex",
                  }}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              className="btn-primary"
              type="submit"
              disabled={loading}
              style={{ width: "100%", justifyContent: "center", marginTop: "0.25rem", padding: "0.75rem" }}
            >
              {loading ? (
                <>
                  <div className="spinner" style={{ width: 16, height: 16 }} />
                  Creating account...
                </>
              ) : (
                <>
                  Create Account
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <div style={{ marginTop: "1.5rem", textAlign: "center" }}>
            <hr className="divider" style={{ marginBottom: "1.25rem" }} />
            <p style={{ color: "var(--foreground-muted)", fontSize: "0.875rem" }}>
              Already have an account?{" "}
              <Link href="/login" style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}>
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
