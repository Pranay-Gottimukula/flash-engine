import Link from 'next/link';
import {
  Rocket, Code, Server, BookOpen, Webhook, Shield, LifeBuoy,
} from 'lucide-react';
import { Card } from '@/components/ui/card';

const QUICK_LINKS = [
  {
    icon:        Rocket,
    title:       'Quick Start',
    description: 'Get up and running in 5 minutes',
    href:        '/dashboard/docs/quick-start',
  },
  {
    icon:        Code,
    title:       'Browser SDK',
    description: 'Add queue UI to your storefront',
    href:        '/dashboard/docs/browser-sdk',
  },
  {
    icon:        Server,
    title:       'Server SDK',
    description: 'Verify tokens and release queue slots',
    href:        '/dashboard/docs/server-sdk',
  },
  {
    icon:        BookOpen,
    title:       'API Reference',
    description: 'Full REST API documentation',
    href:        '/dashboard/docs/api-reference',
  },
  {
    icon:        Webhook,
    title:       'Webhooks',
    description: 'Get notified when event status changes',
    href:        '/dashboard/docs/webhooks',
  },
  {
    icon:        Shield,
    title:       'Security Model',
    description: 'How FlashEngine protects your store',
    href:        '/dashboard/docs/security',
  },
] as const;

export default function DocsPage() {
  return (
    <div className="animate-page-in">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-text-primary">FlashEngine Documentation</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Learn how to integrate FlashEngine into your e-commerce store to protect your database
          during flash sales and ensure fair ordering for your customers.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {QUICK_LINKS.map(({ icon: Icon, title, description, href }) => (
          <Link
            key={href}
            href={href}
            className="group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base"
          >
            <Card interactive>
              <div className="flex items-start gap-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-muted text-accent">
                  <Icon size={18} />
                </div>
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-text-primary">{title}</p>
                  <p className="text-xs text-text-tertiary">{description}</p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <p className="mt-10 text-xs text-text-tertiary">
        Need help? Contact support at{' '}
        <a
          href="mailto:support@flashengine.dev"
          className="text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
        >
          support@flashengine.dev
        </a>
      </p>
    </div>
  );
}
