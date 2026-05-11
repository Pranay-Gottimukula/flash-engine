'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Zap, LayoutGrid, BookOpen, Settings,
  LogOut, PanelLeft, PanelLeftClose,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuth } from '@/lib/auth-context';

const NAV_ITEMS = [
  { label: 'Events',   href: '/dashboard',          icon: LayoutGrid },
  { label: 'Docs',     href: '/dashboard/docs',     icon: BookOpen   },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings   },
] as const;

interface SidebarProps {
  mobileOpen?:    boolean;
  onMobileClose?: () => void;
  collapsed:      boolean;
  onToggle:       () => void;
}

export function Sidebar({ mobileOpen = false, onMobileClose, collapsed, onToggle }: SidebarProps) {
  const pathname         = usePathname();
  const { user, logout } = useAuth();

  // Close mobile drawer on route change
  const onMobileCloseRef = useRef(onMobileClose);
  useEffect(() => { onMobileCloseRef.current = onMobileClose; });
  useEffect(() => { onMobileCloseRef.current?.(); }, [pathname]);

  const initial = user?.email?.[0]?.toUpperCase() ?? '?';

  return (
    <aside
      className={cn(
        'flex flex-col border-r border-border-subtle bg-surface',
        // Always fixed (overlays content; main gets padding-left to compensate)
        'fixed inset-y-0 left-0 z-40',
        'transition-[transform,width] duration-200 ease-out',
        // Mobile: slide in/out; Desktop: always visible
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
        'w-72 md:translate-x-0',
        collapsed ? 'md:w-16' : 'md:w-60',
      )}
    >
      {/* ── Collapse toggle — desktop only, pinned at top ────────────── */}
      <div
        className={cn(
          'hidden md:flex shrink-0 h-11 items-center border-b border-border-subtle px-2',
          collapsed ? 'justify-center' : 'justify-start',
        )}
      >
        <button
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors duration-150 hover:bg-surface-overlay hover:text-text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        >
          {collapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

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
      </div>

      {/* ── Nav ──────────────────────────────────────────────────────── */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden py-3 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const isActive = href === '/dashboard'
            ? pathname === '/dashboard' || pathname.startsWith('/dashboard/events')
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

              {/* Tooltip when collapsed */}
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
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-muted text-xs font-semibold text-accent">
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

        {/* Icon-only avatar — collapsed desktop */}
        {collapsed && (
          <div className="hidden md:flex justify-center py-1">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-muted text-xs font-semibold text-accent">
              {initial}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
