'use client';

import { useAuth }       from '@/lib/auth-context';
import { PageHeader }    from '@/components/layout/page-header';
import { Badge }         from '@/components/ui/badge';
import { CopyableField } from '@/components/ui/copyable-field';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export default function AdminSettingsPage() {
  const { user } = useAuth();

  return (
    <div className="animate-page-in">
      <PageHeader title="Settings" />

      <div className="w-full max-w-lg space-y-px overflow-hidden rounded-lg border border-border-subtle">

        {/* ── Account ── */}
        <section className="bg-surface-raised px-5 py-4">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
            Account
          </p>
          <div className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-text-secondary">Email</p>
              <div className="flex h-10 items-center rounded-lg border border-border bg-surface px-3">
                <span className="text-sm text-text-primary">{user?.email ?? '—'}</span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-text-secondary">Role</p>
              <div>
                <Badge variant="warning">SUPER_ADMIN</Badge>
              </div>
            </div>
          </div>
        </section>

        {/* ── Configuration ── */}
        <section className="bg-surface-raised px-5 py-4">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
            Configuration
          </p>
          <div className="space-y-4">
            <CopyableField label="API URL" value={API_URL} />
          </div>
        </section>

      </div>
    </div>
  );
}
