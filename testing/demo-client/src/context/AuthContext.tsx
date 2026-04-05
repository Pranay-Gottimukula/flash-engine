"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { User } from "@/types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
}

interface RegisterData {
  full_name: string;
  email: string;
  password: string;
  role: "SELLER" | "CUSTOMER";
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Hydrate auth state from the httpOnly cookie on mount
  const fetchMe = useCallback(async () => {
    try {
      const data = await api.get<{ user: User }>("/api/auth/me");
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const login = async (email: string, password: string) => {
    const data = await api.post<{ user: User }>("/api/auth/login", {
      email,
      password,
    });
    setUser(data.user);
    // Redirect based on role
    if (data.user.role === "SELLER") {
      router.push("/seller/dashboard");
    } else {
      router.push("/browse");
    }
  };

  const register = async (regData: RegisterData) => {
    await api.post("/api/auth/register", regData);
    // After register, auto-login
    await login(regData.email, regData.password);
  };

  const logout = async () => {
    await api.post("/api/auth/logout");
    setUser(null);
    router.push("/login");
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
