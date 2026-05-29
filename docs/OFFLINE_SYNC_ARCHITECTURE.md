# Abby Tech Smart Hatchery Platform
## PWA & Offline Synchronization Architecture

This document defines the offline-first engineering architecture for the Abby Tech Smart Hatchery Platform. Due to the high probability of intermittent internet and power instability in Kenyan agricultural environments, the application is built securely around an offline-first, optimistic synchronization engine utilizing Next.js, Service Workers, and Dexie.js (IndexedDB).

---

### 1. Dexie.js Local Database Structure

The `Dexie.js` database acts as the single source of truth when the device is disconnected. It mirrors the critical operational data and manages the mutation queue.

**Local Database: `abbyTechLocalDB`**
*   **`local_batches`**: Cached mirror of active incubation batches. Useful for offline reads.
*   **`local_incubators`**: Cached state of incubator metrics and statuses.
*   **`sync_queue`**: The core mutation ledger. Every offline action is serialized here.
*   **`offline_blobs`**: Dedicated table for storing image files (e.g., mortality evidence) before they can be uploaded to Supabase Storage.

**Sync Queue Schema Model:**
```typescript
interface SyncQueueItem {
  id: string; // UUIDv4 generated on the client
  operation: 'LOG_MORTALITY' | 'UPDATE_BATCH_STATUS' | 'RECORD_MANUAL_TELEMETRY';
  payload: any; // The JSON payload for the Supabase RPC
  status: 'PENDING' | 'SYNCING' | 'REJECTED_CONFLICT' | 'FATAL_ERROR';
  blob_ref_id?: string; // Links to offline_blobs if attachment exists
  priority: number; // 1 (Highest) to 3 (Lowest)
  retry_count: number;
  created_at: string;
}
```

### 2. Service Worker & PWA Installability Strategy

*   **PWA Installability**: A standard `manifest.json` provides application identity (icons, theme colors, standalone display mode). This allows field workers to install Abby Tech directly to their Android/iOS home screens, removing browser chrome and acting like a native app.
*   **App Shell Precaching**: We utilize Workbox (via Next.js PWA plugins) to precache the core React App Shell, CSS, and critical JS chunks.
*   **Navigation Fallback**: If a worker navigates to `/batches` while offline and the SSR request fails, the Service Worker intercepts and serves the precached App Shell, allowing Dexie.js to render the UI.

### 3. Queue Management & Prioritization

When `navigator.onLine` fires, or via a periodic background heartbeat, the `SyncEngine` kicks in asynchronously.

1.  **Read Queue**: Fetch all `PENDING` items, ordered by `priority` ASC, then `created_at` ASC.
    *   *Priority 1*: File Uploads (Prerequisites for database rows).
    *   *Priority 2*: Mortality Logs and Inventory deductions.
    *   *Priority 3*: Low-priority manual telemetry buffering.
2.  **Locking**: Mark items as `SYNCING` to prevent duplicate processing if another sync cycle triggers.
3.  **Execution**: Process items serially (to maintain chronological integrity and prevent race conditions).

### 4. Background Synchronization & Attachment Workflows

Photos (attachments) add complexity because database rows cannot be created without the uploaded file URL.

**The Attachment Sync Flow:**
1.  Worker captures mortality photo while offline. Stored as a `Blob` in Dexie `offline_blobs`.
2.  Queue registers a `SyncQueueItem` with `blob_ref_id`.
3.  *Sync Triggered*:
4.  Engine reads the `Blob`.
5.  Uploads `Blob` to Supabase Storage (`mortality_evidence` bucket).
6.  Retrieves the persistent public/signed URL.
7.  Injects the URL into the `SyncQueueItem.payload.photo_url`.
8.  Executes the Supabase RPC standard write.
9.  Deletes the local `Blob`.

### 5. Conflict Resolution Logic

We use **Server Authority with Version Vectors**.
1.  **Version Checking**: Every `egg_batch` fetched has a `sync_version` (integer).
2.  **Mutation Payload**: An offline mutation payload includes `expected_version: X`.
3.  **Server Evaluation**: The Supabase RPC evaluates the payload.
    *   If `current_db_version == expected_version`: Success. Version becomes `X + 1`.
    *   If `current_db_version > expected_version`: **Conflict Detected**.
4.  **Client Resolution**: The RPC returns a HTTP 409 Conflict. The `SyncEngine` marks the queue item as `REJECTED_CONFLICT`. The UI displays a persistent alert banner requiring the Manager or Worker to review the conflicting states and manually re-submit.

### 6. Optimistic Updates & Local Audit Buffering

*   **Optimistic Flow**: When a worker clicks "Save Mortality", the UI does NOT wait for the network.
    1. It deducts the batch quantity in the active React state.
    2. It writes the updated locally cached batch to `local_batches`.
    3. It registers the action in `sync_queue`.
*   **Audit Buffering**: Even if the network is online, operations are written to the `sync_queue` *first*, and then immediately processed. This ensures that a sudden network drop mid-request does not leave the UI in an indeterminate state.

### 7. Retry & Failure Recovery Flows

Network in agricultural zones drops intermittently. API calls will fail.
*   **Transient Errors (HTTP 500, 502, 503, Network Drop)**:
    *   The `retry_count` increments.
    *   Status reverts to `PENDING`.
    *   Exponential backoff logic applies (e.g., wait 5s, 15s, 60s, 5m).
*   **Fatal Errors (HTTP 400 Bad Request, 403 Forbidden)**:
    *   The payload is fundamentally invalid or unauthorized.
    *   Status shifts to `FATAL_ERROR`.
    *   Queue halts logic on this item. A red badge appears in the UI notifying the admin of a stranded operation.

### 8. Offline Authentication Persistence

*   **Session Caching**: Supabase Auth automatically caches the JWT in `localStorage` / cookies.
*   **Offline Security Protocol**:
    *   If the app is opened offline, Next.js Middleware cannot verify the token server-side. The Service Worker must bypass server rendering and serve the App Shell.
    *   The client-side Supabase client uses the cached JWT.
    *   If the JWT expires while offline (e.g., after 24 hours), the worker *cannot* sync or make new authoritative reads. *However*, we allow them to continue logging queue mutations stamped with their last known `user_id`, trusting the eventual server validation to reject it if their account has been revoked.

### 9. Data Hydration Strategies

*   **Cold Boot (Online)**: Next.js SSR fetches the absolute truth, caches it seamlessly into Dexie via a background `useEffect`, and paints the UI.
*   **Cold Boot (Offline)**: Service Worker loads the App Shell. React mounts, detects `offline`, and hydrates the UI context entirely from `Dexie.local_batches`.

### 10. Manual Telemetry Buffering Fallback

If the automated ESP32/MQTT pipeline fails (e.g., incubator sensor physically breaks), workers manually read thermometers and punch data into the UI.
*   **Flow**: These manual readings bypass the high-speed TimescaleDB ingestion API temporarily. They sit in the `sync_queue` just like any other business operation, prioritizing durability over speed.
