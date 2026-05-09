'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Zap, BarChart3, Users, LayoutGrid, Activity, Settings,
  LogOut, ChevronsLeft, ChevronsRight,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuth } from '@/lib/auth-context';

const NAV_ITEMS = [
  { label: 'Overview',   href: '/admin',          icon: BarChart3  },
  { label: 'Clients',    href: '/admin/clients',  icon: Users      },
  { label: 'All Events', href: '/admin/events',   icon: LayoutGrid },
  { label: 'System',     href: '/admin/system',   icon: Activity   },
  { label: 'Settings',   href: '/admin/settings', icon: Settings   },
] as const;

interface AdminSidebarProps {
  mobileOpen?:    boolean;
  onMobileClose?: () => void;
}

export function AdminSidebar({ mobileOpen = false, onMobileClose }: AdminSidebarProps) {
  const pathname         = usePathname();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('admin-sidebar-collapsed') === 'true') setCollapsed(true);
  }, []);

  const onMobileCloseRef = useRef(onMobileClose);
  useEffect(() => { onMobileCloseRef.current = onMobileClose; });
  useEffect(() => { onMobileCloseRef.current?.(); }, [pathname]);

  const toggle = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('admin-sidebar-collapsed', String(next));
      return next;
    });
  }, []);

  const initial = user?.email?.[0]?.toUpperCase() ?? '?';

  return (
    <aside
      className={cn(
        'flex flex-col border-r border-border-subtle bg-surface',
        'fixed inset-y-0 left-0 z-40 w-72',
        'transition-[transform,width] duration-200 ease-out',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
        'md:sticky md:top-0 md:z-auto md:h-screen md:shrink-0 md:translate-x-0',
        collapsed ? 'md:w-16' : 'md:w-60',
      )}
    >
      {/* ── Logo ─────────────────────────────────────────────────────── */}
      <div
        className={cn(
          'flex h-14 shrink-0 items-center gap-2.5 border-b border-border-subtle px-4',
          collapsed && 'md:justify-center md:px-0',
        )}
      >
        <Zap size={18} className="shrink-0 text-accent" fill="currentColor" />
        <span className={cn(
          'text-base font-bold tracking-tight text-text-primary',
          collapsed && 'md:hidden',
        )}>
          FlashEngine
        </span>
        <span className={cn(
          'ml-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest',
          'bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/30',
          collapsed && 'md:hidden',
        )}>
          Admin
        </span>
      </div>

      {/* ── Nav ──────────────────────────────────────────────────────── */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto py-3">
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const isActive = href === '/admin'
            ? pathname === '/admin'
            : pathname === href || pathname.startsWith(href + '/');
          return (
            <div key={href} className="group relative px-2">
              {isActive && (
                <span className="pointer-events-none absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-accent" />
              )}

              <Link
                href={href}
                className={cn(
                  'flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm font-medium',
                  'transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset',
                  collapsed && 'md:justify-center',
                  isActive
                    ? 'bg-accent-muted text-accent'
                    : 'text-text-secondary hover:bg-surface-overlay hover:text-text-primary',
                )}
              >
                <Icon size={16} className="shrink-0" />
                <span className={cn(collapsed && 'md:hidden')}>{label}</span>
              </Link>

              {collapsed && (
                <span className={cn(
                  'pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2',
                  'invisible opacity-0 transition-opacity duration-150',
                  'group-hover:visible group-hover:opacity-100',
                  'hidden md:block',
                  'whitespace-nowrap rounded-md border border-border',
                  'bg-surface-overlay px-2.5 py-1 text-xs font-medium text-text-primary',
                )}>
                  {label}
                </span>
              )}
            </div>
          );
        })}
      </nav>

      {/* ── Bottom ───────────────────────────────────────────────────── */}
      <div className="shrink-0 space-y-1 border-t border-border-subtle p-2">
        <div className={cn(
          'flex items-center gap-2 rounded-lg px-2 py-1.5',
          collapsed && 'md:hidden',
        )}>
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-500/15 text-xs font-semibold text-orange-400">
            {initial}
          </div>
          <span className="min-w-0 flex-1 truncate text-xs text-text-secondary">
            {user?.email}
          </span>
          <button
            onClick={logout}
            aria-label="Sign out"
            className="shrink-0 rounded-md p-1 text-text-tertiary transition-colors hover:bg-surface-overlay hover:text-text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
          >
            <LogOut size={14} />
          </button>
        </div>

        {collapsed && (
          <div className="hidden md:flex justify-center py-1">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-500/15 text-xs font-semibold text-orange-400">
              {initial}
            </div>
          </div>
        )}

        <button
          onClick={toggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="hidden md:flex h-8 w-full items-center justify-center rounded-lg text-text-tertiary transition-colors duration-150 hover:bg-surface-overlay hover:text-text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        >
          {collapsed ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
        </button>
      </div>
    </aside>
  );
}
