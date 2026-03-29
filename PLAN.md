# ⚡ FlashDrop — Phase 1 Project Plan

> **Project Manager Note:** This file is the single source of truth for architecture decisions, feature progress, and current status. It is updated automatically after every major milestone.

---

## 🏗️ Core Architecture

**Stack (explicit):**

- **Node.js 22** — runtime
- **pnpm** — package manager (`/server` and `/client`)
- **Express.js** — HTTP API (TypeScript)
- **Prisma 7** — ORM with the standard **`@prisma/adapter-pg`** PostgreSQL adapter
- **PostgreSQL** — primary database
- **Next.js** (App Router) + **Tailwind CSS** — frontend
- Supporting: **Zod** (validation), **JWT + bcrypt** (auth), **Cloudinary** (images)

| Layer | Technology | Notes |
|---|---|---|
| **Runtime** | Node.js 22 (v22.22.0) | LTS, confirmed |
| **Package Manager** | pnpm (v10.18.0) | Used in both `/server` and `/client` |
| **Backend Framework** | Express.js 5 with TypeScript | Service-Repository pattern |
| **ORM** | Prisma 7 (`@prisma/client ^7.6.0`) | With standard `@prisma/adapter-pg` |
| **Database** | PostgreSQL (NeonDB) | Pooler for runtime, direct URL for migrations |
| **Validation** | Zod 4 | Schema-first validation on all endpoints |
| **Auth** | JWT + bcrypt | httpOnly cookie + Authorization header |
| **Image Storage** | Cloudinary SDK v2 | Backend handles upload, stores `image_url` in DB |
| **Frontend** | Next.js (App Router) + Tailwind CSS | With shadcn/ui + Lucide Icons |
| **State Management** | React Context (`AuthContext`) | Phase 1 only; no external state lib |

### Backend Architecture Pattern
```
routes/ → controllers/ → services/ → repositories/ → prisma (DB)
```

### How we keep this plan current

After each **completed feature** or **major architecture decision**, update this file in the same session: adjust **Feature Roadmap** checkboxes (`[ ]` / `[x]`), refresh **Current Status** (what is in progress, blocked, or verified), and bump **Last updated** with the date. That way the project never loses its place.

### Environment Variables (server/.env)
| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Pooler connection for runtime queries |
| `DIRECT_URL` | Non-pooler for `prisma migrate dev` |
| `JWT_SECRET` | Token signing key |
| `JWT_EXPIRES_IN` | Token lifetime (default: 7d) |
| `ALLOWED_ORIGINS` | CORS whitelist |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary config |
| `CLOUDINARY_API_KEY` | Cloudinary config |
| `CLOUDINARY_API_SECRET` | Cloudinary config |

---

## 📋 Feature Roadmap

Phase 1 work is grouped below as **(1) Auth & users**, **(2) Seller dashboard**, **(3) Customer dashboard**, **(4) Buy Now checkout** (plus shared design system). Setup and infrastructure are listed first.

### 🔧 Setup & Infrastructure

- [x] Initialize Express backend with TypeScript
- [x] Configure `tsconfig.json`
- [x] Set up Prisma 7 with `@prisma/adapter-pg`
- [x] Write `prisma.config.ts` (Prisma v7 style — no URLs in `schema.prisma`)
- [x] Write full database schema (`User`, `Address`, `Product`, `Favorite`, `Order`, `OrderItem`)
- [x] Configure CORS, cookie-parser, body-parsing middleware
- [x] Set up global error handler middleware
- [x] Set up Cloudinary SDK in `server/src/lib/cloudinary.ts`
- [x] Set up Multer upload middleware (`upload.middleware.ts`)
- [x] Create `server/.env` from `.env.example`
- [x] **Run first Prisma migration** (`init_flash_sale_schema` — applied 2026-03-29)
- [x] **Generate Prisma client** (`pnpm prisma generate`) ← all 6 models ready
- [x] Initialize Next.js (App Router) with Tailwind CSS + shadcn/ui
- [x] Set up `AuthContext` (React Context for auth state)
- [x] Create `client/.env.local` (`NEXT_PUBLIC_API_URL=http://localhost:5000`)
- [x] Set up API client (`client/src/lib/api.ts`)
- [x] Create shared `Navbar` component

---

### 🔐 (1) Authentication & Users

**Backend**
- [x] `POST /api/auth/register` — create user, hash password with bcrypt
- [x] `POST /api/auth/login` — verify credentials, return JWT
- [x] Auth middleware (`auth.middleware.ts`) — verify JWT on protected routes
- [x] `GET /api/auth/me` — return current user from JWT

**Frontend**
- [x] Login page (`/login`) — dark-themed glass card, animated
- [x] Register page (`/register`) — role selection (SELLER / CUSTOMER)
- [x] Auto-redirect to dashboard by role after login

---

### 🛍️ (2) Seller Dashboard

**Backend**
- [x] `GET /api/products/my` — seller's own products
- [x] `POST /api/products` — create product with Cloudinary image upload
- [x] `PATCH /api/products/:id` — update product
- [x] `PATCH /api/products/:id/terminate` — set status to TERMINATED

