import Link from 'next/link';
import { ArrowRight, Code, Server, Shield } from 'lucide-react';
import { PageHeader }  from '@/components/layout/page-header';
import { Prose }       from '@/components/docs/prose';
import { CodeBlock }   from '@/components/docs/code-block';
import { Callout }     from '@/components/docs/callout';
import { Step }        from '@/components/docs/step';

const INSTALL_CODE = `\
# On your storefront (frontend)
npm install @flashengine/browser

# On your payment server (backend)
npm install @flashengine/server`;

const BROWSER_CODE = `\
import { FlashQueue } from '@flashengine/browser';

const queue = new FlashQueue({
  publicKey: 'YOUR_PUBLIC_KEY',
  userId: getCurrentUserId(),  // your user's ID
});

queue.on('queued', ({ position, estimatedWaitMs }) => {
  showQueueUI(position);  // "You're #12 in line (~24 seconds)"
});

queue.on('won', ({ token }) => {
  // User won! Redirect to your checkout with the token
  window.location.href = \`/checkout?token=\${token}\`;
});

queue.on('sold_out', () => {
  showSoldOutMessage();
});

queue.join();`;

const SERVER_CODE = `\
import { FlashEngine } from '@flashengine/server';

const engine = new FlashEngine({
  publicKey: 'YOUR_PUBLIC_KEY',
  signingSecret: process.env.FLASH_SIGNING_SECRET!,
});

app.post('/api/checkout', async (req, res) => {
  try {
    const { token } = req.body;
    const result = await engine.verifyToken(token);
    // result.valid === true, result.userId, result.jti
    // Process payment...
  } catch (err) {
    if (err.code === 'TOKEN_USED') {
      return res.status(409).json({ error: 'Token already used' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
});`;

const RELEASE_CODE = `\
// If payment fails, release the ticket back to the pool
await engine.releaseTicket(result.jti, 'PAYMENT_FAILED');
// Stock is automatically restored, next person in queue gets it`;

const NEXT_LINKS = [
  {
    icon:        Code,
    title:       'Browser SDK',
    description: 'Full event reference, React hooks, and UI helpers',
    href:        '/dashboard/docs/browser-sdk',
  },
  {
    icon:        Server,
    title:       'Server SDK',
    description: 'Release reasons, offline verification, and more',
    href:        '/dashboard/docs/server-sdk',
  },
  {
    icon:        Shield,
    title:       'Security Model',
    description: 'Understand the cryptographic design behind FlashEngine',
    href:        '/dashboard/docs/security',
  },
] as const;

export default function QuickStartPage() {
  return (
    <div className="animate-page-in">
      <PageHeader
        title="Quick Start Guide"
        description="Integrate FlashEngine with your store in 5 minutes"
      />

      <div className="mt-2">
        {/* Step 1 */}
        <Step number={1} title="Create a Flash Sale Event">
          <Prose>
            <ul>
              <li>
                Go to your <strong>Events</strong> page and click{' '}
                <strong>New Event</strong>
              </li>
              <li>
                Fill in: name, stock count (how many items), rate limit (how
                many winners per second your checkout can handle)
              </li>
              <li>
                Click Create — your event starts in{' '}
                <strong>PENDING</strong> status
              </li>
            </ul>
          </Prose>
        </Step>

        {/* Step 2 */}
        <Step number={2} title="Copy Your Integration Keys">
          <Prose>
            <p>On the event detail page, copy three things:</p>
            <ul>
              <li>
                <strong>Public Key</strong> — identifies your event (safe for
                frontend code)
              </li>
              <li>
                <strong>Signing Secret</strong> — for your backend server
                (NEVER put in frontend code)
              </li>
              <li>
                <strong>RSA Public Key</strong> — for offline token
                verification (optional)
              </li>
            </ul>
          </Prose>
          <Callout type="warning" className="mt-3">
            Your Signing Secret is shown once. Store it securely in your
            environment variables.
          </Callout>
        </Step>

        {/* Step 3 */}
        <Step number={3} title="Install the SDKs">
          <CodeBlock code={INSTALL_CODE} language="bash" />
        </Step>

        {/* Step 4 */}
        <Step number={4} title="Add the Queue to Your Product Page">
          <CodeBlock code={BROWSER_CODE} language="tsx" title="storefront.tsx" />
          <Callout type="info" className="mt-3">
            Using React? Use the{' '}
            <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-xs text-accent">
              useFlashQueue
            </code>{' '}
            hook instead — see{' '}
            <Link
              href="/dashboard/docs/browser-sdk"
              className="text-accent underline-offset-2 hover:underline"
            >
              Browser SDK docs
            </Link>
            .
          </Callout>
        </Step>

        {/* Step 5 */}
        <Step number={5} title="Verify Tokens on Your Server">
          <CodeBlock
            code={SERVER_CODE}
            language="ts"
            title="checkout-api.ts"
          />
        </Step>

        {/* Step 6 */}
        <Step number={6} title="Handle Payment Failures (Release Stock)">
          <CodeBlock
            code={RELEASE_CODE}
            language="ts"
            title="checkout-api.ts (continued)"
          />
        </Step>

        {/* Step 7 */}
        <Step number={7} title="Activate Your Event">
          <Prose>
            <ul>
              <li>
                Go back to the dashboard and click <strong>Activate</strong>{' '}
                on your event
              </li>
              <li>The queue is now live — users can join</li>
              <li>Monitor the live stats on the event detail page</li>
            </ul>
          </Prose>
          <Callout type="info" className="mt-3">
            Tip: Use <strong>Test Mode</strong> (toggle on event creation) to
            test your integration without affecting real inventory.
          </Callout>
        </Step>
      </div>

      {/* What's Next */}
      <div className="mt-10 border-t border-border-subtle pt-8">
        <h2 className="mb-4 text-lg font-semibold text-text-primary">
          What&apos;s Next?
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {NEXT_LINKS.map(({ icon: Icon, title, description, href }) => (
            <Link
              key={href}
              href={href}
              className="group flex flex-col gap-2 rounded-lg border border-border-subtle bg-surface-raised p-4 transition-colors duration-150 hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-muted text-accent">
                  <Icon size={16} />
                </div>
                <ArrowRight
                  size={14}
                  className="text-text-tertiary transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-text-secondary"
                />
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">{title}</p>
                <p className="mt-0.5 text-xs text-text-tertiary">{description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
