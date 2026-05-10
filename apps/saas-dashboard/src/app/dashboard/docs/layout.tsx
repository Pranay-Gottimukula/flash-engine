'use client';

import { type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';

const NAV_GROUPS = [
  {
    title: 'Getting Started',
    links: [
      { label: 'Overview',    href: '/dashboard/docs' },
      { label: 'Quick Start', href: '/dashboard/docs/quick-start' },
    ],
  },
  {
    title: 'Client SDK',
    links: [
      { label: 'Browser SDK', href: '/dashboard/docs/browser-sdk' },
      { label: 'Server SDK',  href: '/dashboard/docs/server-sdk' },
    ],
  },
  {
    title: 'Reference',
    links: [
      { label: 'API Reference', href: '/dashboard/docs/api-reference' },
      { label: 'Webhooks',      href: '/dashboard/docs/webhooks' },
    ],
  },
  {
    title: 'Guides',
    links: [
      { label: 'Security Model',  href: '/dashboard/docs/security' },
      { label: 'Troubleshooting', href: '/dashboard/docs/troubleshooting' },
    ],
  },
] as const;

export default function DocsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();

  function isActive(href: string) {
    return href === '/dashboard/docs'
      ? pathname === '/dashboard/docs'
      : pathname === href;
  }

  return (
    <div className="flex min-h-full">
      {/* Desktop docs nav */}
      <aside className="hidden md:flex w-[220px] shrink-0 flex-col border-r border-border-subtle pr-6">
        {NAV_GROUPS.map((group, i) => (
          <div key={group.title} className={cn('flex flex-col gap-0.5', i > 0 && 'mt-5')}>
            <p className="mb-1 px-3 text-xs font-medium uppercase tracking-wider text-text-tertiary">
              {group.title}
            </p>
            {group.links.map(({ label, href }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  'rounded py-1.5 px-3 text-sm transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset',
                  isActive(href)
                    ? 'bg-accent-muted text-text-primary'
                    : 'text-text-secondary hover:bg-surface-overlay hover:text-text-primary',
                )}
              >
                {label}
              </Link>
            ))}
          </div>
        ))}
      </aside>

      {/* Mobile nav dropdown */}
      <div className="md:hidden mb-6 w-full">
        <select
          value={pathname}
          onChange={e => router.push(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
        >
          {NAV_GROUPS.map(group => (
            <optgroup key={group.title} label={group.title}>
              {group.links.map(({ label, href }) => (
                <option key={href} value={href}>{label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Content area */}
      <div className="flex-1 min-w-0 md:pl-8">
        <div className="max-w-[720px]">
          {children}
        </div>
      </div>
    </div>
  );
}
