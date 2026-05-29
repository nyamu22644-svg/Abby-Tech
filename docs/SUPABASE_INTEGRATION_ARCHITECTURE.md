# Abby Tech Smart Hatchery Platform
## Supabase Integration Architecture & Implementation Standards

This document defines the production-grade integration strategy for Supabase within the Abby Tech Smart Hatchery Platform. It outlines how Next.js App Router interacts securely with PostgreSQL, manages real-time telemetry, handles offline-first data synchronization, and enforces strict security boundaries.

### 1. Client Architecture: Browser vs. Server

We strictly separate database client initialization to prevent data leakage and ensure authentication context is preserved across SSR, Server Actions, and Client Components. We utilize `@supabase/ssr`.

*   **Server Component Client (`lib/supabase/server.ts`)**: 
    *   Used in React Server Components (`page.tsx`, `layout.tsx`) and Server Actions.
    *   Reads and writes Supabase Auth cookies via Next.js `cookies()`.
    *   *Architecture Rule*: All data fetching for initial page loads MUST happen here.
*   **Client Component Client (`lib/supabase/client.ts`)**: 
    *   Used inside `'use client'` boundaries ONLY for real-time WebSocket subscriptions or direct file uploads to storage (saving Next.js bandwidth).
    *   Reads the session from the browser context.
*   **Middleware Client (`lib/supabase/middleware.ts`)**: 
    *   Refreshes stale Auth tokens and enforces global route protection before hitting server components.

### 2. Secure Server-Side Data Access & RLS Integration

*   **Row Level Security (RLS)** is the primary security perimeter. Every query executed via the standard `server.ts` or `client.ts` automatically runs in the context of the currently authenticated `auth.users.id`.
*   **Isolating Tenant Data**: All RLS policies utilize a tenant wrapper function. `create policy "Tenant Isolation" on public.egg_batches for all using (tenant_id = (select auth.jwt()->>'tenant_id'));`
*   **The Service Role Boundary**:
    *   `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Safe for client. Respects RLS.
    *   `SUPABASE_SERVICE_ROLE_KEY`: Bypasses ALL Row Level Security.
    *   *Strict Standard*: The `service_role` client (`lib/supabase/admin.ts`) may ONLY be required deep within backend webhook handlers (e.g., an M-Pesa payment callback where no user session exists) or cron jobs. It must never be imported in standard UI Server Actions.

### 3. Typed Database Client Generation

We eliminate `any` types and runtime typos by injecting PostgreSQL schema definitions directly into the TypeScript compiler.

*   **Workflow**: Run `npx supabase gen types typescript --local > packages/db/src/database.types.ts`.
*   **Integration**: Both client and server Supabase instantiations must pass this generic: `createBrowserClient<Database>(...)`. This ensures Copilot autosuggests exact table names and column payloads.

### 4. Database Transaction Handling

Because the Supabase REST API (PostgREST) does not support wrapping multiple discrete HTTP requests in a single ACID transaction, we enforce the following rule for complex operations:

*   **RPCs for Transactions**: Any operation that requires modifying multiple tables atomically (e.g., decreasing `egg_batches.quantity` AND inserting into `mortality_logs`) **MUST** be implemented as a PostgreSQL Stored Procedure (RPC).
*   **Execution**: Next.js calls `await supabase.rpc('log_mortality_transaction', payload)`. If any step fails inside the DB, PostgreSQL rolls back the entire operation, preventing corrupted inventory states.

### 5. Realtime Subscription Architecture

We use Supabase Realtime (WebSockets) strictly for non-critical dashboard updates.

*   **Implementation**: Abstracted into a custom hook `useIncubatorTelemetry(incubatorId)`.
*   **Flow**: 
    1. Page loads, SSR fetches the last known state.
    2. Client mounts, connects to `supabase.channel('telemetry')`, listens for `INSERT` on `sensor_readings`.
    3. Payload updates local React state for graphs/gauges.
*   **Resilience**: The UI must function normally if the WebSocket drops. Historical data is the source of truth.

### 6. File Upload / Storage Strategy (Mortality Photos)

To offload bandwidth from our Next.js edge nodes:
*   **Direct-to-Storage**: Client components upload images directly to Supabase Storage buckets using `supabase.storage.from('mortality_evidence').upload()`.
*   **Security**: Buckets have RLS enabled. Only authenticated custom roles (`WORKER`) can `INSERT` into the bucket.
*   **Database Link**: Once the client receives the file path from Storage, it passes the path to the Next.js Server Action to bind it to the `mortality_logs` database row.

### 7. Offline Synchronization Compatibility

Supabase clients expect an active network connection. We bridge this with Dexie.js for offline support.

*   **Read Strategy (Stale-While-Revalidate)**: SSR seeds the initial DOM. We dump the raw payload into IndexedDB cache. If the worker goes offline and reloads the app, the Service Worker intercepts the request, loads the app shell, and `useOfflineQuery` pulls data from IndexedDB.
*   **Write Strategy (Mutation Queue)**: 
    *   Worker submits form -> `react-hook-form` generates payload.
    *   If offline, payload pushed to IndexedDB `sync_queue` table with `status = 'pending'`.
    *   Background Sync API (or custom polling hook) detects `navigator.onLine`.
    *   Queue processor serially calls Next.js Server Actions with the stored payloads.
    *   Server Action handles `sync_version` collision detection (returning HTTP 409 Conflict if stale).

### 8. Error Handling and Retry Architecture

*   **Standardized Postgres Error Mapping**: We wrap Supabase responses. If `error` exists, a utility maps standard PostgreSQL error codes (e.g., `23505` = Unique Violation) to human-readable UI errors ("This batch number already exists").
*   **Retries**: Utilized only for 5xx errors or network timeouts. Client-side mutations utilize a standardized retry envelope (max 3 attempts, exponential backoff) before falling back to the "Save to Offline Queue" workflow.

### 9. Edge Function Organization vs Next.js

*   **Next.js App Router (`/app/api`)**: Handles 95% of operational logic, Auth callbacks, cron executions, and standard webhooks.
*   **Supabase Edge Functions (`/supabase/functions`)**: Reserved exclusively for high-throughput IoT ingestion that requires single-digit millisecond response times and direct database inserts without waking up a Next.js serverless instance. (e.g., `mqtt-telemetry-ingest`).

### 10. Migration Workflow Strategy

*   **Strict Immutable Migrations**: Once deployed to staging/prod, a migration file is immutable.
*   **Local Development**: Engineers use `supabase db diff` to capture state machine changes, table additions, or RLS policy updates into version-controlled `.sql` files within `supabase/migrations/`.
*   **Deployment**: CI/CD runs `supabase db push` against the Staging environment. If tests pass, it runs against Production. UI changes deploy immediately after.
