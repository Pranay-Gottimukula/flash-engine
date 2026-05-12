# Flash Sale Dashboard — Claude Code Prompts (Frontend)

## Important: Feed these prompts sequentially. Each builds on the previous one. Verify each step works before moving on.

## Pre-requisite: Make sure you're working inside `apps/saas-dashboard/`. This is a separate Next.js project, not inside engine-gateway.

---

## PHASE F1 — Project Setup & Design System

### Prompt F1.1 — Initialize Next.js project and design tokens

```
A Next.js 14+ project is created in current directory (apps/saas-dashboard/) using App Router with TypeScript and
Tailwind CSS.

After scaffolding, set up the design system:

IMPORTANT: Read /mnt/skills/public/frontend-design/SKILL.md before writing any code.

Color palette — dark theme, green accent (think Linear meets Spotify):
- Background: #0a0a0a (page), #111111 (sidebar), #1a1a1a (cards/surfaces)
- Borders: rgba(255, 255, 255, 0.06) for subtle dividers, rgba(255, 255, 255, 0.1) for input borders
- Text: #f5f5f5 (primary), #a1a1a1 (secondary/muted), #6b6b6b (tertiary/disabled)
- Accent green: #22c55e (primary CTA), #16a34a (hover state), #15803d (pressed), rgba(34, 197, 94, 0.1) (subtle background tint)
- Error: #ef4444, Warning: #f59e0b, Success: #22c55e (same as accent)

Configure these in tailwind.config.ts as custom colors under `extend.colors`:
- `surface: { DEFAULT: '#111111', raised: '#1a1a1a', overlay: '#222222' }`
- `border: { subtle: 'rgba(255,255,255,0.06)', DEFAULT: 'rgba(255,255,255,0.1)', strong: 'rgba(255,255,255,0.2)' }`
- `accent: { DEFAULT: '#22c55e', hover: '#16a34a', pressed: '#15803d', muted: 'rgba(34,197,94,0.1)' }`
- `text: { primary: '#f5f5f5', secondary: '#a1a1a1', tertiary: '#6b6b6b' }`

Set body background to #0a0a0a in globals.css. Set default text color to #f5f5f5. Remove all default Next.js boilerplate styles and page content.

Font: Use Inter from next/font/google. Set as the default sans-serif.

Install these packages:
- lucide-react (icons)
- clsx (conditional classes)
- js-cookie (for auth token storage)

Create a `src/lib/cn.ts` utility that combines clsx + twMerge if needed, or just exports clsx.

Do NOT create any pages or components yet beyond the bare root layout.
```

### Prompt F1.2 — Reusable UI components

```
IMPORTANT: Read /mnt/skills/public/frontend-design/SKILL.md before writing any code.

Create a set of reusable UI components in `src/components/ui/`. These are the building blocks for every page. Style them to match the dark theme design tokens from tailwind.config.ts.

Every component should be clean, minimal, and consistent. No gradients, no shadows heavier than subtle, no flashy effects.

1. `button.tsx` — Button component
   - Variants: "primary" (green bg, white text), "secondary" (transparent bg, subtle border, light text), "ghost" (no border, text only, slight hover bg), "danger" (red bg)
   - Sizes: "sm", "md" (default), "lg"
   - States: disabled (opacity 50%, no pointer), loading (show a small spinner, disable click)
   - Transition: smooth 150ms on background and border color
   - Use `<button>` element, forward ref, accept all native button props

2. `input.tsx` — Text input
   - Dark surface background (#1a1a1a), border at rgba(255,255,255,0.1), focus border transitions to accent green
   - Label text in secondary color above the input
   - Error state: red border, error message text below in red
   - Include optional `leftIcon` prop for an icon inside the input
   - Full width by default

3. `card.tsx` — Card container
   - Background: surface-raised (#1a1a1a), 1px border at border-subtle, rounded-lg
   - Optional `header` prop (renders a top section with bottom border)
   - Padding: p-5 default
   - No hover effects unless `interactive` prop is true (then slight border brighten on hover)

4. `badge.tsx` — Status badge
   - Variants: "success" (green), "warning" (yellow), "error" (red), "neutral" (gray), "info" (blue)
   - Small pill shape, subtle background tint with matching text color
   - Used for event statuses: PENDING = neutral, ACTIVE = success, ENDED = error

5. `modal.tsx` — Modal dialog
   - Overlay: black at 60% opacity with backdrop-blur-sm
   - Content: surface-raised background, border-subtle, rounded-xl, max-w-md centered
   - Close button in top right (X icon from lucide-react)
   - Animate in: fade + slight scale up (use CSS transitions, not framer-motion)
   - Trap focus inside modal

6. `spinner.tsx` — Loading spinner
   - Simple rotating circle using CSS animation
   - Accepts size prop: "sm" (16px), "md" (24px), "lg" (32px)
   - Color defaults to accent green, accepts custom color

7. `empty-state.tsx` — Empty state placeholder
   - Centered icon, title, description, optional action button
   - Used when event list is empty, no data, etc.

Do NOT create any page layouts or navigation yet.
```

