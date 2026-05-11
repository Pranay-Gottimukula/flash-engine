'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Menu } from 'lucide-react';
import { Sidebar } from './sidebar';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/cn';

export function DashboardShell({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const router   = useRouter();
  const pathname = usePathname();
  const isDocs   = pathname?.startsWith('/dashboard/docs') ?? false;
  const [mobileOpen,  setMobileOpen]  = useState(false);
  const [collapsed,   setCollapsed]   = useState(false);

  // Restore sidebar collapsed pref on mount
  useEffect(() => {
    if (localStorage.getItem('sidebar-collapsed') === 'true') setCollapsed(true);
  }, []);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  const toggleSidebar = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar-collapsed', String(next));
      return next;
    });
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!user) router.replace('/login');
    else if (user.role === 'SUPER_ADMIN') router.replace('/admin');
  }, [isLoading, user, router]);

  if (isLoading || !user || user.role === 'SUPER_ADMIN') return null;

  return (
    <div>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={closeMobile}
        />
      )}

      {/* Sidebar — always fixed; main gets matching padding-left */}
      <Sidebar
        mobileOpen={mobileOpen}
        onMobileClose={closeMobile}
        collapsed={collapsed}
        onToggle={toggleSidebar}
      />

      {/*
        Main: full-width with padding-left = sidebar width.
        Transitions in sync with the sidebar width transition so the
        layout shift is smooth. mx-auto inside centers content relative
        to the available space (viewport − sidebar), not the full viewport.
      */}
      <main
        className={cn(
          'min-h-screen transition-[padding-left] duration-200 ease-out',
          collapsed ? 'md:pl-16' : 'md:pl-60',
        )}
      >
        {/* Mobile top bar */}
        <div className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border-subtle bg-surface-base px-4 md:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base"
            aria-label="Open navigation"
          >
            <Menu size={18} />
          </button>
          <span className="text-sm font-semibold text-text-primary">FlashEngine</span>
        </div>

        <div className={cn(
          'animate-page-in py-6 md:py-8',
          isDocs ? 'px-0' : 'mx-auto max-w-5xl px-4 md:px-8',
        )}>
          {children}
        </div>
      </main>
    </div>
  );
}
