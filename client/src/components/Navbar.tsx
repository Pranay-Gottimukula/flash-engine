"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import { Zap, LogOut, LayoutDashboard, Package, ShoppingBag, Heart, User, ListOrdered } from "lucide-react";

interface NavLink {
  href: string;
  label: string;
  icon: React.ReactNode;
  roles?: ("SELLER" | "CUSTOMER")[];
}

const sellerLinks: NavLink[] = [
  { href: "/seller/dashboard", label: "Dashboard", icon: <LayoutDashboard size={17} /> },
  { href: "/seller/products/new", label: "Create Sale", icon: <Package size={17} /> },
];

const customerLinks: NavLink[] = [
  { href: "/browse", label: "Browse", icon: <ShoppingBag size={17} /> },
  { href: "/favorites", label: "Favorites", icon: <Heart size={17} /> },
  { href: "/orders", label: "My Orders", icon: <ListOrdered size={17} /> },
  { href: "/profile", label: "Profile", icon: <User size={17} /> },
];

export default function Navbar() {
  const { user, logout } = useAuth();

  const links = user?.role === "SELLER" ? sellerLinks : customerLinks;

  return (
    <nav
      className="glass"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        borderBottom: "1px solid var(--border)",
        borderTop: "none",
        borderLeft: "none",
        borderRight: "none",
        borderRadius: 0,
      }}
    >
      <div
        className="page-container"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: "60px",
        }}
      >
        {/* Logo */}
        <Link href={user?.role === "SELLER" ? "/seller/dashboard" : "/browse"} style={{ textDecoration: "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <div
              style={{
                width: 32,
                height: 32,
                background: "var(--accent)",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 12px var(--accent-glow)",
              }}
            >
              <Zap size={17} color="white" fill="white" />
            </div>
            <span style={{ fontSize: "1.125rem", fontWeight: 800, letterSpacing: "-0.03em", color: "var(--foreground)" }}>
              FlashDrop
            </span>
          </div>
        </Link>

        {/* Nav links */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.375rem",
                padding: "0.4rem 0.875rem",
                borderRadius: "var(--radius-md)",
                color: "var(--foreground-muted)",
                textDecoration: "none",
                fontSize: "0.8125rem",
                fontWeight: 500,
                transition: "color 0.2s, background 0.2s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.color = "var(--foreground)";
                (e.currentTarget as HTMLElement).style.background = "var(--background-elevated)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.color = "var(--foreground-muted)";
                (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              {link.icon}
              {link.label}
            </Link>
          ))}
        </div>

        {/* User + Logout */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {user && (
            <div
              style={{
                fontSize: "0.8125rem",
                color: "var(--foreground-muted)",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  background: "var(--accent-subtle)",
                  border: "1px solid var(--accent)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  color: "var(--accent)",
                }}
              >
                {user.full_name.charAt(0).toUpperCase()}
              </div>
            </div>
          )}
          <button
            className="btn-ghost"
            onClick={logout}
            style={{ padding: "0.4rem 0.75rem", fontSize: "0.8125rem" }}
          >
            <LogOut size={14} />
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
}
