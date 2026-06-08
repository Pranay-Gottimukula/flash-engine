'use client';

import { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { api }           from '@/lib/api';
import { useAuth }       from '@/lib/auth-context';
import { relativeTime, toErrorMessage } from '@/lib/utils';
import { PageHeader }    from '@/components/layout/page-header';
import { Button }        from '@/components/ui/button';
import { ErrorBanner }   from '@/components/ui/error-banner';
import { CopyableField } from '@/components/ui/copyable-field';
import { Spinner }       from '@/components/ui/spinner';

interface ClientProfile {
  id:         string;
  email:      string;
  createdAt?: string;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api.get<{ client: ClientProfile }>('/api/auth/me')
      .then(r => r.client)
      .then(setProfile)
      .catch(err => setError(toErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const email      = profile?.email    ?? user?.email ?? '—';
  const clientId   = profile?.id       ?? user?.id    ?? '—';
  const memberSince = profile?.createdAt
    ? relativeTime(profile.createdAt)
    : '—';

  return (
    <div className="animate-page-in">
      <PageHeader title="Settings" />

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size="md" className="text-text-tertiary" />
        </div>
      ) : (
        <>
          {error && (
            <ErrorBanner message={error} onRetry={load} className="mb-6" />
          )}

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
                    <span className="text-sm text-text-primary">{email}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-medium text-text-secondary">Member since</p>
                  <p className="text-sm text-text-primary">{memberSince}</p>
                </div>
              </div>
            </section>

            {/* ── API ── */}
            <section className="bg-surface-raised px-5 py-4">
              <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                API
              </p>
              <CopyableField label="Client ID" value={clientId} />
              <p className="mt-2 text-xs text-text-tertiary">
                Pass this as{' '}
                <code className="font-mono text-text-secondary">clientId</code>{' '}
                when creating events via the API.
              </p>
            </section>

            {/* ── Danger zone ── */}
            <section className="bg-surface-raised px-5 py-4">
              <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-red-500/70">
                Danger Zone
              </p>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-text-primary">Delete Account</p>
                  <p className="text-xs text-text-tertiary">
                    Permanently remove your account and all data.
                  </p>
                </div>
                <div className="group relative shrink-0">
                  <Button variant="danger" disabled>
                    <Trash2 size={14} />
                    Delete Account
                  </Button>
                  <span className={[
                    'pointer-events-none absolute right-0 top-full z-10 mt-1.5',
                    'invisible opacity-0 transition-opacity duration-150',
                    'group-hover:visible group-hover:opacity-100',
                    'whitespace-nowrap rounded-md border border-border',
                    'bg-surface-overlay px-2.5 py-1 text-xs text-text-secondary',
                  ].join(' ')}>
                    Coming soon
                  </span>
                </div>
              </div>
            </section>

          </div>
        </>
      )}
    </div>
  );
}
