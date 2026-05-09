'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Menu } from 'lucide-react';
import { AdminSidebar } from './admin-sidebar';
import { useAuth } from '@/lib/auth-context';

export function AdminShell({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  useEffect(() => {
    if (isLoading) return;
    if (!user) router.replace('/login');
    else if (user.role !== 'SUPER_ADMIN') router.replace('/dashboard');
  }, [isLoading, user, router]);

  if (isLoading || user?.role !== 'SUPER_ADMIN') return null;

  return (
    <div className="flex">
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={closeMobile}
        />
      )}

      <AdminSidebar mobileOpen={mobileOpen} onMobileClose={closeMobile} />

      <main className="min-h-screen flex-1 overflow-auto">
        <div className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border-subtle bg-surface-base px-4 md:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base"
            aria-label="Open navigation"
          >
            <Menu size={18} />
          </button>
          <span className="text-sm font-semibold text-text-primary">FlashEngine</span>
          <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/30">
            Admin
          </span>
        </div>

        <div className="animate-page-in mx-auto max-w-[1200px] px-4 py-6 md:px-8 md:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
