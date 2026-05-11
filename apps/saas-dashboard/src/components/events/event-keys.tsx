'use client';

import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { api } from '@/lib/api';
import { toErrorMessage } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { Card } from '@/components/ui/card';
import { CopyableField } from '@/components/ui/copyable-field';
import { CodeBlock } from '@/components/docs/code-block';
import { Button } from '@/components/ui/button';
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
        <div className="space-y-4">
          <CopyableField label="Public Key"     value={event.publicKey}    codeStyle />
          <CopyableField label="RSA Public Key" value={event.rsaPublicKey} codeStyle multiline />

          <CopyableField
            label="Signing Secret"
            value={signingSecret}
            masked
            codeStyle
            warning="Store this securely. Used for release route HMAC."
            headerAction={
              <button
                type="button"
                onClick={() => { setRotateError(''); setShowRotateModal(true); }}
                className="inline-flex items-center gap-1 rounded-md border border-yellow-500/40 px-2 py-1 text-xs font-medium text-yellow-400 transition-colors hover:border-yellow-500/70 hover:bg-yellow-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500/50"
              >
                <RotateCcw size={11} />
                Rotate
              </button>
            }
          />

          <CodeBlock
            code={event.integrationSnippet.trim()}
            language="bash"
            title="Install & configure"
          />
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