---

## PHASE F2 — Auth System

### Prompt F2.1 — Auth context and API client

```
Read the engine-gateway's admin auth middleware to understand the auth model.

Context: The dashboard authenticates with the engine-gateway API. Right now the engine uses a single ADMIN_SECRET for all admin routes. For the dashboard auth, we need a simple email+password system.

BUT — we don't have user auth endpoints in the engine-gateway yet. So for now, build the frontend auth flow with these assumptions:
- POST /api/auth/signup — body: { email, password } → returns { token, client: { id, email } }
- POST /api/auth/login — body: { email, password } → returns { token, client: { id, email } }
- The token is a JWT that the dashboard stores and sends as `Authorization: Bearer {token}` on all subsequent API calls.

Create these files:

1. `src/lib/api.ts` — API client
   - Base URL from environment variable NEXT_PUBLIC_API_URL (default: http://localhost:3000)
   - Export an `api` object with methods: get, post, put, delete
   - Each method automatically attaches the auth token from cookies
   - Each method handles response parsing and error extraction
   - On 401 response, clear the stored token and redirect to /login
   - All methods return typed responses using generics

2. `src/lib/auth-context.tsx` — Auth context provider
   - React context providing: user (Client object or null), isLoading (boolean), login(email, password), signup(email, password), logout()
   - On mount, check for existing token in cookies. If found, validate it by calling a GET /api/auth/me endpoint (if it fails, clear token).
   - login/signup: call the API, store token in cookie (httpOnly if possible, otherwise js-cookie with secure flag), set user state.
   - logout: clear cookie, set user to null, redirect to /login.
   - Wrap the app in this provider in the root layout.

3. `src/middleware.ts` — Next.js middleware for route protection
   - If path starts with /dashboard and no auth token cookie exists, redirect to /login
   - If path is /login or /signup and token exists, redirect to /dashboard
   - Let all other paths through

Keep the auth simple. No refresh tokens, no OAuth. Just a JWT stored in a cookie.
```

### Prompt F2.2 — Login and Signup pages

```
IMPORTANT: Read /mnt/skills/public/frontend-design/SKILL.md before writing any code.

Create the login and signup pages. These should be visually clean and minimal — a centered card on a dark background.

1. `src/app/login/page.tsx`
   - Centered vertically and horizontally on the page
   - Card (use the Card component) containing:
     - App logo/name at top: "FlashEngine" in bold, with a small lightning bolt icon (Zap from lucide-react) in accent green next to it
     - Subtitle: "Protect your flash sales from crashes" in muted text
     - Email input field
     - Password input field
     - "Sign in" primary button (full width, green)
     - Divider line with text "or"
     - Link to signup: "Don't have an account? Sign up" — "Sign up" part in accent green
   - Show loading spinner on the button while login is in progress
   - Show error message below the form if login fails (use the input error styling, but as a general form error)
   - On success, redirect to /dashboard
   - Layout: No sidebar, no navbar. Just the centered card. Set a subtle radial gradient at the top of the page background (very subtle green glow, nearly invisible — just enough to add depth).

2. `src/app/signup/page.tsx`
   - Same layout as login
   - Fields: Email, Password, Confirm Password
   - Client-side validation: email format, password minimum 8 characters, passwords match
   - "Create account" primary button
   - Link to login: "Already have an account? Sign in"
   - On success, redirect to /dashboard (auto-login after signup)

3. Create a shared layout `src/app/(auth)/layout.tsx` that wraps both login and signup:
   - Full viewport height, centered flex container
   - Move login to `src/app/(auth)/login/page.tsx` and signup to `src/app/(auth)/signup/page.tsx`

The pages should feel like entering a premium developer tool — minimal, confident, no unnecessary decoration.
```

