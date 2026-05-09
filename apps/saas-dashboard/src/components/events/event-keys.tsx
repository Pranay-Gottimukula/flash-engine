import { Card } from '@/components/ui/card';
import { CopyableField } from '@/components/ui/copyable-field';
import type { EventDetail } from './types';

interface EventKeysProps {
  event: EventDetail;
}

export function EventKeysCard({ event }: EventKeysProps) {
  return (
    <Card header={<p className="text-sm font-semibold text-text-primary">Integration Keys</p>}>
      <div className="space-y-5">
        <CopyableField label="Public Key"       value={event.publicKey} />
        <CopyableField label="RSA Public Key"   value={event.rsaPublicKey} multiline />
        <CopyableField
          label="Signing Secret"
          value={event.signingSecret}
          masked
          warning="Store this securely. Used for release route HMAC."
        />
        <CopyableField
          label="Integration Snippet"
          value={event.integrationSnippet.trim()}
          multiline
        />
      </div>
    </Card>
  );
}
