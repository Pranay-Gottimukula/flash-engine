import { createHmac } from 'node:crypto';

export interface HmacHeaders {
  'x-signature': string;
  'x-timestamp': string;
  'x-public-key': string;
}

export function signRequest(
  body: object,
  signingSecret: string,
  publicKey: string,
): { headers: HmacHeaders; serializedBody: string } {
  const serializedBody = JSON.stringify(body);
  const timestamp = Date.now().toString();
  const message = `${timestamp}.${serializedBody}`;
  const signature = createHmac('sha256', signingSecret)
    .update(message)
    .digest('hex');

  return {
    headers: {
      'x-signature': `sha256=${signature}`,
      'x-timestamp': timestamp,
      'x-public-key': publicKey,
    },
    serializedBody,
  };
}
