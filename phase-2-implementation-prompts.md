# Flash Sale Engine — Complete Implementation Prompts (Ordered)

## Feed these sequentially. Verify each works before moving to the next.

---

# SECTION A — BACKEND SCHEMA & AUTH

---

## Prompt A1 — Schema updates for auth, roles, suspension, and pause

```
Read the full codebase, especially the Prisma schema and all controllers.

Make these schema changes:

1. Update the `Client` model:
   - Add `password` field: String, required (will store bcrypt hash)
   - Add `role` field: String, @default("CLIENT") — valid values are "CLIENT" and "SUPER_ADMIN"
   - Add `suspended` field: Boolean, @default(false)
   - Add `name` field: String, optional (for display purposes)

2. Update the `SaleEvent` model:
   - Add `endedAt` field: DateTime, optional — set when event status changes to ENDED
   - Status field now accepts: PENDING | ACTIVE | PAUSED | ENDED
   - Add `webhookUrl` field: String, optional

3. In `admin.controller.ts` `endEvent()`:
   - When updating status to ENDED, also set `endedAt: new Date()`

4. Run the migration: `npx prisma migrate dev --name add-auth-roles-pause`

5. Create a seed script at `prisma/seed.ts`:
   - Creates one SUPER_ADMIN client with:
     - email: from env var `SUPER_ADMIN_EMAIL` or default "admin@flashengine.dev"
     - password: hash of env var `SUPER_ADMIN_PASSWORD` or default "admin123456"
     - role: "SUPER_ADMIN"
     - name: "Platform Admin"
     - publicKey: generate with crypto.randomUUID()
   - Add the seed command to package.json: "prisma": { "seed": "ts-node prisma/seed.ts" }
   - Install bcrypt and @types/bcrypt as dependencies

Do NOT modify any controllers beyond the endedAt change. Do NOT create auth routes yet.
```

## Prompt A2 — Auth endpoints (signup, login, me)

```
Read the Prisma schema, the existing middleware files, and server.ts.

Create the auth system:

1. Create `src/controllers/auth.controller.ts` with three handlers:

   `signup(req, res)`:
   - Body: { email, password, name (optional) }
   - Validate: email is valid format, password is at least 8 characters
   - Check if email already exists → 409 "Email already registered"
   - Hash password with bcrypt (salt rounds: 12)
   - Create Client with role "CLIENT", generate publicKey with crypto.randomUUID()
   - Sign a JWT using fast-jwt with payload: { sub: client.id, email: client.email, role: client.role }
   - Use a global JWT secret from env var `AUTH_JWT_SECRET` (NOT the per-event RSA keys — those are for purchase tokens)
   - Algorithm: HS256 (symmetric is fine for auth tokens — this isn't the purchase flow)
   - Expiry: 7 days (7 * 24 * 60 * 60 * 1000 ms for fast-jwt)
   - Return 201: { token, client: { id, email, name, role, publicKey, createdAt } }

   `login(req, res)`:
   - Body: { email, password }
   - Find client by email → 401 "Invalid credentials" if not found
   - Check if client.suspended → 403 "Account suspended"
   - Compare password with bcrypt → 401 "Invalid credentials" if wrong
   - Sign JWT same as signup
   - Return 200: { token, client: { id, email, name, role, publicKey, createdAt } }

   `getMe(req, res)`:
   - Read JWT from Authorization header (Bearer token)
   - Verify and decode the token
   - Fetch client from Postgres by id (from token sub claim)
   - If client not found or suspended → 401
   - Return 200: { client: { id, email, name, role, publicKey, createdAt } }

2. Create `src/routes/auth.routes.ts`:
   - POST /api/auth/signup → signup
   - POST /api/auth/login → login
   - GET /api/auth/me → getMe

3. Register auth routes in server.ts (no middleware needed — these are public except getMe)

4. Create `src/lib/auth.ts`:
   - Export `signAuthToken(payload)` and `verifyAuthToken(token)` using fast-jwt
   - Use HS256 with AUTH_JWT_SECRET env var
   - These are separate from the per-event RS256 token functions

5. Add AUTH_JWT_SECRET to your .env.example file

Do NOT touch any existing controllers or middleware yet.
```

## Prompt A3 — Role-based auth middleware

```
Read the existing middleware files (admin-auth.middleware.ts, event-ownership.middleware.ts) and the new auth.ts lib.

Create new middleware and update existing ones:

1. Create `src/middleware/require-auth.middleware.ts`:
   - `requireAuth` middleware:
     - Reads Authorization header, extracts Bearer token
     - Verifies token using verifyAuthToken from lib/auth.ts
     - Fetches client from Postgres by sub claim
     - If no token, invalid token, client not found, or client suspended → 401
     - Attaches client to `res.locals.client` (type: { id, email, name, role, publicKey })
     - Calls next()

   - `requireRole(...roles: string[])` middleware factory:
     - Must be used AFTER requireAuth
     - Reads res.locals.client.role
     - If role not in allowed roles → 403 "Insufficient permissions"
     - Calls next()

2. Update `src/middleware/admin-auth.middleware.ts`:
   - Keep the existing `requireAdminSecret` middleware as-is (don't break existing functionality)
   - Add a new middleware `requireAdminAuth` that accepts EITHER:
     - The x-admin-secret header (existing behavior for backward compatibility), OR
     - A valid JWT Bearer token where the client has role CLIENT or SUPER_ADMIN
   - This way the dashboard can use JWT auth while direct API users can still use the admin secret
   - Attach the authenticated client to res.locals.client if using JWT path

3. Update admin routes to use the new `requireAdminAuth` instead of `requireAdminSecret`:
   - All existing admin routes should work with both auth methods
   - Add a check: for routes that return events, filter by clientId from res.locals.client.id (so clients only see their own events)
   - Exception: if role is SUPER_ADMIN, return all events (no clientId filter)

4. Add TypeScript types for res.locals:
   - Extend Express Locals interface in a `src/types/express.d.ts` file if not already done
   - Include `client?: { id: string, email: string, name: string | null, role: string, publicKey: string }`

Do NOT change queue routes or the release route middleware.
```

