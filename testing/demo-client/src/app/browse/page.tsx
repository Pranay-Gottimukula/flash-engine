"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { api } from "@/lib/api";
import { Product, Favorite } from "@/types";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Heart, Zap, Clock, ShoppingBag, Search, Filter, XCircle } from "lucide-react";

function CountdownTimer({ target, onLive }: { target: string; onLive: () => void }) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    let triggered = false;
    const tick = () => {
      const diff = new Date(target).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft("Live now!");
        if (!triggered) {
          triggered = true;
          onLive();
        }
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${h}h ${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target, onLive]);

  return (
    <span style={{ fontSize: "0.75rem", color: "#818cf8", fontWeight: 600 }}>
      <Clock size={11} style={{ display: "inline", marginRight: 3 }} />
      {timeLeft}
    </span>
  );
}

function ProductCard({
  product,
  favoriteIds,
  onFavorite,
}: {
  product: Product;
  favoriteIds: Set<string>;
  onFavorite: (id: string) => void;
}) {
  const isFav = favoriteIds.has(product.id);
  const discount = Math.round(
    (1 - Number(product.discount_price) / Number(product.original_mrp)) * 100
  );

  const [isLive, setIsLive] = useState(() => {
    if (product.status === "ACTIVE") return true;
    if (product.status === "UPCOMING" && product.sale_starts_at) {
      if (new Date(product.sale_starts_at).getTime() <= Date.now()) return true;
    }
    return false;
  });

  const displayStatus = product.status === "SOLD_OUT" ? "SOLD OUT" : (isLive ? "ACTIVE" : product.status);

  return (
    <motion.div
      className="card"
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}
    >
      {/* Image */}
      <div style={{ position: "relative", height: "200px", background: "var(--background-elevated)", overflow: "hidden" }}>
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.4s ease" }}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.transform = "scale(1.05)"; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.transform = "scale(1)"; }}
          />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ShoppingBag size={40} style={{ color: "var(--foreground-subtle)" }} />
          </div>
        )}

        {/* Discount badge */}
        {discount > 0 && (
          <div style={{ position: "absolute", top: "0.75rem", left: "0.75rem", background: "var(--sale)", color: "#000", fontWeight: 800, fontSize: "0.75rem", padding: "3px 8px", borderRadius: "var(--radius-full)" }}>
            -{discount}%
          </div>
        )}

        {/* Status badge */}
        <div style={{ position: "absolute", top: "0.75rem", right: "0.75rem" }}>
          <span className={`badge ${displayStatus === "ACTIVE" ? "badge-active" : "badge-upcoming"}`}>
            {displayStatus}
          </span>
        </div>

        {/* Favorite button */}
        <button
          onClick={() => onFavorite(product.id)}
          style={{
            position: "absolute",
            bottom: "0.75rem",
            right: "0.75rem",
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: isFav ? "var(--accent)" : "rgba(0,0,0,0.6)",
            border: `1px solid ${isFav ? "var(--accent)" : "rgba(255,255,255,0.1)"}`,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.2s ease",
          }}
        >
          <Heart size={15} color="white" fill={isFav ? "white" : "none"} />
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: "1rem", flex: 1, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <div style={{ fontSize: "0.75rem", color: "var(--foreground-subtle)" }}>
          by {product.seller?.full_name}
        </div>
        <h3 style={{ fontWeight: 700, fontSize: "0.9375rem", lineHeight: 1.3 }}>{product.name}</h3>
        <p style={{ fontSize: "0.8rem", color: "var(--foreground-muted)", lineHeight: 1.5, flex: 1, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {product.description}
        </p>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "0.25rem" }}>
          <div>
            <div className="gradient-text-sale" style={{ fontSize: "1.25rem", fontWeight: 800 }}>
              ₹{Number(product.discount_price).toLocaleString("en-IN")}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--foreground-subtle)", textDecoration: "line-through" }}>
              ₹{Number(product.original_mrp).toLocaleString("en-IN")}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--foreground-muted)" }}>
              {product.stock_qty} left
            </div>
            {product.sale_starts_at && product.status === "UPCOMING" && !isLive && (
              <CountdownTimer target={product.sale_starts_at} onLive={() => setIsLive(true)} />
            )}
          </div>
        </div>

        <Link href={`/checkout/${product.id}`} style={{ textDecoration: "none", marginTop: "0.5rem" }} onClick={(e) => { if (!isLive || product.status === "SOLD_OUT") e.preventDefault(); }}>
          <button
            className={isLive && product.status !== "SOLD_OUT" ? "btn-primary" : "btn-ghost"}
            disabled={!isLive || product.status === "SOLD_OUT"}
            style={{ width: "100%", justifyContent: "center" }}
          >
            {product.status === "SOLD_OUT" ? (
              <><XCircle size={14} /> Sold Out</>
            ) : isLive ? (
              <><Zap size={14} fill="white" /> Buy Now</>
            ) : (
              <><Clock size={14} /> Upcoming</>
            )}
          </button>
        </Link>
      </div>
    </motion.div>
  );
}

