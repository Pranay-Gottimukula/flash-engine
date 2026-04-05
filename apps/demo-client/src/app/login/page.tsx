"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Zap, Mail, Lock, User, ArrowRight, Eye, EyeOff } from "lucide-react";
import { api } from "@/lib/api";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    setLoading(true);
    try {
      if (isChangingPassword) {
        await api.patch<{ message: string }>("/api/auth/change-password", {
          email: form.email,
          newPassword: form.password,
        });
        setSuccessMsg("Password changed successfully. You can now sign in.");
        setIsChangingPassword(false);
        setForm(p => ({ ...p, password: "" }));
      } else {
        await login(form.email, form.password);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Request failed");
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
        background: "radial-gradient(ellipse at 60% 0%, rgba(99,102,241,0.12) 0%, transparent 60%), var(--background)",
        padding: "1.5rem",
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        style={{ width: "100%", maxWidth: "420px" }}
      >
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              marginBottom: "1.5rem",
            }}
          >
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
            <span
              style={{
                fontSize: "1.5rem",
                fontWeight: 800,
                letterSpacing: "-0.03em",
                color: "var(--foreground)",
              }}
            >
              FlashDrop
            </span>
          </div>
          <h1
            className="gradient-text"
            style={{ fontSize: "1.75rem", fontWeight: 800, marginBottom: "0.5rem" }}
          >
            {isChangingPassword ? "Change Password" : "Welcome back"}
          </h1>
          <p style={{ color: "var(--foreground-muted)", fontSize: "0.9rem" }}>
            {isChangingPassword ? "Enter your email and new password" : "Sign in to your account to continue"}
          </p>
        </div>

        {/* Card */}
        <div
          className="glass"
          style={{
            borderRadius: "var(--radius-xl)",
            padding: "2rem",
          }}
        >
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
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

            {successMsg && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  background: "rgba(16, 185, 129, 0.1)",
                  border: "1px solid rgba(16, 185, 129, 0.3)",
                  borderRadius: "var(--radius-md)",
                  padding: "0.75rem 1rem",
                  color: "#10b981",
                  fontSize: "0.875rem",
                  textAlign: "center",
                }}
              >
                {successMsg}
              </motion.div>
            )}

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
                {isChangingPassword ? "New Password" : "Password"}
              </label>
              <div style={{ position: "relative" }}>
                <input
                  className="input"
                  type={showPass ? "text" : "password"}
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                  style={{ paddingRight: "2.75rem" }}
                  required
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
              style={{ width: "100%", justifyContent: "center", marginTop: "0.5rem", padding: "0.75rem" }}
            >
              {loading ? (
                <>
                  <div className="spinner" style={{ width: 16, height: 16 }} />
                  {isChangingPassword ? "Changing..." : "Signing in..."}
                </>
              ) : (
                <>
                  {isChangingPassword ? "Change Password" : "Sign In"}
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <div style={{ marginTop: "1.5rem", textAlign: "center" }}>
            <hr className="divider" style={{ marginBottom: "1.25rem" }} />
            <p style={{ color: "var(--foreground-muted)", fontSize: "0.875rem", marginBottom: "0.5rem" }}>
              <button
                type="button"
                onClick={() => {
                  setIsChangingPassword(!isChangingPassword);
                  setError("");
                  setSuccessMsg("");
                  setForm({ email: "", password: "" });
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--accent)",
                  fontWeight: 600,
                  cursor: "pointer",
                  padding: 0,
                  fontFamily: "inherit",
                  fontSize: "inherit"
                }}
              >
                {isChangingPassword ? "Back to Login" : "Forgot Password?"}
              </button>
            </p>
            <p style={{ color: "var(--foreground-muted)", fontSize: "0.875rem" }}>
              Don&apos;t have an account?{" "}
              <Link
                href="/register"
                style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}
              >
                Create one
              </Link>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
