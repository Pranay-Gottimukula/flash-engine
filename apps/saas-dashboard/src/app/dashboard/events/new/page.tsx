'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api }         from '@/lib/api';
import { toErrorMessage } from '@/lib/utils';
import { useAuth }     from '@/lib/auth-context';
import { useToast }    from '@/components/ui/toast';
import { PageHeader }  from '@/components/layout/page-header';
import { Card }        from '@/components/ui/card';
import { Input }       from '@/components/ui/input';
import { Button }      from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/error-banner';

interface CreateEventResponse {
  id: string;
}

export default function CreateEventPage() {
  const router   = useRouter();
  const { user } = useAuth();
  const toast = useToast();

  const [name,       setName]       = useState('');
  const [stockCount, setStockCount] = useState('');
  const [rateLimit,  setRateLimit]  = useState('50');
  const [multiplier, setMultiplier] = useState('1.5');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [testMode,   setTestMode]   = useState(false);
  const [error,      setError]      = useState('');
  const [loading,    setLoading]    = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;

    setError('');
    setLoading(true);

    try {
      const body: Record<string, unknown> = {
        clientId:                   user.id,
        name:                       name.trim(),
        stockCount:                 Number(stockCount),
        rateLimit:                  Number(rateLimit),
        oversubscriptionMultiplier: Number(multiplier),
        mode:                       testMode ? 'TEST' : 'LIVE',
      };
      if (webhookUrl.trim()) body.webhookUrl = webhookUrl.trim();

      const event = await api.post<CreateEventResponse>('/api/admin/events', body);
      toast.success('Event created');
      router.push(`/dashboard/events/${event.id}`);
    } catch (err) {
      setError(toErrorMessage(err));
      setLoading(false);
    }
  }

  return (
    <div className="animate-page-in">
      <PageHeader title="Create Event" />

      <div className="w-full max-w-lg">
        <Card>
          <form onSubmit={handleSubmit} className="space-y-6" noValidate>

            {error && <ErrorBanner message={error} />}

            <Input
              label="Event Name"
              type="text"
              placeholder="Summer Flash Sale"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              autoFocus
            />

            <Input
              label="Total Stock"
              type="number"
              placeholder="5000"
              min={1}
              value={stockCount}
              onChange={e => setStockCount(e.target.value)}
              required
            />

            <div className="flex flex-col gap-1.5">
              <Input
                label="Rate Limit"
                type="number"
                placeholder="50"
                min={1}
                max={10000}
                value={rateLimit}
                onChange={e => setRateLimit(e.target.value)}
                required
              />
              <p className="text-xs text-text-tertiary">
                Maximum winners per second reaching your checkout.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Input
                label="Oversubscription Multiplier"
                type="number"
                placeholder="1.5"
                min={1.0}
                max={3.0}
                step={0.1}
                value={multiplier}
                onChange={e => setMultiplier(e.target.value)}
                required
              />
              <p className="text-xs text-text-tertiary">
                Queue capacity = Stock × Multiplier.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Input
                label="Webhook URL"
                type="url"
                placeholder="https://yourstore.com/webhook"
                value={webhookUrl}
                onChange={e => setWebhookUrl(e.target.value)}
              />
              <p className="text-xs text-text-tertiary">
                Get notified when event status changes. Optional.
              </p>
            </div>

            <div className="flex items-start justify-between gap-4 rounded-lg border border-border-subtle p-4">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-text-primary">Test Mode</span>
                <span className="text-xs text-text-tertiary">
                  Queue works normally but tokens are marked as test. Stock resets every 5 minutes.
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={testMode}
                onClick={() => setTestMode(v => !v)}
                className={[
                  'relative mt-0.5 h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base',
                  testMode ? 'bg-yellow-500' : 'bg-surface-raised',
                ].join(' ')}
              >
                <span
                  className={[
                    'block h-5 w-5 rounded-full bg-white shadow transition-transform',
                    testMode ? 'translate-x-5' : 'translate-x-0',
                  ].join(' ')}
                />
              </button>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="ghost"
                disabled={loading}
                onClick={() => router.push('/dashboard')}
              >
                Cancel
              </Button>
              <Button type="submit" loading={loading} className="flex-1">
                Create Event
              </Button>
            </div>

          </form>
        </Card>
      </div>
    </div>
  );
}
