"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { api } from "@/lib/api";
import { Address } from "@/types";
import { motion, AnimatePresence } from "framer-motion";
import { User, MapPin, Plus, Pencil, Trash2, Star, X, Check } from "lucide-react";

interface AddressFormState {
  street_address: string;
  city: string;
  state: string;
  zip_code: string;
  is_default: boolean;
}

const emptyForm: AddressFormState = {
  street_address: "",
  city: "",
  state: "",
  zip_code: "",
  is_default: false,
};

export default function ProfilePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [fetching, setFetching] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AddressFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    api.get<Address[]>("/api/addresses").then((a) => {
      setAddresses(a);
      setFetching(false);
    });
  }, []);

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (addr: Address) => {
    setEditingId(addr.id);
    setForm({
      street_address: addr.street_address,
      city: addr.city,
      state: addr.state,
      zip_code: addr.zip_code,
      is_default: addr.is_default,
    });
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        const updated = await api.patch<Address>(`/api/addresses/${editingId}`, form);
        setAddresses((prev) => prev.map((a) => {
          if (form.is_default) return { ...a, is_default: a.id === editingId };
          return a.id === editingId ? updated : a;
        }));
      } else {
        const created = await api.post<Address>("/api/addresses", form);
        setAddresses((prev) => {
          const next = form.is_default ? prev.map((a) => ({ ...a, is_default: false })) : [...prev];
          return [...next, created];
        });
      }
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this address?")) return;
    setDeletingId(id);
    try {
      await api.delete(`/api/addresses/${id}`);
      setAddresses((prev) => prev.filter((a) => a.id !== id));
    } finally {
      setDeletingId(null);
    }
  };

  if (fetching) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="spinner" style={{ width: 32, height: 32 }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      <Navbar />
      <div className="page-container" style={{ paddingTop: "2rem", paddingBottom: "4rem", maxWidth: "720px" }}>
        <h1 className="gradient-text" style={{ fontSize: "2rem", fontWeight: 800, marginBottom: "2rem" }}>
          My Profile
        </h1>

        {/* User Info Card */}
        <div className="card" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: "var(--accent-subtle)",
                border: "2px solid var(--accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.25rem",
                fontWeight: 800,
                color: "var(--accent)",
              }}
            >
              {user?.full_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: "1.1rem" }}>{user?.full_name}</div>
              <div style={{ fontSize: "0.875rem", color: "var(--foreground-muted)" }}>{user?.email}</div>
              <span className="badge badge-upcoming" style={{ marginTop: "0.375rem" }}>
                {user?.role}
              </span>
            </div>
          </div>
        </div>

        {/* Address Book */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
          <h2 style={{ fontWeight: 700, fontSize: "1.1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <MapPin size={18} style={{ color: "var(--accent)" }} />
            Address Book
          </h2>
          <button className="btn-ghost" onClick={openNew} style={{ padding: "0.4rem 0.875rem", fontSize: "0.8125rem" }}>
            <Plus size={14} /> Add Address
          </button>
        </div>

        {/* Address List */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" }}>
          {addresses.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "var(--foreground-muted)", background: "var(--background-card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)" }}>
              <MapPin size={36} style={{ margin: "0 auto 0.75rem", opacity: 0.3 }} />
              <p style={{ fontWeight: 600, marginBottom: "0.25rem" }}>No addresses saved</p>
              <p style={{ fontSize: "0.875rem" }}>Add one to enable the Buy Now flow.</p>
            </div>
          ) : (
            addresses.map((addr, i) => (
              <motion.div
                key={addr.id}
                className="card"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                style={{
                  padding: "1rem 1.25rem",
                  border: addr.is_default ? "1px solid var(--accent)" : undefined,
                  background: addr.is_default ? "var(--accent-subtle)" : undefined,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                  <div>
                    {addr.is_default && (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.75rem", color: "var(--accent)", fontWeight: 700, marginBottom: "0.375rem" }}>
                        <Star size={12} fill="currentColor" /> Default
                      </div>
                    )}
                    <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{addr.street_address}</div>
                    <div style={{ fontSize: "0.8125rem", color: "var(--foreground-muted)", marginTop: "0.25rem" }}>
                      {addr.city}, {addr.state} — {addr.zip_code}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      className="btn-ghost"
                      onClick={() => openEdit(addr)}
                      style={{ padding: "0.35rem 0.625rem", fontSize: "0.75rem" }}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      className="btn-danger"
                      onClick={() => handleDelete(addr.id)}
                      disabled={deletingId === addr.id}
                      style={{ padding: "0.35rem 0.625rem", fontSize: "0.75rem" }}
                    >
                      {deletingId === addr.id ? <div className="spinner" style={{ width: 12, height: 12 }} /> : <Trash2 size={13} />}
                    </button>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>

        {/* Address Form Modal */}
        <AnimatePresence>
          {showForm && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowForm(false)}
                style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", zIndex: 40 }}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                style={{
                  position: "fixed",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  width: "90%",
                  maxWidth: "480px",
                  background: "var(--background-card)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-xl)",
                  padding: "1.5rem",
                  zIndex: 50,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
                  <h3 style={{ fontWeight: 700, fontSize: "1.1rem" }}>
                    {editingId ? "Edit Address" : "New Address"}
                  </h3>
                  <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--foreground-muted)", padding: "0.25rem", display: "flex" }}>
                    <X size={18} />
                  </button>
                </div>

                <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div>
                    <label className="label">Street Address *</label>
                    <input className="input" value={form.street_address} onChange={(e) => setForm((p) => ({ ...p, street_address: e.target.value }))} placeholder="123 Main Street" required />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                    <div>
                      <label className="label">City *</label>
                      <input className="input" value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} placeholder="Mumbai" required />
                    </div>
                    <div>
                      <label className="label">State *</label>
                      <input className="input" value={form.state} onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))} placeholder="Maharashtra" required />
                    </div>
                  </div>
                  <div>
                    <label className="label">ZIP Code *</label>
                    <input className="input" value={form.zip_code} onChange={(e) => setForm((p) => ({ ...p, zip_code: e.target.value }))} placeholder="400001" required />
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.875rem", color: "var(--foreground-muted)" }}>
                    <input type="checkbox" checked={form.is_default} onChange={(e) => setForm((p) => ({ ...p, is_default: e.target.checked }))} />
                    Set as default address
                  </label>
                  <button className="btn-primary" type="submit" disabled={saving} style={{ width: "100%", justifyContent: "center", padding: "0.75rem", marginTop: "0.25rem" }}>
                    {saving ? <><div className="spinner" style={{ width: 15, height: 15 }} /> Saving...</> : <><Check size={15} /> Save Address</>}
                  </button>
                </form>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