## Prompt A4 — Update admin controller for role-aware data access

```
Read admin.controller.ts and the updated middleware.

Update the admin controller so that data access respects the authenticated client's role:

1. `listEvents` (or create it if it doesn't exist):
   - If res.locals.client.role === "SUPER_ADMIN": return all events, include the client email in each event response
   - If res.locals.client.role === "CLIENT": return only events where clientId === res.locals.client.id
   - Include _count for attempts, releases, usedJtis
   - For ACTIVE events, fetch live stock from Redis
   - Order by createdAt descending

2. `getEvent`:
   - Fetch event by id
   - If role is CLIENT and event.clientId !== client.id → 403 "Not your event"
   - If role is SUPER_ADMIN, allow access to any event
   - Return all fields EXCEPT rsaPrivateKey
   - Include integrationSnippet (code example string)

3. `getEventStats`:
   - Same ownership check as getEvent
   - No changes to the stats logic itself

4. `createEvent`:
   - Set clientId to res.locals.client.id (not from request body)
   - This ensures clients can only create events under their own account
   - Accept optional webhookUrl in request body, save to the event

5. `activateEvent` and `endEvent`:
   - Ownership check: CLIENT can only activate/end their own events, SUPER_ADMIN can do any
   - When ending, set endedAt timestamp

Make sure all responses exclude rsaPrivateKey and password fields. Never return these to any client.
```

---

# SECTION B — RATE LIMITING & PAUSE/RESUME

---

## Prompt B1 — In-memory rate limiting on queue routes

```
Read the queue routes and server.ts.

Add abuse-prevention rate limiting using express-rate-limit with the default in-memory store.

Install: `npm install express-rate-limit`

Do NOT use a Redis store — this is a deliberate design decision. In-memory rate limiting stays alive even if Redis fails, and on a single server there's no need for shared state.

1. Create `src/middleware/rate-limit.middleware.ts`:

   Export two rate limiters:

   `queueJoinLimiter`:
   - Window: 10 seconds
   - Max requests per window: 5 per IP
   - Message: { error: "RATE_LIMITED", message: "Too many requests. Please try again shortly.", retryAfter: 10 }
   - Standard headers: true (sends RateLimit-* headers)
   - keyGenerator: use req.ip (default, but be explicit)

   `queueStatusLimiter`:
   - Window: 2 seconds
   - Max requests per window: 3 per IP (polling endpoint gets hit frequently, be generous)
   - Message: { error: "RATE_LIMITED", message: "Polling too fast. Slow down.", retryAfter: 2 }

   `authLimiter`:
   - Window: 15 minutes
   - Max requests per window: 10 per IP
   - Message: { error: "RATE_LIMITED", message: "Too many login attempts. Try again later.", retryAfter: 900 }

2. Apply the limiters:
   - In queue.routes.ts: apply `queueJoinLimiter` to POST /api/queue/join
   - In queue.routes.ts: apply `queueStatusLimiter` to GET /api/queue/status
   - In auth.routes.ts: apply `authLimiter` to POST /api/auth/login and POST /api/auth/signup

3. In the error response, always include a `retryAfter` field in seconds so the SDK/client knows how long to wait.

Do NOT rate limit admin routes (they're behind auth), the health endpoint, or the JWKS endpoint.
```

## Prompt B2 — Pause and Resume endpoints

```
Read admin.controller.ts, drain.service.ts, and the Lua scripts.

Add pause and resume functionality for events. Only SUPER_ADMIN can pause/resume.

1. Add to `admin.controller.ts`:

   `pauseEvent(req, res)`:
   - Only allowed if current status is ACTIVE
   - Only SUPER_ADMIN can call this (check role, return 403 otherwise)
   - Update Postgres: status → "PAUSED"
   - Update Redis hash: status → "PAUSED"
   - Stop the drain loop: call stopDrain(publicKey)
   - Do NOT evict the Node cache (we need the keys when resuming)
   - Do NOT delete the sorted set queue (users keep their positions)
   - Do NOT set TTL on Redis keys (event isn't ending)
   - If event has webhookUrl, fire-and-forget a POST to it: { event: "paused", eventId, timestamp }
   - Return 200: { message: "Event paused", event: updatedEvent }

   `resumeEvent(req, res)`:
   - Only allowed if current status is PAUSED
   - Only SUPER_ADMIN can call this
   - Update Postgres: status → "ACTIVE"
   - Update Redis hash: status → "ACTIVE"
   - Ensure Node cache is warm (call warmEventCache if not already cached — it might have been evicted if server restarted while paused)
   - Restart drain loop: call startDrain(publicKey, rateLimit)
   - If webhookUrl, fire-and-forget: { event: "resumed", eventId, timestamp }
   - Return 200: { message: "Event resumed", event: updatedEvent }

2. Add routes in admin.routes.ts:
   - PUT /api/admin/events/:id/pause → requireAdminAuth, pauseEvent
   - PUT /api/admin/events/:id/resume → requireAdminAuth, resumeEvent

3. Verify the Lua queue-admission script handles PAUSED correctly:
   - It already checks `status ~= 'ACTIVE'` and returns EVENT_NOT_ACTIVE
   - PAUSED will trigger this check naturally — no Lua changes needed
   - But update the return message: if status is "PAUSED", return a specific code so the controller can return a friendlier message "Sale is temporarily paused, please try again shortly"

   Actually, modify the Lua script to distinguish PAUSED from other non-active states:
   - After the nil check, add: if status == 'PAUSED' then return {-6, 'EVENT_PAUSED'} end
   - Keep the existing: if status ~= 'ACTIVE' then return {-3, 'EVENT_NOT_ACTIVE'} end

4. Update joinQueue controller to handle -6 return code:
   - Return 503 with { status: "PAUSED", message: "This sale is temporarily paused. Please try again shortly.", retryAfter: 30 }

5. Update the drain service initDrains():
   - Only start drains for events with status "ACTIVE" (not PAUSED)
   - A PAUSED event's queue is preserved but not processed
```

