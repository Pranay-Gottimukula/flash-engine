import { PageHeader } from '@/components/layout/page-header';
import { Prose }       from '@/components/docs/prose';
import { Callout }     from '@/components/docs/callout';
import { type ReactNode } from 'react';

function Issue({
  title,
  children,
}: {
  title:    string;
  children: ReactNode;
}) {
  return (
    <div className="border-t border-border-subtle pt-6">
      <h3 className="mb-3 text-base font-semibold text-text-primary">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1 text-xs font-medium uppercase tracking-wider text-text-tertiary">
      {children}
    </p>
  );
}

export default function TroubleshootingPage() {
  return (
    <div className="animate-page-in">
      <PageHeader
        title="Troubleshooting"
        description="Common issues and how to fix them"
      />

      <div className="mt-2 space-y-6">

        <Issue title='"Token already used" (409 from verifyToken)'>
          <Label>Cause</Label>
          <Prose>
            <p>
              You&apos;re calling <code>verifyToken()</code> more than once
              with the same token. The first call marks the JTI as consumed;
              all subsequent calls return 409.
            </p>
          </Prose>
          <Label>Fix</Label>
          <Prose>
            <p>
              Call <code>verifyToken()</code> exactly once per checkout
              attempt, then use the returned <code>jti</code> for any
              subsequent operations. If you need to validate the token
              without consuming it (e.g. to show the checkout page), use{' '}
              <code>verifyTokenOffline()</code> first, then{' '}
              <code>verifyToken()</code> immediately before charging.
            </p>
          </Prose>
        </Issue>

        <Issue title='"EVENT_NOT_ACTIVE" from join endpoint'>
          <Label>Cause</Label>
          <Prose>
            <p>
              Your event is in <code>PENDING</code> or <code>ENDED</code>{' '}
              status. The queue only accepts users when an event is{' '}
              <code>ACTIVE</code>.
            </p>
          </Prose>
          <Label>Fix</Label>
          <Prose>
            <p>
              Activate the event from the dashboard before going live.
              If the event has already ended, create a new event — ended
              events cannot be reactivated.
            </p>
          </Prose>
        </Issue>

        <Issue title='"HMAC verification failed" (401 from release)'>
          <Label>Cause</Label>
          <Prose>
            <p>
              The HMAC signature doesn&apos;t match what the engine computed.
              Common causes:
            </p>
            <ul>
              <li>
                Wrong <code>signingSecret</code> — copied from the wrong
                event or truncated
              </li>
              <li>
                Body was re-serialized between HMAC computation and sending
                (field order changed, whitespace added)
              </li>
              <li>
                Timestamp drift — your server clock is more than 5 minutes
                off UTC
              </li>
            </ul>
          </Prose>
          <Label>Fix</Label>
          <Prose>
            <p>
              If using the SDK, confirm you&apos;re passing the exact{' '}
              <code>signingSecret</code> shown in the dashboard for that
              event.
            </p>
            <p>
              If constructing the HMAC manually, use the{' '}
              <strong>exact same JSON string</strong> for both the HMAC
              input and the request body — do not re-stringify. Check your
              server clock with <code>date -u</code> and ensure it is within
              a few seconds of UTC.
            </p>
          </Prose>
        </Issue>

        <Issue title="CORS errors in the browser">
          <Label>Cause</Label>
          <Prose>
            <p>
              Your <code>apiUrl</code> doesn&apos;t match the engine&apos;s
              CORS configuration, or the engine hasn&apos;t been configured
              to allow your domain.
            </p>
          </Prose>
          <Label>Fix</Label>
          <Prose>
            <p>
              For self-hosted deployments, add your storefront domain to the
              CORS allowed origins in the engine-gateway configuration.
              For the hosted service, ensure your <code>apiUrl</code> points
              to <code>https://api.flashengine.dev</code> and your domain is
              registered in your account settings.
            </p>
          </Prose>
        </Issue>

        <Issue title='"SOLD_OUT" immediately after activation'>
          <Label>Cause</Label>
          <Prose>
            <p>
              Either the event&apos;s <code>stockCount</code> is 0, or the
              queue capacity (stock × oversubscription multiplier) was fully
              consumed during a previous activation.
            </p>
          </Prose>
          <Label>Fix</Label>
          <Prose>
            <p>
              Check the event&apos;s stock count on the detail page. If
              you&apos;re re-activating an event that previously ran to
              completion, create a fresh event — stock counters are not
              reset on re-activation.
            </p>
          </Prose>
        </Issue>

        <Issue title="Polling stops when tab goes to background">
          <Label>This is intentional</Label>
          <Prose>
            <p>
              The SDK uses the Page Visibility API to pause polling when the
              browser tab is hidden, reducing unnecessary load on the queue
              server. Polling resumes immediately when the user returns to
              the tab. The user&apos;s position in the queue is preserved
              server-side — no re-joining is required.
            </p>
          </Prose>
        </Issue>

        <Issue title="Token expired before user completed checkout">
          <Label>Cause</Label>
          <Prose>
            <p>
              Purchase tokens have a 10-minute TTL from the time they are
              issued. If the user takes too long to complete checkout, the
              token expires.
            </p>
          </Prose>
          <Label>Fix</Label>
          <Prose>
            <p>
              Listen for the <code>ticket_expiring</code> event on the{' '}
              <code>FlashQueue</code> instance — it fires 60 seconds before
              the token expires. Use this to display urgency UI prompting
              the user to complete checkout.
            </p>
            <p>
              If the token does expire before checkout completes, call{' '}
              <code>releaseTicket(jti, &apos;EXPIRED&apos;)</code> to return the
              spot to the next person in the queue rather than leaving it
              orphaned.
            </p>
          </Prose>
        </Issue>

        <Issue title='"EVENT_NOT_FOUND" despite event existing in dashboard'>
          <Label>Cause</Label>
          <Prose>
            <p>
              The event exists in the database but has not been written to
              Redis yet. This happens when an event has never been activated,
              or when Redis was reset after the event was created.
            </p>
          </Prose>
          <Label>Fix</Label>
          <Prose>
            <p>
              Activate the event from the dashboard. The activation step
              writes the event data to both Postgres and Redis — the queue
              endpoints only read from Redis.
            </p>
          </Prose>
        </Issue>

      </div>

      <Callout type="info" className="mt-10">
        Still stuck? Check the event&apos;s live stats on the detail page
        for clues, or contact{' '}
        <a
          href="mailto:support@flashengine.dev"
          className="text-accent underline-offset-2 hover:underline"
        >
          support@flashengine.dev
        </a>
      </Callout>
    </div>
  );
}