**Frontend**
- [x] Seller dashboard layout (`/seller/dashboard`)
- [x] Products overview — active/upcoming/sold-out tracking with order counts
- [x] "Create Sale" form page (`/seller/products/new`) — with image upload
- [x] Product edit page (`/seller/products/[id]/edit`) — pre-filled form with PATCH + Cloudinary
- [x] Analytics widgets (orders placed, revenue, active/upcoming counts) — on dashboard

---

### 👤 (3) Customer Dashboard

**Backend**
- [x] `GET /api/addresses` — list addresses
- [x] `POST /api/addresses` — create address
- [x] `PATCH /api/addresses/:id` — update address
- [x] `DELETE /api/addresses/:id` — delete address
- [x] `GET /api/products` — browse ACTIVE + UPCOMING products
- [x] `GET /api/products/:id` — product detail
- [x] `GET /api/favorites` — list favorites
- [x] `POST /api/favorites/:productId` — add to favorites
- [x] `DELETE /api/favorites/:productId` — remove from favorites
- [x] `GET /api/orders` — list my orders
- [x] `GET /api/orders/:id` — order detail

**Frontend**
- [x] Browse page (`/browse`) — product gallery with cards
- [x] Favorites page (`/favorites`)
- [x] Orders page (`/orders`)
- [x] Profile page (`/profile`) — user info + address management

---

### 🛒 (4) Phase 1 "Buy Now" Checkout Flow

**Backend**
- [x] `POST /api/orders` — create PENDING order, atomically decrement `stock_qty`
- [x] `PATCH /api/orders/:id/complete` — mark order COMPLETED
- [x] `PATCH /api/orders/:id/fail` — mark order FAILED (timer expired)
- [x] Transaction logic: check stock → decrement → create order (atomic)

**Frontend**
- [x] `/checkout/[productId]` — Stage 1: "Waiting in Queue" (3s animated progress bar + bouncing dots)
- [x] Stage 2: "Sold Out" screen (if stock = 0 after queue)
- [x] Stage 3: Address selector (radio-style cards) + "Continue to Payment" button
- [x] Stage 4: "Confirm Payment" screen with 3-minute countdown timer, pulse glow, order summary
- [x] Stage 5: Animated success screen (spring animation, order summary card)
- [x] All 5 stages wired — Framer Motion `AnimatePresence` transitions between stages

---

### 🎨 Shared design system (cross-cutting)

- [x] Dark-themed CSS design tokens (CSS Variables in `globals.css`)
- [x] Glass card effect (`.glass` utility class)
- [x] Gradient text (`.gradient-text`)
- [x] Button variants (`.btn-primary`)
- [x] Input styles (`.input`, `.label`)
- [x] Spinner animation
- [x] Motion animations (Framer Motion)

---

## 🚧 Current Status

**Last updated:** 2026-03-29 — PLAN refresh + Phase 1 verification pass

**What we are working on now:** confirming Phase 1 with automated checks (`tsc`, Prisma validate) and environment readiness—not building new Phase 1 features until something fails verification or you expand scope.

### ✅ Roadmap reality (Phase 1 build)

- All items under **Setup**, **(1)–(4)**, and **Shared design system** above are marked **[x]** in this file; implementation lives in `/server` and `/client`.
- Active Prisma schema: [`server/prisma/schema.prisma`](server/prisma/schema.prisma) (Phase 2-oriented fields preserved: `favorites.added_at`, `products.sale_starts_at`, `orders.status` PENDING, `order_items.locked_price`, `stock_qty`).
- Architecture: Service-Repository pattern; JWT + bcrypt; Cloudinary + Multer on the backend; Next.js App Router + Tailwind + shadcn/Radix + Lucide on the client.

### 🔴 Verify before calling it “done” in your environment

1. **`server/.env`** — `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `ALLOWED_ORIGINS`, and **Cloudinary** vars (uploads fail without Cloudinary credentials).
2. **`client/.env.local`** — `NEXT_PUBLIC_API_URL` (e.g. `http://localhost:5000`) must match the API origin.
3. **Automated checks** — run `pnpm exec tsc --noEmit` in `/server` and `/client`; run Prisma validate/generate from `/server` as needed after schema changes. *(Latest run: 2026-03-29 — `tsc` clean on both packages; `prisma validate` OK.)*
4. **Manual smoke** — register → login → browse → Buy Now → full checkout (queue, stock check, address, 3-minute timer, pay, success).

### 🟡 Polish backlog (optional, not blocking Phase 1 scope)

- Responsive passes on small screens; Next.js error boundary / friendlier unhandled errors.

### 🟢 Phase 1 scope

Foundational CRUD + Buy Now flow only—**no** Redis, BullMQ, or queue infrastructure (see Phase 2 preview below).

---

## 🔮 Phase 2 Preview (Out of Scope Now)

> The following are **deliberately deferred** to Phase 2. The schema and field choices above already account for them.

- Redis for inventory cache (`stock_qty` sync)
- BullMQ for checkout queue
- Priority queue sorted by `favorites.added_at`
- `sale_starts_at` triggers for cache pre-warming
- WebSocket push for real-time seat counts