---

## PHASE F3 — Dashboard Layout Shell

### Prompt F3.1 — Sidebar and main layout

```
IMPORTANT: Read /mnt/skills/public/frontend-design/SKILL.md before writing any code.

Create the dashboard layout with a collapsible sidebar inspired by Linear's UI.

1. `src/components/layout/sidebar.tsx`
   - Width: 240px expanded, 64px collapsed
   - Background: surface (#111111), right border at border-subtle
   - Smooth transition on collapse (200ms ease)
   - Collapse toggle: a small button at the bottom of the sidebar (ChevronsLeft icon when expanded, ChevronsRight when collapsed). Store collapsed state in localStorage so it persists.

   Sidebar content (top to bottom):
   - Logo area: "FlashEngine" text + Zap icon (when expanded), just Zap icon (when collapsed). Same style as login page.
   - Navigation section with items:
     - "Events" with LayoutGrid icon — links to /dashboard
     - "Docs" with BookOpen icon — links to /dashboard/docs
     - "Settings" with Settings icon — links to /dashboard/settings
   - Active nav item: accent green text, accent-muted background (rgba(34,197,94,0.1)), left 2px accent green border
   - Inactive: text-secondary color, hover brightens text and adds very subtle bg
   - When collapsed, only show icons centered, with a tooltip on hover showing the label

   Bottom of sidebar:
   - User section: show user email (truncated if long) and a logout button (LogOut icon)
   - When collapsed, just show a circle avatar placeholder with first letter of email

2. `src/app/dashboard/layout.tsx`
   - Flexbox: sidebar on left, main content area taking remaining space
   - Main content area: padding 32px, max-width 1200px (centered if wider), min-height 100vh
   - Background: #0a0a0a (same as page bg)
   - This layout wraps all /dashboard/* pages

3. `src/components/layout/page-header.tsx`
   - Reusable component for page titles
   - Props: title (string), description (optional string), action (optional ReactNode — for a button on the right)
   - Title: text-2xl font-semibold text-primary
   - Description: text-sm text-secondary, margin-top 4px
   - Action aligned to the right on the same row as the title
   - Bottom border at border-subtle, padding-bottom 24px, margin-bottom 24px

Do NOT create any page content yet — just the layout shell. The dashboard index page should show the PageHeader with title "Events" and nothing else for now.
```

---

## PHASE F4 — Events Pages

### Prompt F4.1 — Events list page (dashboard index)

```
IMPORTANT: Read /mnt/skills/public/frontend-design/SKILL.md before writing any code.

Build the main events list page at `src/app/dashboard/page.tsx`.

This page shows all events created by the logged-in client.

1. Data fetching:
   - Call GET /api/admin/events using the api client (from lib/api.ts)
   - Use React state with useEffect for fetching (or create a simple useApi hook)
   - Show a loading spinner while fetching
   - Show the EmptyState component if no events exist (icon: Calendar, title: "No events yet", description: "Create your first flash sale event to get started", action: button linking to create page)

2. Page header:
   - Title: "Events"
   - Action: "Create Event" primary button (Plus icon) linking to /dashboard/events/new

3. Events grid:
   - Display events as cards in a grid (1 column on mobile, 2 on medium, 3 on large)
   - Each event card (use Card component with interactive prop):
     - Event name (font-medium, text-primary)
     - Status badge (PENDING = neutral, ACTIVE = success, ENDED = error)
     - Stats row: "{stockCount} items · Rate: {rateLimit}/s"
     - Created date in relative format ("2 hours ago", "3 days ago") — write a simple relative time formatter utility in `src/lib/utils.ts`, don't install a library for this
     - Click the card → navigate to /dashboard/events/[id]

4. Add a subtle hover effect on cards: border color transitions to border-strong (rgba(255,255,255,0.2))

The page should feel clean and scannable — no clutter. Information hierarchy: name > status > stats > date.
```

### Prompt F4.2 — Create event page

