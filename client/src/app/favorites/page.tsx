"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { api } from "@/lib/api";
import { Favorite } from "@/types";
import { motion } from "framer-motion";
import Link from "next/link";
import { Heart, Zap, ShoppingBag, Trash2, Clock } from "lucide-react";

export default function FavoritesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [fetching, setFetching] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && (!user || user.role !== "CUSTOMER")) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (user?.role === "CUSTOMER") {
      api.get<Favorite[]>("/api/favorites").then((f) => {
        setFavorites(f);
        setFetching(false);
      });
    }
  }, [user]);

  const handleRemove = async (productId: string) => {
    setRemoving(productId);
    try {
      await api.post(`/api/favorites/${productId}`); // toggle removes it
      setFavorites((prev) => prev.filter((f) => f.product_id !== productId));
    } finally {
      setRemoving(null);
    }
  };

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
        <div style={{ marginBottom: "2rem" }}>
          <h1 className="gradient-text" style={{ fontSize: "2rem", fontWeight: 800, marginBottom: "0.25rem" }}>
            My Favorites
          </h1>
          <p style={{ color: "var(--foreground-muted)" }}>
            Your priority wishlist — {favorites.length} item{favorites.length !== 1 ? "s" : ""}
          </p>
          <p style={{ fontSize: "0.8rem", color: "var(--foreground-subtle)", marginTop: "0.25rem" }}>
            ⚡ In Phase 2, items favorited earliest will receive queue priority.
          </p>
        </div>

        {favorites.length === 0 ? (
          <div style={{ textAlign: "center", padding: "4rem", color: "var(--foreground-muted)" }}>
            <Heart size={48} style={{ margin: "0 auto 1rem", opacity: 0.3 }} />
            <p style={{ fontWeight: 600 }}>No favorites yet</p>
            <p style={{ fontSize: "0.875rem", marginTop: "0.25rem", marginBottom: "1.5rem" }}>
              Heart a product on the browse page to add it here.
            </p>
            <Link href="/browse">
              <button className="btn-primary"><ShoppingBag size={15} /> Browse Products</button>
            </Link>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1.25rem" }}>
            {favorites.map((fav, i) => {
              const p = fav.product;
              const discount = Math.round((1 - Number(p.discount_price) / Number(p.original_mrp)) * 100);
              return (
                <motion.div
                  key={fav.product_id}
                  className="card"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  style={{ overflow: "hidden" }}
                >
                  <div style={{ position: "relative", height: "180px", background: "var(--background-elevated)" }}>
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <ShoppingBag size={36} style={{ color: "var(--foreground-subtle)" }} />
                      </div>
                    )}
                    {discount > 0 && (
                      <div style={{ position: "absolute", top: "0.75rem", left: "0.75rem", background: "var(--sale)", color: "#000", fontWeight: 800, fontSize: "0.75rem", padding: "3px 8px", borderRadius: "var(--radius-full)" }}>
                        -{discount}%
                      </div>
                    )}
                    <div style={{ position: "absolute", bottom: "0.5rem", right: "0.5rem", fontSize: "0.7rem", color: "var(--foreground-subtle)" }}>
                      Added {new Date(fav.added_at).toLocaleDateString()}
                    </div>
                  </div>

                  <div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: "0.5rem" }}>
                      <div>
                        <h3 style={{ fontWeight: 700, fontSize: "0.9375rem" }}>{p.name}</h3>
                        <div style={{ fontSize: "0.75rem", color: "var(--foreground-subtle)", marginTop: "2px" }}>
                          by {p.seller?.full_name}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemove(fav.product_id)}
                        disabled={removing === fav.product_id}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)", padding: "0.25rem", flexShrink: 0 }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div className="gradient-text-sale" style={{ fontSize: "1.1rem", fontWeight: 800 }}>
                          ₹{Number(p.discount_price).toLocaleString("en-IN")}
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "var(--foreground-subtle)", textDecoration: "line-through" }}>
                          ₹{Number(p.original_mrp).toLocaleString("en-IN")}
                        </div>
                      </div>
                      <span className={`badge ${p.status === "ACTIVE" ? "badge-active" : p.status === "UPCOMING" ? "badge-upcoming" : "badge-sold-out"}`}>
                        {p.status}
                      </span>
                    </div>

                    <Link href={`/checkout/${p.id}`} style={{ textDecoration: "none" }}>
                      <button
                        className={p.status === "ACTIVE" ? "btn-primary" : "btn-ghost"}
                        disabled={p.status !== "ACTIVE"}
                        style={{ width: "100%", justifyContent: "center" }}
                      >
                        {p.status === "ACTIVE" ? (
                          <><Zap size={13} fill="white" /> Buy Now</>
                        ) : p.status === "UPCOMING" ? (
                          <><Clock size={13} /> Coming Soon</>
                        ) : (
                          "Sold Out"
                        )}
                      </button>
                    </Link>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