---

# SECTION C — SUPER ADMIN BACKEND ENDPOINTS

---

## Prompt C1 — Client management endpoints

```
Read the Prisma schema, admin controller, and middleware.

Add endpoints for super admin to manage clients.

1. Create `src/controllers/superadmin.controller.ts`:

   `listClients(req, res)`:
   - Fetch all clients from Postgres
   - Include _count: { events: true }
   - Include computed fields per client:
     - activeEvents: count of events where status = "ACTIVE"
     - totalUsersProcessed: count of QueueAttempts across all their events
   - For totalUsersProcessed, use a raw Prisma query or a groupBy + sum to avoid N+1:
     ```
     SELECT c.id, COUNT(qa.id) as "totalUsers"
     FROM "Client" c
     LEFT JOIN "SaleEvent" se ON se."clientId" = c.id
     LEFT JOIN "QueueAttempt" qa ON qa."saleEventId" = se.id
     GROUP BY c.idRead the Prisma schema, admin controller, and middleware.

Add endpoints for super admin to manage clients.

1. Create `src/controllers/superadmin.controller.ts`:

   `listClients(req, res)`:
   - Fetch all clients from Postgres
   - Include _count: { events: true }
   - Include computed fields per client:
     - activeEvents: count of events where status = "ACTIVE"
     - totalUsersProcessed: count of QueueAttempts across all their events
   - For totalUsersProcessed, use a raw Prisma query or a groupBy + sum to avoid N+1:
     ```
     SELECT c.id, COUNT(qa.id) as "totalUsers"
     FROM "Client" c
     LEFT JOIN "SaleEvent" se ON se."clientId" = c.id
     LEFT JOIN "QueueAttempt" qa ON qa."saleEventId" = se.id
     GROUP BY c.id
     ```
   - Order by createdAt descending
   - Do NOT return password or any secret keys
   - Return: array of { id, email, name, role, suspended, publicKey, createdAt, eventsCount, activeEvents, totalUsersProcessed }

   `suspendClient(req, res)`:
   - Param: client id
   - Set suspended = true in Postgres
   - Force-end all ACTIVE events for this client:
     - For each active event: update Postgres status to ENDED, update Redis status to ENDED + set TTL, stop drain, evict cache
     - Reuse the endEvent logic — extract it into a shared service function if it isn't already
   - Return 200: { message: "Client suspended", activeEventsEnded: count }

   `unsuspendClient(req, res)`:
   - Set suspended = false
   - Return 200: { message: "Client unsuspended" }

2. Create `src/routes/superadmin.routes.ts`:
   - All routes use requireAdminAuth + requireRole("SUPER_ADMIN")
   - GET /api/superadmin/clients → listClients
   - PUT /api/superadmin/clients/:id/suspend → suspendClient
   - PUT /api/superadmin/clients/:id/unsuspend → unsuspendClient

3. Register routes in server.ts
```

## Prompt C2 — System health endpoint

```
Read redis.service.ts, prisma.service.ts, drain.service.ts, and event-cache.service.ts.

Add a system health endpoint for the super admin dashboard.

1. Add to `superadmin.controller.ts`:

   `getSystemHealth(req, res)`:

   Gather data from all services in parallel using Promise.all:

   Redis stats:
   - Call redis.info('memory') — parse out used_memory_human and maxmemory_human
   - Call redis.info('stats') — parse out instantaneous_ops_per_sec
   - Call redis.info('clients') — parse out connected_clients
   - Call redis.dbsize() — total keys
   - Include circuit breaker state if you have one (open/closed), otherwise just connected: true/false based on redis.status

   Postgres stats:
   - From the pg Pool instance, get: totalCount, idleCount, waitingCount
   - These are available as properties on the pool object
   - Export a `getPoolStats()` function from prisma.service.ts that returns these

   Application stats:
   - process.uptime() — formatted as human readable
   - process.memoryUsage() — rss and heapUsed in MB
   - getCacheStats() from event-cache.service.ts
   - getActiveDrains() from drain.service.ts — return count and list of publicKeys being drained

   Return 200:
   {
     redis: { connected, memoryUsed, memoryMax, opsPerSecond, connectedClients, totalKeys },
     postgres: { totalConnections, idleConnections, waitingQueries },
     application: { uptime, memoryMB, eventCache: { cachedEvents, keys }, activeDrains: { count, events } },
     timestamp: new Date().toISOString()
   }

2. Add route:
   - GET /api/superadmin/system/health → requireAdminAuth, requireRole("SUPER_ADMIN"), getSystemHealth

3. In prisma.service.ts, export `getPoolStats()`:
   - Access the underlying pg Pool (from the adapter setup)
   - Return { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount }

4. In drain.service.ts, update `getActiveDrains()` to return:
   - { count: activeDrains.size, events: Array.from(activeDrains.keys()) }