```
IMPORTANT: Read /mnt/skills/public/frontend-design/SKILL.md before writing any code.

Build the create event page at `src/app/dashboard/events/new/page.tsx`.

1. Page header:
   - Title: "Create Event"
   - No action button

2. Form inside a Card:
   - Fields:
     - "Event Name" — text input, required, placeholder "Summer Flash Sale"
     - "Total Stock" — number input, required, min 1, placeholder "5000"
     - "Rate Limit" — number input, required, min 1, max 10000, default 50, placeholder "50". Helper text below: "Maximum winners per second. Controls how fast users reach your checkout."
     - "Oversubscription Multiplier" — number input, step 0.1, min 1.0, max 3.0, default 1.5. Helper text: "Queue capacity = Stock × Multiplier. Higher values keep more users in queue for potential stock releases."
   - Submit button: "Create Event" (primary, full width at bottom of form)
   - Show loading state on button during submission

3. On submit:
   - POST /api/admin/events with body: { name, stockCount, rateLimit, oversubscriptionMultiplier }
   - On success, redirect to /dashboard/events/[id] (the detail page for the new event)
   - On error, show error message at top of form in a subtle red-tinted card

4. Add a "Cancel" ghost button next to the submit button that navigates back to /dashboard

5. Form layout: single column, max-w-lg, each field has comfortable vertical spacing (space-y-6)

The form should feel spacious and easy to scan — not cramped.
```

### Prompt F4.3 — Event detail page

```
IMPORTANT: Read /mnt/skills/public/frontend-design/SKILL.md before writing any code.

Build the event detail page at `src/app/dashboard/events/[id]/page.tsx`. This is the most complex page — it shows event info, live stats, keys, and action controls.

1. Data fetching:
   - Call GET /api/admin/events/:id to get event details + keys
   - Call GET /api/admin/events/:id/stats to get live statistics
   - Auto-refresh stats every 5 seconds when event status is ACTIVE (useEffect with setInterval)
   - Stop auto-refresh when status is ENDED or component unmounts

2. Page header:
   - Title: event name
   - Status badge next to the title
   - Action area: contextual buttons based on status:
     - PENDING: "Activate Event" primary button → calls PUT /api/admin/events/:id/activate, then refreshes data
     - ACTIVE: "End Event" danger button → shows confirmation modal first, then calls PUT /api/admin/events/:id/end
     - ENDED: no action buttons, show "Event ended" text in muted color

3. Top stats row — 4 metric cards in a horizontal grid:
   - "Stock Remaining" — live.stockRemaining / event.stockCount with a subtle progress bar
   - "Queue Depth" — live.queueDepth (number of people currently waiting)
   - "Total Winners" — funnel.won
   - "Verified" — funnel.verified (people who completed payment)
   - Each metric card: Card component, large number in text-primary, label in text-secondary below
   - For ACTIVE events, the numbers should have a subtle pulse animation (CSS only) to indicate they're live

4. Integration Keys section — a Card below the stats:
   - Title: "Integration Keys"
   - Show publicKey in a copyable code field (monospace, dark bg, with a copy button using clipboard API)
   - Show rsaPublicKey in a copyable textarea (collapsed by default, expandable)
   - Show signingSecret in a copyable code field — BUT masked by default (show •••••••), with an eye toggle to reveal. Show a warning: "This secret is shown once. Store it securely."
   - Show the integrationSnippet in a code block with basic syntax styling (just monospace + code bg, don't need a full syntax highlighter)
   - Copy buttons should show a brief "Copied!" feedback (change icon to Check for 2 seconds)

5. Event Funnel section — a Card showing the conversion funnel:
   - Horizontal bar chart or simple stacked visualization showing:
     totalRequests → queued → won → verified
   - Also show: soldOut, released counts
   - Use simple HTML/CSS bars — no charting library needed. Each bar is a colored div with width proportional to the count relative to totalRequests.
   - Colors: queued = blue, won = green, verified = accent green (brighter), soldOut = red, released = yellow

6. Activity section at the bottom:
   - For now, just show the raw funnel numbers in a clean table format (label | count | percentage of total)
   - This can be enhanced later with actual activity logs

Build a reusable `CopyableField` component in `src/components/ui/copyable-field.tsx` for the key display pattern — it'll be used elsewhere too.

The page should feel like a mission control dashboard — information-dense but organized. No scrolling needed to see the most critical info (stats + status) on a normal screen height.
```

