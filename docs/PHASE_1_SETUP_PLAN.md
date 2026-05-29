# Abby Tech Smart Hatchery Platform
## Phase 1: Foundation Setup Implementation Plan

This document defines the exact step-by-step implementation for Phase 1 of the Abby Tech platform. This specification focuses heavily on developer experience (DX), maintainable architecture, and a concrete foundation for enterprise scalability.

### 1. Repository & Monorepo Initialization 

**Why Turborepo?**
Turborepo provides an ultra-fast build system for monorepos. We separate the web UI, future mobile app, and generic packages (UI components, DB logic) to prevent redundant code and ensure absolute consistency across platforms.

**Commands to Run:**
```bash
npx create-turbo@latest abbyetech-platform
cd abbyetech-platform
npm install
```

**Resulting Structure:**
```text
abbyetech-platform/
├── apps/
│   ├── web/           # Next.js App Router (our primary Hatchery OS)
│   └── docs/          # Removed/Replaced with API docs if needed
├── packages/
│   ├── ui/            # Shared React components (shadcn/ui + Tailwind)
│   ├── db/            # Supabase schema, Zod validation, TS types
│   ├── eslint-config/ # Shared linting rules
│   └── typescript-config/ # Shared tsconfig
```

### 2. Next.js & TailwindCSS Setup

**Why Next.js App Router?**
It provides native React Server Components (RSCs) and Server Actions, which eliminate the need for an external API layer for the core Hatchery dashboard, reducing infrastructure latency.

*Note: In the Turborepo `apps/web` directory, Next.js and Tailwind are pre-configured. We will upgrade Tailwind to the latest v4 config if needed.*

### 3. shadcn/ui Integration

**Why shadcn/ui?**
It provides beautifully designed, accessible components that we *own* and can customize deeply, without the bloat of a massive UI library. It integrates perfectly with Tailwind.

**Commands (inside `apps/web` or `packages/ui`):**
```bash
npx shadcn@latest init
npx shadcn@latest add button card input table dialog select form toast
```

### 4. Supabase Local Development Setup

**Why Supabase CLI?**
Local development with Supabase ensures every developer has a 1-to-1 replica of production without sharing a dev database (preventing data corruption during testing).

**Commands:**
```bash
# Initialize Supabase inside the project root
npx supabase init

# Start local Supabase instance (Docker required)
npx supabase start
```
*Important: Commit the generated `supabase/` config folder, but NEVER commit the `.env` file.*

### 5. Environment Variable Strategy

We enforce a strict separation of public vs. private variables.
Create an `.env.example` file that all developers copy to `.env.local`.

```env
# .env.example

# Supabase (Public Client Keys)
NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"

# Supabase (Secret Service Role - NEVER EXPOSE TO CLIENT)
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Third-Party (M-Pesa, Twilio, etc.)
TWILIO_SID=""
TWILIO_AUTH_TOKEN=""
```

### 6. Database Migration Workflow

We treat the database schema as code. Changes are NEVER made directly via the Supabase UI in production.

**Workflow:**
1.  Make changes locally using the Supabase Studio (`http://127.0.0.1:54323`).
2.  Generate a local migration: `npx supabase db diff -f create_egg_batches`
3.  Test locally.
4.  Commit the migration file `supabase/migrations/<timestamp>_create_egg_batches.sql`.
5.  CI/CD pipeline runs `supabase db push` upon merging to main.

### 7. Authentication Foundation

We utilize Supabase Auth.
*   **Web App**: Middleware (`middleware.ts`) protects standard routes, verifying the session token.
*   **API Routes**: Server actions use `createServerClient` to pull the token securely from HTTP-only cookies.

### 8. AI-Assisted Development Workflow (Copilot & Codex)

To maximize the output of GitHub Copilot:
1.  **Strict Typing**: Always type component props and database returns explicitly. Copilot reads types to generate accurate code.
2.  **JSDoc Comments**: Precede complex server actions with a natural language description.
    ```typescript
    /**
     * Updates an egg batch status and calculates unviable fallout.
     * Transactional: Updates batch and inserts mortality record simultaneously.
     */
    export async function transitionBatchStatus(...)
    ```
3.  **Modular Envelopes**: Stick to the standard envelope pattern defined in the architecture.

### 9. Developer Tooling & Git Workflow

*   **Linting/Formatting**: Prettier for formatting, ESLint for Next.js best practices. Run `npm run lint` pre-commit using Husky and lint-staged.
*   **Git Workflow**: Trunk-based development. 
    *   Feature branches: `feat/offline-sync-engine`
    *   Bugfixes: `fix/incubation-status-bug`
*   **Recommended VSCode Extensions**: 
    1.  ESLint / Prettier
    2.  Tailwind CSS IntelliSense
    3.  Supabase
    4.  PostgreSQL (for raw SQL execution)
    5.  GitHub Copilot

### 10. Common Mistakes to Avoid
1.  **Leaking Service Keys**: Never use `SUPABASE_SERVICE_ROLE_KEY` on the client. It bypasses RLS completely.
2.  **Neglecting RLS Locally**: Always enable Row Level Security on new tables immediately.
3.  **Client-Side Waterfalls**: Do not fetch deeply relational data from the client via Supabase DB queries. Use React Server Components to fetch data server-side and pass it as cleanly parsed JSON to Client Components.