```

## Prompt C3 — Platform overview stats endpoint

```
Add a platform-wide overview endpoint for the super admin dashboard landing page.

1. Add to `superadmin.controller.ts`:

   `getPlatformOverview(req, res)`:

   Gather in parallel:

   - Total clients: prisma.client.count()
   - Total events: prisma.saleEvent.count()
   - Active events: prisma.saleEvent.count({ where: { status: "ACTIVE" } })
   - Paused events: prisma.saleEvent.count({ where: { status: "PAUSED" } })

   For each active event, fetch from Redis:
   - ZCARD of the queue sorted set (users waiting)
   - HGET stock from event hash
   Sum these across all active events to get:
   - totalUsersInQueue (sum of all ZCARDs)
   - totalStockRemaining (sum of all stocks)
   - totalRateLimitCapacity (sum of all rateLimits from Postgres)

   Recent activity (last 24 hours):
   - Events created: count where createdAt > 24h ago
   - Events activated: count where status is ACTIVE or ENDED and there exists a QueueAttempt (meaning it was activated at some point)
   - Total queue attempts in last 24h: count QueueAttempts where createdAt > 24h ago
   - Simplify this: just count QueueAttempts in last 24h grouped by result

   Return 200:
   {
     clients: { total },
     events: { total, active, paused, pending, ended },
     live: { totalUsersInQueue, totalStockRemaining, totalRateLimitCapacity },
     last24h: { eventsCreated, totalRequests, results: { WON, SOLD_OUT, QUEUED, RATE_LIMITED } },
     timestamp: new Date().toISOString()
   }

2. Add route:
   - GET /api/superadmin/overview → requireAdminAuth, requireRole("SUPER_ADMIN"), getPlatformOverview
```

---

# SECTION D — CLIENT VIEW IMPROVEMENTS (BACKEND)

---

## Prompt D1 — Client overview metrics and event duplicate support

```
Read admin.controller.ts.

Add backend support for client dashboard improvements:

1. Add `getClientOverview(req, res)` to admin.controller.ts:
   - This is for the CLIENT role — returns metrics for their own account only
   - Uses res.locals.client.id to scope all queries

   Compute:
   - totalEvents: count of their SaleEvents
   - totalUsersProcessed: count of QueueAttempts across their events
   - averageConversionRate: for ended events, calculate (usedJti count / WON count) averaged across events. If no ended events, return null.
   - averageStockUtilization: for ended events, calculate (usedJti count / stockCount) averaged. If no ended events, return null.

   Return 200:
   {
     totalEvents,
     totalUsersProcessed,
     averageConversionRate,
     averageStockUtilization
   }

2. Add route: GET /api/admin/overview → requireAdminAuth, getClientOverview

3. Add `duplicateEvent(req, res)` to admin.controller.ts:
   - Param: event id to duplicate
   - Ownership check: CLIENT can only duplicate their own events
   - Fetch the source event
   - Create a new event with:
     - name: source.name + " (copy)"
     - stockCount: same
     - rateLimit: same
     - oversubscriptionMultiplier: same
     - webhookUrl: same
     - New RSA keypair (generate fresh — never reuse keys)
     - New signingSecret
     - Status: PENDING
     - clientId: from authenticated client
   - Seed Redis hash for the new event
   - Return 201 with the new event (same format as createEvent response)

4. Add route: POST /api/admin/events/:id/duplicate → requireAdminAuth, duplicateEvent
```

## Prompt D2 — Event timeline data

```
Read admin.controller.ts and the getEventStats function.

Enhance the stats endpoint to include timeline data for ended events.

Update `getEventStats` to also return a `timeline` object:

1. Gather these timestamps:
   - created: event.createdAt
   - activated: find the earliest QueueAttempt for this event → its createdAt is approximately when the event was activated (or add an `activatedAt` field to SaleEvent — better approach, do this)
   - firstWinner: earliest QueueAttempt where result = "WON"
   - stockDepleted: earliest QueueAttempt where result = "SOLD_OUT" (first time someone was told sold out)
   - lastRelease: latest TicketRelease for this event
   - ended: event.endedAt

2. Add `activatedAt` DateTime optional field to SaleEvent schema. Run migration.
   - Set it in activateEvent(): `activatedAt: new Date()`
   - Set it in resumeEvent() too (update to latest activation time)

3. Add timeline to the stats response:
   {
     ...existingStats,
     timeline: {
       created: "2024-01-15T10:00:00Z",
       activated: "2024-01-15T12:00:00Z",
       firstWinner: "2024-01-15T12:00:01Z",
       stockDepleted: "2024-01-15T12:02:30Z",
       lastRelease: "2024-01-15T12:15:00Z",
       ended: "2024-01-15T12:20:00Z"
     }
   }

   Any of these can be null if that stage hasn't happened yet.

4. Run migration: `npx prisma migrate dev --name add-activated-at`
```

---

# SECTION E — FRONTEND: AUTH & LAYOUT (Updated)

---

## Prompt E1 — Project setup and design system

```
Use the exact same prompt as F1.1 from the previous frontend prompts file.

(Initialize Next.js project in apps/saas-dashboard/ with Tailwind, dark theme, green accent color palette, Inter font, lucide-react, clsx, js-cookie)
```

## Prompt E2 — UI components

```
Use the exact same prompt as F1.2 from the previous frontend prompts file.

(Create Button, Input, Card, Badge, Modal, Spinner, EmptyState components)

ADDITIONALLY, create these extra components:

8. `stat-card.tsx` — Metric display card
   - Props: label (string), value (string | number), subtitle (optional string), trend (optional: "up" | "down" | "neutral"), live (optional boolean — adds subtle pulse animation)
   - Large value text (text-3xl font-bold text-primary), small label below (text-sm text-secondary)
   - If trend is "up": small green arrow + percentage. If "down": red arrow.
   - If live is true: add a small pulsing green dot next to the value
   - Background: surface-raised, border-subtle, padding comfortable

9. `copyable-field.tsx` — Copyable text field
   - Props: label (string), value (string), masked (optional boolean, default false), mono (optional boolean, default true)
   - Display: label above, value in a dark code-style box (bg surface, mono font, border-subtle)
   - Copy button on the right (Copy icon, changes to Check icon for 2 seconds after click)
   - If masked: show dots, add an eye toggle button to reveal/hide
   - Full width

10. `data-table.tsx` — Simple data table
    - Props: columns (array of { key, label, render? }), data (array of objects), onRowClick (optional)
    - Dark themed table: header row in surface bg, rows in transparent with hover at surface-raised
    - Subtle bottom borders between rows at border-subtle
    - Support for sortable columns (click header to toggle sort)
    - No pagination needed for now — just render all rows

11. `error-banner.tsx` — Error display
    - Props: message (string), onRetry (optional callback)
    - Red-tinted card (rgba(239,68,68,0.1) bg, red border)
    - Error message text with AlertCircle icon
    - Optional "Retry" button on the right

12. `toast.tsx` — Toast notification system
    - Create a ToastProvider context
    - toast.success(message), toast.error(message), toast.info(message)
    - Position: bottom-right, stack vertically
    - Auto-dismiss after 3 seconds
    - Subtle slide-in animation from right
    - Colors: success = green tint, error = red tint, info = blue tint
```

## Prompt E3 — Auth system with role awareness

```
IMPORTANT: Read /mnt/skills/public/frontend-design/SKILL.md before writing any code.

Create the auth system. This needs to be role-aware — clients go to /dashboard, super admins go to /admin.