export default function BrowsePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [fetching, setFetching] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"ALL" | "ACTIVE" | "UPCOMING">("ALL");

  useEffect(() => {
    if (!loading && !user) router.push("/login");
    if (!loading && user?.role === "SELLER") router.push("/seller/dashboard");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api.get<Product[]>("/api/products"),
      api.get<Favorite[]>("/api/favorites"),
    ]).then(([prods, favs]) => {
      setProducts(prods);
      setFavorites(new Set(favs.map((f) => f.product_id)));
      setFetching(false);
    });
  }, [user]);

  const handleFavorite = useCallback(
    async (productId: string) => {
      try {
        const res = await api.post<{ favorited: boolean }>(`/api/favorites/${productId}`);
        setFavorites((prev) => {
          const next = new Set(prev);
          if (res.favorited) next.add(productId);
          else next.delete(productId);
          return next;
        });
      } catch {}
    },
    []
  );

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

  const filtered = products
    .filter((p) => filter === "ALL" || getDisplayStatus(p) === filter)
    .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

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
            Flash Sales
          </h1>
          <p style={{ color: "var(--foreground-muted)" }}>
            Discover exclusive drops — act fast before they&apos;re gone
          </p>
        </div>

        {/* Search + Filter Bar */}
        <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", alignItems: "center" }}>
          <div style={{ flex: 1, position: "relative" }}>
            <Search size={16} style={{ position: "absolute", left: "0.875rem", top: "50%", transform: "translateY(-50%)", color: "var(--foreground-subtle)" }} />
            <input
              className="input"
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: "2.5rem" }}
            />
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {(["ALL", "ACTIVE", "UPCOMING"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "var(--radius-md)",
                  border: `1px solid ${filter === f ? "var(--accent)" : "var(--border)"}`,
                  background: filter === f ? "var(--accent-subtle)" : "var(--background-elevated)",
                  color: filter === f ? "var(--accent)" : "var(--foreground-muted)",
                  fontWeight: 600,
                  fontSize: "0.8125rem",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                {f === "ALL" ? "All" : f === "ACTIVE" ? "🟢 Live" : "🟣 Upcoming"}
              </button>
            ))}
          </div>
        </div>

        {/* Product Grid */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "4rem", color: "var(--foreground-muted)" }}>
            <ShoppingBag size={48} style={{ margin: "0 auto 1rem", opacity: 0.3 }} />
            <p style={{ fontWeight: 600 }}>No products found</p>
            <p style={{ fontSize: "0.875rem", marginTop: "0.25rem" }}>
              {search ? "Try a different search." : "Check back soon for new drops."}
            </p>
          </div>
        ) : (
          <motion.div
            layout
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1.25rem" }}
          >
            {filtered.map((p) => (
              <ProductCard key={p.id} product={p} favoriteIds={favorites} onFavorite={handleFavorite} />
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}
