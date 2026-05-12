'use client';

import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { api } from '@/lib/api';
import { toErrorMessage } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { Card } from '@/components/ui/card';
import { CodeBlock } from '@/components/docs/code-block';
import { Callout } from '@/components/docs/callout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import type { EventDetail } from './types';

interface EventKeysProps {
  event: EventDetail;
}

export function EventKeysCard({ event }: EventKeysProps) {
  const toast = useToast();

  const [signingSecret,    setSigningSecret]    = useState(event.signingSecret);
  const [showRotateModal,  setShowRotateModal]  = useState(false);
  const [rotating,         setRotating]         = useState(false);
  const [rotateError,      setRotateError]      = useState('');

  const [webhookUrl,     setWebhookUrl]     = useState(event.webhookUrl ?? '');
  const [editingWebhook, setEditingWebhook] = useState(false);
  const [webhookDraft,   setWebhookDraft]   = useState('');
  const [savingWebhook,  setSavingWebhook]  = useState(false);

  function startEditingWebhook() {
    setWebhookDraft(webhookUrl);
    setEditingWebhook(true);
  }

  async function handleSaveWebhook() {
    const trimmed = webhookDraft.trim();
    const isDev = process.env.NODE_ENV === 'development';
    if (trimmed && !(isDev ? /^https?:\/\/.+/ : /^https:\/\/.+/).test(trimmed)) {
      toast.error(isDev ? 'Webhook URL must start with http:// or https://' : 'Webhook URL must start with https://');
      return;
    }
    setSavingWebhook(true);
    try {
      await api.put(`/api/admin/events/${event.id}`, {
        webhookUrl: trimmed || null,
      });
      setWebhookUrl(trimmed);
      setEditingWebhook(false);
      toast.success('Webhook URL updated');
    } catch (err) {
      toast.error(toErrorMessage(err));
    } finally {
      setSavingWebhook(false);
    }
  }

  async function handleRotateConfirm() {
    setRotateError('');
    setRotating(true);
    try {
      const res = await api.put<{ signingSecret: string }>(
        `/api/admin/events/${event.id}/rotate-secret`,
      );
      setSigningSecret(res.signingSecret);
      setShowRotateModal(false);
      toast.success('Secret rotated successfully');
    } catch (err) {
      setRotateError(toErrorMessage(err));
    } finally {
      setRotating(false);
    }
  }

  return (
    <>
      <Card header={<p className="text-sm font-semibold text-text-primary">Integration Keys</p>}>
        <div className="space-y-5">

          {/* Public Key */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Public Key</p>
            <CodeBlock
              code={event.publicKey}
              language="bash"
              title="public-key"
            />
          </div>

          {/* RSA Public Key */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-text-tertiary uppercase tracking-wider">RSA Public Key</p>
            <CodeBlock
              code={event.rsaPublicKey}
              language="bash"
              title="rsa-public-key.pem"
            />
          </div>

          {/* Signing Secret */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Signing Secret</p>
              <button
                type="button"
                onClick={() => { setRotateError(''); setShowRotateModal(true); }}
                className="inline-flex items-center gap-1 rounded-md border border-yellow-500/40 px-2 py-1 text-xs font-medium text-yellow-400 transition-colors hover:border-yellow-500/70 hover:bg-yellow-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500/50"
              >
                <RotateCcw size={11} />
                Rotate
              </button>
            </div>
            <CodeBlock
              code={signingSecret}
              language="bash"
              title="signing-secret"
            />
            <Callout type="warning">
              Store this securely in your environment variables. Used for release route HMAC verification. <strong>Never</strong> expose this in frontend code.
            </Callout>
          </div>

          {/* Install & Configure snippet */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Install &amp; Configure</p>
            <CodeBlock
              code={event.integrationSnippet.trim()}
              language="ts"
              title="terminal"
            />
          </div>

          {/* Webhook URL */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Webhook URL</p>
              {!editingWebhook && (
                <button
                  type="button"
                  onClick={startEditingWebhook}
                  className="inline-flex items-center gap-1 rounded-md border border-border-subtle px-2 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-accent/50 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base"
                >
                  Edit
                </button>
              )}
            </div>

            {editingWebhook ? (
              <div className="flex flex-col gap-2">
                <Input
                  type="url"
                  placeholder="https://yoursite.com/webhooks/flashengine"
                  value={webhookDraft}
                  onChange={e => setWebhookDraft(e.target.value)}
                  autoFocus
                />
                <p className="text-xs text-text-tertiary">
                  We'll POST event notifications here (ticket_issued, activated, ended, etc.).{' '}
                  HTTPS required in production. HTTP allowed in development.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => setEditingWebhook(false)}
                    disabled={savingWebhook}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleSaveWebhook} loading={savingWebhook}>
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <p className={webhookUrl ? 'font-mono text-sm break-all text-text-primary' : 'text-sm text-text-tertiary'}>
                {webhookUrl || 'No webhook configured'}
              </p>
            )}
          </div>

        </div>
      </Card>

      <Modal
        isOpen={showRotateModal}
        onClose={() => { if (!rotating) setShowRotateModal(false); }}
        title="Rotate Signing Secret?"
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            This will immediately invalidate the current secret. Your backend server will need to
            be updated with the new secret or release requests will fail.
          </p>

          {rotateError && (
            <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {rotateError}
            </p>
          )}

          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => setShowRotateModal(false)}
              disabled={rotating}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRotateConfirm}
              loading={rotating}
              className="flex-1 border border-yellow-500/40 bg-transparent text-yellow-400 hover:border-yellow-500/70 hover:bg-yellow-500/10"
            >
              Rotate Secret
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