---

## PHASE F5 — Docs & Settings Placeholder Pages

### Prompt F5.1 — Docs and settings pages

```
IMPORTANT: Read /mnt/skills/public/frontend-design/SKILL.md before writing any code.

Create placeholder pages for docs and settings.

1. `src/app/dashboard/docs/page.tsx`
   - Page header: title "Documentation", description "Learn how to integrate FlashEngine with your store"
   - Show 3-4 cards in a grid, each representing a doc section. Each card has an icon, title, and brief description:
     - "Quick Start" (Rocket icon) — "Get up and running in 5 minutes"
     - "SDK Reference" (Code icon) — "Browser SDK API documentation"  
     - "Server Integration" (Server icon) — "Verify tokens and handle releases"
     - "Architecture" (GitBranch icon) — "How the queue engine works under the hood"
   - Cards are clickable (interactive) but link to "#" for now
   - Below the grid, add a muted text: "Documentation is being written. Check back soon."

2. `src/app/dashboard/settings/page.tsx`
   - Page header: title "Settings"
   - Single card with sections:
     - Account section: show email (read-only), member since date
     - API section: show the client's publicKey in a copyable field
     - Danger zone: "Delete Account" danger button (disabled, with tooltip "Coming soon")
   - Keep it simple — this page just needs to exist to make the sidebar feel complete

Both pages should maintain the same visual language as the events pages — consistent spacing, card usage, and typography.
```

---

## PHASE F6 — Polish & Final Touches

### Prompt F6.1 — Loading states, error handling, and transitions

```
Go through every page in the dashboard and ensure consistent UX:

1. Loading states:
   - Every page that fetches data should show a centered Spinner on initial load
   - Buttons that trigger API calls should show loading state (spinner inside button, disabled)
   - Never show a blank page — always show either content, loading, or empty state

2. Error handling:
   - If an API call fails, show a subtle error banner at the top of the content area (red-tinted card with the error message and a "Retry" button)
   - Network errors should show a specific message: "Unable to connect to FlashEngine API. Check your connection."
   - Create a reusable `ErrorBanner` component in `src/components/ui/error-banner.tsx`

3. Page transitions:
   - Add a subtle fade-in animation to page content on mount (opacity 0→1, translateY 8px→0, duration 200ms)
   - Use CSS animation, not framer-motion. Create a utility class `.animate-page-in` in globals.css

4. Responsive:
   - Sidebar should auto-collapse on screens below 768px
   - On mobile, sidebar should overlay the content as a drawer (click outside to close)
   - Cards grid should stack to single column on mobile
   - Form max-width should be full width on mobile with appropriate padding

5. Confirm modal for destructive actions:
   - "End Event" should show a modal: "Are you sure you want to end {eventName}? This cannot be undone." with "Cancel" (secondary) and "End Event" (danger) buttons.

6. Toast/notification for success actions:
   - After creating an event: brief success message
   - After activating: brief success message
   - After ending: brief message
   - Use a simple toast component positioned at bottom-right. Auto-dismiss after 3 seconds. Create `src/components/ui/toast.tsx` with a toast context provider.

Do NOT add any new pages or features. Just polish what exists.
```

### Prompt F6.2 — Final review pass

```
Do a final review of the entire saas-dashboard codebase:

1. Check that all pages follow the same spacing, typography, and color conventions. Look for any hardcoded colors that should use the tailwind design tokens instead.

2. Ensure no TypeScript errors (run `npx tsc --noEmit`).

3. Ensure no unused imports or components.

4. Check that the sidebar active state correctly highlights based on the current route.

5. Make sure the auth flow works end-to-end:
   - Unauthenticated user → redirected to /login
   - Login → redirected to /dashboard
   - Logout → redirected to /login
   - Token expired (401 from API) → redirected to /login

6. Check that all copyable fields have working clipboard functionality with visual feedback.

7. Verify the auto-refresh on the event detail page starts and stops correctly based on event status.

8. Make sure all interactive elements have visible focus states (for keyboard navigation) using the accent green outline.

Fix any issues you find.
```