1. `src/lib/api.ts` — API client
   - Base URL from NEXT_PUBLIC_API_URL env var (default: http://localhost:3000)
   - Export an `api` object with typed methods: get<T>, post<T>, put<T>, delete<T>
   - Each method reads auth token from cookie "flash_token" and sends as Authorization: Bearer header
   - Each method parses JSON response, extracts error messages on non-2xx
   - On 401 response: clear the cookie, redirect to /login
   - On 403 with "suspended" message: redirect to a /suspended page

2. `src/lib/auth-context.tsx` — Auth context provider
   - Provides: user (object | null), isLoading (boolean), login(email, password), signup(email, password, name?), logout()
   - User object shape: { id, email, name, role, publicKey, createdAt }
   - On mount: check for "flash_token" cookie, if found call GET /api/auth/me to validate
   - login/signup: call API, store token in cookie (7 day expiry), set user state
   - logout: clear cookie, set user to null, redirect to /login

3. `src/middleware.ts` — Next.js edge middleware
   - If path starts with /dashboard and no flash_token cookie → redirect to /login
   - If path starts with /admin and no flash_token cookie → redirect to /login
   - If path is /login or /signup and cookie exists → redirect to /dashboard (we'll handle role-based redirect client-side after loading user)
   - Let all other paths through

4. `src/app/(auth)/login/page.tsx` and `src/app/(auth)/signup/page.tsx`:
   - Same design as described in previous prompts (centered card, dark bg, green accent, FlashEngine branding)
   - Login: email + password fields, "Sign in" green button
   - Signup: name (optional) + email + password + confirm password, "Create account" green button
   - On successful auth: check user.role
     - If "SUPER_ADMIN" → redirect to /admin
     - If "CLIENT" → redirect to /dashboard
   - Show form errors inline, loading state on button

5. `src/app/(auth)/layout.tsx`:
   - Centered flex layout, full viewport height
   - Subtle radial green glow at top of page (very subtle, nearly invisible)
   - No sidebar, no navbar

6. `src/app/suspended/page.tsx`:
   - Simple centered message: "Your account has been suspended. Contact support."
   - Logout button below
```

---

# SECTION F — FRONTEND: CLIENT DASHBOARD

---

## Prompt F1 — Dashboard layout with collapsible sidebar

```
IMPORTANT: Read /mnt/skills/public/frontend-design/SKILL.md before writing any code.

Create the client dashboard layout.

1. `src/components/layout/sidebar.tsx`
   - Collapsible sidebar: 240px expanded, 64px collapsed
   - Background: surface (#111111), right border at border-subtle
   - Smooth 200ms transition on collapse
   - Collapse toggle at bottom (ChevronsLeft/ChevronsRight), persist state in localStorage

   Sidebar content:
   - Top: "FlashEngine" + Zap icon (green). Collapsed: just Zap icon.
   - Nav items:
     - "Events" — LayoutGrid icon → /dashboard
     - "Docs" — BookOpen icon → /dashboard/docs
     - "Settings" — Settings icon → /dashboard/settings
   - Active state: green text, green-muted bg, 2px left green border
   - Hover: slight text brighten + subtle bg
   - Collapsed: centered icons with hover tooltip

   Bottom:
   - User email (truncated) + LogOut icon button
   - Collapsed: circle with first letter of email

2. `src/app/dashboard/layout.tsx`
   - Flex: sidebar left, main content taking rest
   - Main: padding 32px, max-w-1200px centered, min-h-screen
   - Wrap children with a div that has the `.animate-page-in` class (fade + slide on mount)
   - Background: #0a0a0a

3. `src/components/layout/page-header.tsx`
   - Props: title, description (optional), action (optional ReactNode)
   - Title: text-2xl font-semibold, description: text-sm text-secondary
   - Action aligned right on same row
   - Bottom border, padding-bottom 24px, margin-bottom 24px

Add CSS animation in globals.css:
.animate-page-in {
  animation: pageIn 200ms ease-out;
}
@keyframes pageIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
```

## Prompt F2 — Events list page with overview metrics

```
IMPORTANT: Read /mnt/skills/public/frontend-design/SKILL.md before writing any code.

Build the main dashboard page at `src/app/dashboard/page.tsx`.

1. Data fetching:
   - Fetch GET /api/admin/overview (client metrics) and GET /api/admin/events (event list) in parallel
   - Loading: show spinner
   - Error: show ErrorBanner with retry

2. Overview section (top of page, above events):
   - 4 StatCard components in a row (grid: 1 col mobile, 2 col md, 4 col lg):
     - "Total Events" — totalEvents count
     - "Users Processed" — totalUsersProcessed count
     - "Avg Conversion" — averageConversionRate as percentage (e.g., "87%"), null → "—"
     - "Avg Utilization" — averageStockUtilization as percentage, null → "—"

3. Page header below metrics:
   - Title: "Events"
   - Action: "Create Event" primary button (Plus icon) → navigates to /dashboard/events/new

4. Events grid (below header):
   - Cards in grid: 1 col mobile, 2 col md, 3 col lg
   - Each card (interactive Card):
     - Event name (font-medium)
     - Badge for status (PENDING=neutral, ACTIVE=success, PAUSED=warning, ENDED=error)
     - "{stockCount} items · Rate: {rateLimit}/s"
     - Relative time ("2 hours ago")
     - Click → /dashboard/events/[id]
   - If no events: EmptyState (Calendar icon, "No events yet", "Create your first flash sale event", button to create page)

5. Create `src/lib/utils.ts` with a `relativeTime(date: string | Date): string` function.
   - "just now" for <1 min, "X minutes ago", "X hours ago", "X days ago", "X months ago"
   - Don't install moment or date-fns for this
```

## Prompt F3 — Create event page

```
IMPORTANT: Read /mnt/skills/public/frontend-design/SKILL.md before writing any code.

Build `src/app/dashboard/events/new/page.tsx`.

Page header: "Create Event", no action button.

Form in a Card, max-w-lg, single column, space-y-6:
- "Event Name" — text input, required, placeholder "Summer Flash Sale"
- "Total Stock" — number input, required, min 1, placeholder "5000"
- "Rate Limit" — number input, required, min 1, max 10000, default 50. Helper: "Maximum winners per second reaching your checkout."
- "Oversubscription Multiplier" — number input, step 0.1, min 1.0, max 3.0, default 1.5. Helper: "Queue capacity = Stock × Multiplier."
- "Webhook URL" — text input, optional, placeholder "https://yourstore.com/webhook". Helper: "Get notified when event status changes."
- Button row: "Cancel" ghost button (navigates back) + "Create Event" primary button (full width)
- Loading state on submit button
- Error display: ErrorBanner at top of form on failure
- Success: redirect to /dashboard/events/[id], show toast "Event created"
```

## Prompt F4 — Event detail page

```
IMPORTANT: Read /mnt/skills/public/frontend-design/SKILL.md before writing any code.

Build `src/app/dashboard/events/[id]/page.tsx`. This is the most complex page.

1. Data:
   - GET /api/admin/events/:id → event details + keys
   - GET /api/admin/events/:id/stats → live stats
   - Auto-refresh stats every 5s when ACTIVE (stop when ENDED/PAUSED or unmount)

2. Page header:
   - Title: event name + Badge for status
   - Actions by status:
     - PENDING: "Activate" primary button → PUT activate, refresh
     - ACTIVE: "End Event" danger button → confirm modal first → PUT end
     - PAUSED: show info text "Event paused by admin" in yellow
     - ENDED: muted text "Ended {relativeTime}"
   - "Duplicate" secondary button always visible → POST duplicate, navigate to new event

3. Stats row — 4 StatCards:
   - "Stock Remaining" — stockRemaining / stockCount, include a thin progress bar below the number (green fill, proportional width)
   - "Queue Depth" — queueDepth, live pulse dot when ACTIVE
   - "Winners" — funnel.won
   - "Verified" — funnel.verified
   - When ACTIVE: live=true prop on stat cards for pulse animation

4. Timeline section (only for ACTIVE and ENDED events):
   - Card with title "Event Timeline"
   - Vertical timeline with dots and connecting lines (CSS only):
     - Created → Activated → First Winner → Stock Depleted → Last Release → Ended
     - Each point shows the timestamp formatted nicely
     - Only show points that have non-null timestamps
     - Active dot is green with pulse for the current stage
   - This is a nice visual for ended events to tell the story of the sale

5. Integration Keys card:
   - "Public Key" — CopyableField (mono)
   - "RSA Public Key" — CopyableField, collapsed by default (expandable textarea)
   - "Signing Secret" — CopyableField (masked by default, eye toggle to reveal). Warning text: "Store this securely. Used for release route HMAC."
   - "Integration Code" — code block showing the integrationSnippet. Mono font, dark bg, copy button.

6. Funnel card:
   - Simple horizontal bars showing flow: total → queued → won → verified
   - Additional counts: soldOut, released
   - Bars are proportional div widths. Colors: queued=blue, won=green, verified=bright green, soldOut=red, released=yellow
   - Each bar has the count and percentage label

7. Bottom: link back to events list
```

## Prompt F5 — Docs and Settings placeholder pages

```
IMPORTANT: Read /mnt/skills/public/frontend-design/SKILL.md before writing any code.

1. `src/app/dashboard/docs/page.tsx`:
   - Header: "Documentation", subtitle "Learn how to integrate FlashEngine"
   - Grid of 4 cards (2 cols on md):
     - "Quick Start" (Rocket icon) — "Get running in 5 minutes"
     - "SDK Reference" (Code icon) — "Browser SDK documentation"
     - "Server Integration" (Server icon) — "Token verification and releases"
     - "Architecture" (GitBranch icon) — "How the engine works"
   - Cards link to "#" for now, interactive hover
   - Below grid: muted text "Documentation coming soon."

2. `src/app/dashboard/settings/page.tsx`:
   - Header: "Settings"
   - Card with sections separated by border-subtle dividers:
     - Account: email (read-only input), name, member since date
     - API: publicKey in CopyableField
     - Danger Zone: "Delete Account" red button, disabled, tooltip "Coming soon"
```

---

# SECTION G — FRONTEND: SUPER ADMIN DASHBOARD

---

## Prompt G1 — Admin layout with separate sidebar

```
IMPORTANT: Read /mnt/skills/public/frontend-design/SKILL.md before writing any code.

Create the super admin layout. It shares components with the client dashboard but has a different sidebar and different routes.

1. `src/components/layout/admin-sidebar.tsx`
   - Same structure as the client sidebar (collapsible, same widths, same animations)
   - Different branding: "FlashEngine" + text "ADMIN" in a small badge next to the logo (red/orange tinted badge to visually distinguish from client view)
   - Nav items:
     - "Overview" — BarChart3 icon → /admin
     - "Clients" — Users icon → /admin/clients
     - "All Events" — LayoutGrid icon → /admin/events
     - "System" — Activity icon → /admin/system
     - "Settings" — Settings icon → /admin/settings
   - Active state: same green accent pattern as client sidebar
   - Bottom: admin email + logout

2. `src/app/admin/layout.tsx`
   - Same flex structure as dashboard layout
   - Uses AdminSidebar instead of client Sidebar
   - Add a role check: if user.role !== "SUPER_ADMIN", redirect to /dashboard
   - Same padding, max-width, animation patterns

3. Protect admin routes: in the layout, check auth context user role. If not SUPER_ADMIN, redirect.
```

## Prompt G2 — Admin overview page (War Room)

```
IMPORTANT: Read /mnt/skills/public/frontend-design/SKILL.md before writing any code.

Build `src/app/admin/page.tsx` — the super admin landing page.

1. Data:
   - GET /api/superadmin/overview — platform stats
   - Auto-refresh every 10 seconds

2. Page header: "Platform Overview" with a live green dot indicator when data is refreshing

3. Top stats — 4 StatCards:
   - "Active Sales" — events.active count, live pulse
   - "Users in Queue" — live.totalUsersInQueue, live pulse
   - "Stock Protected" — live.totalStockRemaining
   - "Throughput Capacity" — live.totalRateLimitCapacity with "/sec" suffix

4. Middle section — "Active Events" Card:
   - DataTable with columns: Client, Event Name, Stock (remaining/total), Queue Depth, Rate Limit, Status, Duration (time since activated)
   - If no active events: show a calm message "No active sales right now"
   - Row click → navigates to /admin/events/[id]
   - Status column uses Badge component
   - Stock column: show as "150/500" with a mini progress bar inline

5. Bottom section — "Last 24 Hours" Card:
   - Simple grid of stats: Events Created, Total Requests, breakdown by result (WON, SOLD_OUT, QUEUED, RATE_LIMITED)
   - Each stat is a smaller version of StatCard — just number + label, no card border, arranged in a 2x3 grid

6. If all API calls are loading, show a full-page centered Spinner
   If any fail, show ErrorBanner with retry
```

## Prompt G3 — Clients management page

```
IMPORTANT: Read /mnt/skills/public/frontend-design/SKILL.md before writing any code.

Build `src/app/admin/clients/page.tsx`.

1. Data: GET /api/superadmin/clients

2. Page header: "Clients", description: "Manage platform clients"

3. Search bar above the table:
   - Input with Search icon, placeholder "Search by email..."
   - Filter the client list client-side as user types (debounce 300ms)

4. DataTable with columns:
   - Email — text-primary
   - Name — text-secondary, show "—" if null
   - Events — total event count
   - Active — active event count, green text if > 0
   - Users Processed — totalUsersProcessed, formatted with comma separators
   - Status — Badge: if suspended, show "Suspended" in red. If not, show "Active" in green.
   - Joined — relative time of createdAt
   - Actions — small icon buttons:
     - If not suspended: Shield icon button (suspend) with red hover. Click shows confirm modal: "Suspend {email}? This will end all their active events."
     - If suspended: ShieldCheck icon button (unsuspend) with green hover. Click shows confirm modal: "Unsuspend {email}?"

5. After suspend/unsuspend action completes, refresh the clients list and show a toast.

6. Empty state: "No clients registered yet" (unlikely but handle it)
```

## Prompt G4 — All Events page (admin view)

```
IMPORTANT: Read /mnt/skills/public/frontend-design/SKILL.md before writing any code.

Build `src/app/admin/events/page.tsx` — shows ALL events across all clients.

1. Data: GET /api/admin/events (admin auth returns all events for SUPER_ADMIN)

2. Page header: "All Events"

3. Filter bar:
   - Status filter: dropdown/select with options: All, Active, Pending, Paused, Ended
   - Client filter: dropdown populated from unique client emails in the events data
   - Both filters apply client-side (filter the fetched array)
   - Show count of filtered results: "Showing X of Y events"

4. DataTable with columns:
   - Event Name — text-primary, click navigates to /admin/events/[id]
   - Client — client email in text-secondary
   - Status — Badge (PENDING=neutral, ACTIVE=success, PAUSED=warning, ENDED=error)
   - Stock — "remaining/total" for active events, just total for others
   - Rate Limit — number + "/s" suffix
   - Created — relative time

5. Click row → navigate to /admin/events/[id]
```

## Prompt G5 — Admin event detail page (with pause/resume controls)

```
IMPORTANT: Read /mnt/skills/public/frontend-design/SKILL.md before writing any code.

Build `src/app/admin/events/[id]/page.tsx`.

This is the same as the client event detail page BUT with additional super admin controls. Instead of duplicating the entire page, create shared components and compose differently.

1. Refactor the event detail sections into shared components in `src/components/events/`:
   - `event-stats.tsx` — the 4 StatCards
   - `event-timeline.tsx` — the vertical timeline
   - `event-keys.tsx` — the integration keys card
   - `event-funnel.tsx` — the funnel visualization

   These accept event and stats data as props. Both the client detail page and admin detail page use them.

2. The admin event detail page shows:
   - All the same sections as client view (stats, timeline, keys, funnel)
   - Additional "Client Info" card at the top: shows client email, client publicKey. Link to the client in /admin/clients.
   - Additional "Admin Actions" card:
     - If ACTIVE: "Pause Event" warning/yellow button → confirm modal "Pause {eventName}? Users will be told the sale is temporarily paused." → PUT /api/admin/events/:id/pause
     - If PAUSED: "Resume Event" primary/green button → PUT /api/admin/events/:id/resume. Also "Force End" danger button.
     - If PENDING: "Activate" primary button + "Force End" danger button
     - If ENDED: no actions, show "Event ended at {endedAt}"
   - All actions show toast on success, refresh data after

3. Page header shows event name + status badge + "by {clientEmail}" in muted text
```

## Prompt G6 — System health page

```
IMPORTANT: Read /mnt/skills/public/frontend-design/SKILL.md before writing any code.

Build `src/app/admin/system/page.tsx`.

1. Data: GET /api/superadmin/system/health, auto-refresh every 10 seconds

2. Page header: "System Health", action: "Refresh" secondary button that force-fetches

3. Three Cards in a single column layout:

   Card 1 — "Redis":
   - Status indicator: large green dot + "Connected" or red dot + "Disconnected"
   - Metric grid (2x2):
     - Memory: "{used} / {max}" or just "{used}" if no max set
     - Operations: "{opsPerSecond}/s"
     - Clients: connected count
     - Keys: total count
   - If circuit breaker is open, show a red warning banner inside the card

   Card 2 — "PostgreSQL":
   - Status: green dot + "Connected"
   - Metric grid (1x3):
     - Total Connections: totalConnections
     - Idle: idleConnections
     - Waiting Queries: waitingQueries (yellow text if > 0, red if > 5)

   Card 3 — "Application":
   - Metric grid (2x2):
     - Uptime: formatted as "Xd Xh Xm"
     - Memory: heap used in MB
     - Cached Events: count from event cache
     - Active Drains: count (list the event publicKeys in a small muted text below)

4. Bottom: last updated timestamp in muted text, updates with each refresh
```

## Prompt G7 — Admin settings page

```
Build `src/app/admin/settings/page.tsx`.

Simple page:
- Header: "Settings"
- Card:
  - Account: email (read-only), role badge showing "SUPER_ADMIN"
  - API URL: show the current API URL (from env) in a CopyableField
  - Admin Secret: CopyableField, masked by default
- Keep it minimal. This page exists for completeness.
```

---

# SECTION H — POLISH

---

## Prompt H1 — Responsive, loading states, and error handling

```
Go through EVERY page in both /dashboard/* and /admin/* routes:

1. Loading: every page shows centered Spinner on initial data load. Buttons show loading state during API calls.

2. Errors: every API call failure shows ErrorBanner with retry button. Network errors: "Unable to connect to FlashEngine API."

3. Responsive:
   - Sidebar auto-collapses below 768px
   - On mobile: sidebar becomes a slide-out drawer with overlay, hamburger menu button in a top bar
   - All grids stack to single column on mobile
   - Tables become horizontally scrollable on small screens
   - Form max-widths become full width on mobile with padding

4. Confirm modals for all destructive actions: end event, suspend client, force end, pause

5. Toast notifications for all success actions: create, activate, end, pause, resume, suspend, unsuspend, duplicate

6. Add the CSS animation class .animate-page-in to all page content wrappers if not already done.

7. Focus states: all interactive elements have visible focus ring using accent green outline-offset-2 for keyboard navigation.

Fix any issues found. Do NOT add new features.
```

## Prompt H2 — Final review

```
Final review of the entire saas-dashboard codebase:

1. Run `npx tsc --noEmit` — fix all TypeScript errors
2. Check for unused imports and components
3. Verify sidebar active state matches current route on both client and admin sidebars
4. Verify auth flow: unauthenticated → /login, login → role-based redirect, logout → /login, 401 → /login
5. Verify SUPER_ADMIN accessing /dashboard gets client view, not admin view (they should be able to see both)
   Actually — if SUPER_ADMIN logs in, they go to /admin. If they manually navigate to /dashboard, let them see it (they have all permissions). Don't block it.
6. Check all CopyableFields work with clipboard API
7. Check auto-refresh starts and stops correctly on event detail and admin overview
8. Verify no hardcoded colors — everything uses tailwind tokens
9. Check dark theme consistency — no white flashes, no mismatched backgrounds

Fix everything found.
```
