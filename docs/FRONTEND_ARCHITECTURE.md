# Abby Tech Smart Hatchery Platform
## Frontend Architecture & Design System Standards

This document establishes the frontend engineering standards for the Abby Tech operational dashboard. Designed for a Next.js App Router environment, these guidelines ensure a highly maintainable, scalable, and operationally rigorous user interface tailored for an industrial agricultural setting.

---

### 1. Frontend Folder & Module Architecture

We utilize a **feature-based architecture** combined with standard Next.js App Router conventions to avoid massive, disorganized `components/` directories.

```text
/app
  /(dashboard)              # Route group sharing the main operational layout
    /batches                # Domain routes
    /incubators
  /api                      # Next.js route handlers (ingestion, external APIs)
/components
  /ui                       # "Dumb" Shadcn/UI primitives (buttons, inputs)
  /layouts                  # Shared wrappers (Sidebar, Topbar)
  /features                 # "Smart" domain-specific components
    /batches                # e.g., BatchTable.tsx, BatchStatusForm.tsx
    /telemetry              # e.g., TemperatureChart.tsx
/lib                        # Shared utilities (Zod schemas, date formatting)
/hooks                      # React hooks (e.g., useOfflineSync, useMobile)
/store                      # Offline-first state / Dexie.js setup
```

**Reasoning:** Keeping feature-specific components (`/features/batches`) alongside their domain logic prevents the global `/components` folder from becoming a junkyard and makes the codebase predictable for new engineers.

---

### 2. Server vs. Client Component Strategy

We enforce a strong boundary between server and client to maximize performance and simplify data fetching.

*   **Server Components (Default):** All page components (`page.tsx`) and layouts are React Server Components (RSCs). They are responsible for securely fetching data via Supabase and passing it downward.
*   **Client Components (Leaves only):** The `'use client'` directive is strictly reserved for components requiring interactivity (tables with sorting, forms, real-time charts).
*   **The "Provider" Pattern:** Client components receive cleanly parsed JSON data from the RSCs as `initialData`. They then take over for local state mutations, optimistic updates, and offline caching.

---

### 3. Operational Dashboard UX & Mobile Strategy

**Industrial UX Principles:**
*   **Function over Form:** Avoid unnecessary gradients, soft drop-shadows, or excessive animations. Interfaces must look like precision instruments.
*   **High Data Density:** Operational screens (like the Incubator Matrix) should show maximum critical data without requiring scrolling. Use compact table variants and monospaced fonts for tabular data.

**Mobile Strategy (PWA Context):**
*   Farm workers use tablets and phones. All tables must fail gracefully to card-based list views on screens `< 768px`.
*   Touch targets for buttons and form fields must be at least `44px` tall on mobile to prevent fat-finger errors in agricultural environments.

---

### 4. Form Architecture & Offline-Aware States

All forms must adhere to a strict envelope of consistency:
1.  **Architecture:** `react-hook-form` bound with `@hookform/resolvers/zod`.
2.  **Shared Schemas:** The Zod schema used on the client is the exact same one used in the Server Action to guarantee identical validation.
3.  **Offline State Indication:** 
    *   Forms must detect network status (`navigator.onLine`).
    *   If offline, the Submit button changes to "Save Locally (Sync Later)" with an Amber icon.
    *   Pending unsynced records display a subtle animated "cloud-upload" icon next to their table row until synchronization resolves.

---

### 5. Design Tokens, Typography, and Spacing

We lean on Tailwind CSS, avoiding custom CSS files entirely.

*   **Typography:**
    *   `Inter` (sans-serif) for all UI, labels, and prose.
    *   `JetBrains Mono` (monospace) strictly for serial numbers, batch IDs, MAC addresses, and sensor readings to ensure decimal points align vertically.
*   **Color Scale:**
    *   Neutral: `gray` scale for layout, borders, and text hierarchy.
    *   Primary: `blue` for primary operational actions (e.g., "Save", "Create").
*   **Spacing:** Strict adherence to 4pt/8pt grid (`p-2`, `p-4`, `p-6`). No arbitrary pixel values (e.g., never use `padding: 13px`).

---

### 6. Status Badge & Workflow System

Statuses are semantic indicators of operational health. They must follow a strict, unified color code across the entire application:

*   **`slate` (Neutral/Pending):** `LOGGED`, `PENDING`
*   **`blue` (Active/Normal):** `SETTER`, `ACTIVE`, `RUNNING`
*   **`amber` (Action Required/Warning):** `HATCHER`, `MAINTENANCE`, `STANDBY`
*   **`emerald` (Success/Complete):** `COMPLETED`, `PAID`, `FULFILLED`
*   **`red` (Critical/Failed):** `DISCARDED`, `FAULT`, `CANCELLED`

*Rule:* Never use red for a normal state transition; reserve it exclusively for alerts, errors, or losses.

---

### 7. Optimistic UI & Error Patterns

**Optimistic Updates:**
When a worker marks a mortality, the UI must update instantly (assuming success). The API call happens in the background. If the Supabase API call fails, the UI rolls back, and a high-priority Error Toast is triggered.

**Error Handling UX:**
*   Never show raw JSON or stack traces to a user.
*   "Non-blocking" errors (e.g., "Failed to fetch latest weather") trigger subtle corner toasts.
*   "Blocking" errors (e.g., "Your offline limit has been reached") render inline Alert banners or full-screen Error Boundaries to prevent corrupted data entry.

---

### 8. Loading & Skeleton Patterns

*   **Avoid Spinner Purgatory:** Do not use full-page loading spinners.
*   **Skeleton Grids:** Use predictable Skeleton components (via `shadcn/ui/skeleton`) that match the exact shape of the data being loaded (e.g., a skeleton table with 5 rows).
*   **Action Loaders:** Buttons must enter an `isLoading` disabled state with an inline spinner during mutations to prevent double-submissions.

---

### 9. Accessibility (a11y) Standards

*   **Keyboard Navigation:** All complex components (Dialogs, Select dropdowns) must be fully navigable without a mouse. (shadcn/ui covers this baseline).
*   **Contrast:** Text contrast must pass WCAG AA standards. Gray-on-gray text must be `text-gray-500` against `bg-white` at bare minimum.
*   **ARIA Labels:** Icon-only buttons must have descriptive `aria-label` properties.

---

### 10. State Management Recommendations

Avoid global state managers like Redux or Zustand unless absolutely necessary for deeply nested, rapidly changing client state.
*   **URL State:** Use query parameters for table filtering, sorting, and pagination (`?status=HATCHER&sort=date`). This ensures deep-linking and easy browser history navigation.
*   **Server State:** React Server Components + Server Actions handle primary data flow.
*   **Offline State:** `Dexie.js` (IndexedDB wrap) serves as the persistent local cache and sync queue engine.

---

### 11. Notification & Audit Visualization Architecture

*   **Toasts:** Used strictly for rapid feedback on user-initiated actions (e.g., "Batch 004 created").
*   **Real-time Alerts:** Sensor warnings utilize a persistent Topbar notification center with an unread badge.
*   **Audit Visualization (Timelines):** For batch histories or mortality logs, use a vertical Timeline component pattern (using border-left) to visually thread lifecycle events, showing *Who*, *What*, and *When* monotonically.
