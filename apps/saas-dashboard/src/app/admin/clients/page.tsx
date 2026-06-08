'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Shield, ShieldCheck, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { relativeTime, toErrorMessage } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { ErrorBanner } from '@/components/ui/error-banner';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';

// ── Types ──────────────────────────────────────────────────────────────────────

type ClientRow = Record<string, unknown> & {
  id:                  string;
  email:               string;
  name:                string | null;
  suspended:           boolean;
  totalEvents:         number;
  activeEvents:        number;
  totalUsersProcessed: number;
  createdAt:           string;
};

type Pending = { client: ClientRow; action: 'suspend' | 'unsuspend' };

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AdminClientsPage() {
  const toast = useToast();

  const [clients,  setClients]  = useState<ClientRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [query,    setQuery]    = useState('');
  const [debQuery, setDebQuery] = useState('');
  const [pending,  setPending]  = useState<Pending | null>(null);
  const [acting,   setActing]   = useState(false);

  // ── Debounce search ──────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setTimeout(() => setDebQuery(query), 300);
    return () => clearTimeout(id);
  }, [query]);

  // ── Data loading ─────────────────────────────────────────────────────────────
  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api.get<ClientRow[]>('/api/superadmin/clients')
      .then(setClients)
      .catch(err => setError(toErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Filtered list ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = debQuery.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(c => c.email.toLowerCase().includes(q));
  }, [clients, debQuery]);

  // ── Suspend / unsuspend ───────────────────────────────────────────────────────
  async function confirmAction() {
    if (!pending) return;
    setActing(true);
    const { client, action } = pending;
    try {
      await api.put(`/api/superadmin/clients/${client.id}/${action}`);
      toast.success(
        action === 'suspend'
          ? `${client.email} suspended`
          : `${client.email} unsuspended`,
      );
      setPending(null);
      load();
    } catch (err) {
      toast.error(toErrorMessage(err));
    } finally {
      setActing(false);
    }
  }

  // ── Table columns ─────────────────────────────────────────────────────────────
  const columns: Column<ClientRow>[] = [
    {
      key:      'email',
      label:    'Email',
      sortable: true,
    },
    {
      key:   'name',
      label: 'Name',
      render: v => (
        <span className="text-text-secondary">
          {(v as string | null) ?? '—'}
        </span>
      ),
    },
    {
      key:      'totalEvents',
      label:    'Events',
      sortable: true,
      render:   v => String(v as number),
    },
    {
      key:      'activeEvents',
      label:    'Active',
      sortable: true,
      render:   v => (
        <span className={cn(
          'tabular-nums font-medium',
          (v as number) > 0 ? 'text-green-400' : 'text-text-secondary',
        )}>
          {v as number}
        </span>
      ),
    },
    {
      key:      'totalUsersProcessed',
      label:    'Users Processed',
      sortable: true,
      render:   v => (v as number).toLocaleString(),
    },
    {
      key:   'suspended',
      label: 'Status',
      render: v => {
        const suspended = v as boolean;
        return (
          <Badge variant={suspended ? 'error' : 'success'}>
            {suspended ? 'Suspended' : 'Active'}
          </Badge>
        );
      },
    },
    {
      key:      'createdAt',
      label:    'Joined',
      sortable: true,
      render:   v => (
        <span className="text-text-secondary">{relativeTime(v as string)}</span>
      ),
    },
    {
      key:   'id',
      label: 'Actions',
      render: (_, row) =>
        row.suspended ? (
          <button
            onClick={() => setPending({ client: row, action: 'unsuspend' })}
            title="Unsuspend"
            aria-label={`Unsuspend ${row.email}`}
            className={cn(
              'rounded p-1.5 text-text-tertiary transition-colors',
              'hover:bg-green-500/10 hover:text-green-400',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base',
            )}
          >
            <ShieldCheck size={15} />
          </button>
        ) : (
          <button
            onClick={() => setPending({ client: row, action: 'suspend' })}
            title="Suspend"
            aria-label={`Suspend ${row.email}`}
            className={cn(
              'rounded p-1.5 text-text-tertiary transition-colors',
              'hover:bg-red-500/10 hover:text-red-400',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base',
            )}
          >
            <Shield size={15} />
          </button>
        ),
    },
  ];

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Spinner size="lg" className="text-text-tertiary" />
      </div>
    );
  }

  if (error) {
    return <ErrorBanner message={error} onRetry={load} className="mt-6" />;
  }

  return (
    <div className="animate-page-in">
      <PageHeader
        title="Clients"
        description="Manage platform clients"
      />

      {/* ── Search ─────────────────────────────────────────────────────────── */}
      <div className="mb-4 max-w-sm">
        <Input
          placeholder="Search by email..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          leftIcon={<Search size={15} />}
          aria-label="Search clients"
        />
      </div>

      {/* ── Table / empty ──────────────────────────────────────────────────── */}
      {clients.length === 0 ? (
        <EmptyState
          icon={<Users size={32} />}
          title="No clients registered yet"
        />
      ) : (
        <DataTable columns={columns} data={filtered} />
      )}

      {/* ── Confirm modal ──────────────────────────────────────────────────── */}
      <Modal
        isOpen={!!pending}
        onClose={() => !acting && setPending(null)}
        title={
          pending?.action === 'suspend'
            ? `Suspend ${pending.client.email}?`
            : `Unsuspend ${pending?.client.email}?`
        }
      >
        <p className="mb-6 text-sm text-text-secondary">
          {pending?.action === 'suspend'
            ? 'This will end all their active events immediately.'
            : 'The client will regain full access to the platform.'}
        </p>
        <div className="flex justify-end gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPending(null)}
            disabled={acting}
          >
            Cancel
          </Button>
          <Button
            variant={pending?.action === 'suspend' ? 'danger' : 'primary'}
            size="sm"
            loading={acting}
            onClick={confirmAction}
          >
            {pending?.action === 'suspend' ? 'Suspend' : 'Unsuspend'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
